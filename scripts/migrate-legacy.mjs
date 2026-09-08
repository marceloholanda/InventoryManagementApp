import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const apply = process.env.MIGRATION_APPLY === "true";
const required = ["LEGACY_FUNCTION_URL", "LEGACY_SUPABASE_ANON_KEY"];
if (apply) {
  required.push("NEW_SUPABASE_URL", "NEW_SUPABASE_SERVICE_ROLE_KEY", "OPERATOR_USER_ID");
}

for (const name of required) {
  if (!process.env[name]) throw new Error(`Variável obrigatória ausente: ${name}`);
}

const baseUrl = process.env.LEGACY_FUNCTION_URL.replace(/\/$/, "");
const legacyKey = process.env.LEGACY_SUPABASE_ANON_KEY;
const ownerId = process.env.OPERATOR_USER_ID;

async function readLegacy(path) {
  const response = await fetch(`${baseUrl}/${path}`, {
    headers: {
      apikey: legacyKey,
      Authorization: `Bearer ${legacyKey}`,
    },
  });
  if (!response.ok) throw new Error(`Falha ao exportar ${path}: HTTP ${response.status}`);
  return response.json();
}

function normalize(value) {
  return String(value ?? "").trim().toLocaleLowerCase("pt-BR");
}

const [{ produtos = [] }, { movimentacoes = [] }] = await Promise.all([
  readLegacy("produtos"),
  readLegacy("movimentacoes"),
]);

const productsByDescription = new Map();
const duplicateProducts = [];
for (const product of produtos) {
  const key = normalize(product.descricao);
  if (!key) continue;
  if (productsByDescription.has(key)) duplicateProducts.push(product.id);
  else productsByDescription.set(key, { ...product, newId: randomUUID() });
}

const calculatedBalances = new Map([...productsByDescription.keys()].map(key => [key, 0]));
const orphanMovements = [];
const validMovements = [];
for (const movement of movimentacoes) {
  const key = normalize(movement.descricao);
  const quantity = Number(movement.quantitativo);
  if (!productsByDescription.has(key)) {
    orphanMovements.push(movement.id);
    continue;
  }
  if (!Number.isInteger(quantity) || quantity <= 0 || !["entrada", "saida"].includes(movement.tipo)) {
    orphanMovements.push(movement.id);
    continue;
  }
  calculatedBalances.set(key, calculatedBalances.get(key) + (movement.tipo === "entrada" ? quantity : -quantity));
  validMovements.push({
    id: String(movement.id),
    key,
    description: String(movement.descricao).trim(),
    type: movement.tipo,
    quantity,
    happenedOn: movement.dataSaida ?? movement.dataEntrada ?? null,
    index: validMovements.length,
  });
}

function mapHistoryByFifo(key) {
  const events = validMovements
    .filter(movement => movement.key === key)
    .sort((left, right) => {
      const leftDate = Date.parse(left.happenedOn ?? "") || 0;
      const rightDate = Date.parse(right.happenedOn ?? "") || 0;
      if (leftDate !== rightDate) return leftDate - rightDate;

      // O sistema antigo usava Date.now() como id. Quando vários lançamentos
      // possuem somente a mesma data (sem horário), esse id preserva a ordem
      // real de registro; para outros formatos, mantém a ordem exportada.
      const leftId = Number(left.id);
      const rightId = Number(right.id);
      if (Number.isSafeInteger(leftId) && Number.isSafeInteger(rightId) && leftId !== rightId) {
        return leftId - rightId;
      }
      return left.index - right.index;
    });

  const availableEntries = [];
  const entries = [];
  const exits = [];
  const unmatchedExits = [];

  for (const event of events) {
    if (event.type === "entrada") {
      const entry = {
        movementId: event.id,
        happenedOn: event.happenedOn,
        quantity: event.quantity,
        remaining: event.quantity,
        consumedBy: [],
      };
      entries.push(entry);
      availableEntries.push(entry);
      continue;
    }

    let remainingToAllocate = event.quantity;
    const allocations = [];
    while (remainingToAllocate > 0 && availableEntries.length > 0) {
      const entry = availableEntries[0];
      const allocated = Math.min(entry.remaining, remainingToAllocate);
      entry.remaining -= allocated;
      remainingToAllocate -= allocated;
      entry.consumedBy.push({ movementId: event.id, quantity: allocated });
      allocations.push({ entryMovementId: entry.movementId, quantity: allocated });
      if (entry.remaining === 0) availableEntries.shift();
    }
    const exit = {
      movementId: event.id,
      happenedOn: event.happenedOn,
      quantity: event.quantity,
      allocations,
      unmatchedQuantity: remainingToAllocate,
    };
    exits.push(exit);
    if (remainingToAllocate > 0) unmatchedExits.push(exit);
  }

  return { entries, exits, unmatchedExits };
}

const discrepancies = [];
for (const [key, product] of productsByDescription) {
  const calculated = calculatedBalances.get(key);
  const stored = Number(product.quantitativo);
  if (calculated !== stored) {
    discrepancies.push({
      legacyProductId: product.id,
      description: product.descricao,
      storedQuantity: stored,
      calculatedQuantity: calculated,
      difference: stored - calculated,
    });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  mode: apply ? "apply" : "dry-run",
  productsFound: produtos.length,
  movementsFound: movimentacoes.length,
  duplicateProducts,
  orphanMovements,
  discrepancies,
  historyMapping: [...productsByDescription.entries()].map(([key, product]) => ({
    legacyProductId: product.id,
    description: product.descricao,
    storedQuantity: Number(product.quantitativo),
    calculatedQuantity: calculatedBalances.get(key),
    ...mapHistoryByFifo(key),
  })),
};

await writeFile("migration-report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");

const hasUnmatchedExits = report.historyMapping.some(item => item.unmatchedExits.length > 0);
if (duplicateProducts.length || orphanMovements.length || hasUnmatchedExits) {
  console.error("Migração bloqueada: confira migration-report.json e corrija os registros sem correspondência.");
  process.exitCode = 2;
} else if (!apply) {
  console.log("Conferência concluída. Os saldos de destino serão recalculados a partir do histórico.");
} else {
  const admin = createClient(
    process.env.NEW_SUPABASE_URL,
    process.env.NEW_SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { count, error: countError } = await admin
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId);
  if (countError) throw countError;
  if (count) throw new Error("O destino já contém produtos para esta operadora; a importação foi cancelada.");

  const productRows = [...productsByDescription.entries()].map(([key, product]) => ({
    id: product.newId,
    owner_id: ownerId,
    legacy_id: String(product.id),
    description: String(product.descricao).trim(),
    invoice_number: product.notaFiscal || null,
    // O saldo legado era atualizado de forma independente e não refletia
    // saídas já registradas. A nova base usa exclusivamente o histórico.
    quantity: calculatedBalances.get(key),
    low_stock_limit: Number(product.limiteEstoqueBaixo) || 10,
    responsible: product.responsavel || null,
    first_entry_date: product.dataEntrada || null,
  }));
  const { error: productError } = await admin.from("products").insert(productRows);
  if (productError) throw productError;

  const movementRows = movimentacoes.map(movement => {
    const product = productsByDescription.get(normalize(movement.descricao));
    const quantity = Number(movement.quantitativo);
    return {
      owner_id: ownerId,
      product_id: product.newId,
      legacy_id: String(movement.id),
      movement_type: movement.tipo,
      quantity,
      delta: movement.tipo === "entrada" ? quantity : -quantity,
      happened_on: movement.dataSaida,
      description_snapshot: String(movement.descricao).trim(),
      invoice_number: movement.notaFiscal || null,
      responsible: movement.responsavel || "Migração",
      reason: "Importado do sistema anterior",
    };
  });
  const { error: movementError } = await admin.from("inventory_movements").insert(movementRows);
  if (movementError) {
    const importedIds = productRows.map(product => product.id);
    const { error: cleanupError } = await admin.from("products").delete().in("id", importedIds);
    if (cleanupError) {
      throw new AggregateError(
        [movementError, cleanupError],
        "A importaÃ§Ã£o das movimentaÃ§Ãµes falhou e a limpeza automÃ¡tica tambÃ©m falhou.",
      );
    }
    throw movementError;
  }

  console.log(`Migração concluída: ${productRows.length} produtos e ${movementRows.length} movimentações.`);
}
