import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import * as kv from "./kv_store.tsx";

const app = new Hono();

app.use("/*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
}));

// Cria a tabela automaticamente se não existir
async function ensureTable() {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) return;

    // Tenta criar via pg direto usando SUPABASE_DB_URL
    const dbUrl = Deno.env.get("SUPABASE_DB_URL");
    if (dbUrl) {
      // @ts-ignore
      const { default: postgres } = await import("https://deno.land/x/postgresjs@v3.4.5/mod.js");
      const sql = postgres(dbUrl, { ssl: "require", max: 1 });
      await sql`
        CREATE TABLE IF NOT EXISTS kv_store_6a5c4630 (
          key TEXT NOT NULL PRIMARY KEY,
          value JSONB NOT NULL
        )
      `;
      await sql.end();
      console.log("Tabela kv_store_6a5c4630 verificada/criada com sucesso.");
      return;
    }

    // Fallback: tenta verificar tabela via REST e captura o erro
    const res = await fetch(`${supabaseUrl}/rest/v1/kv_store_6a5c4630?limit=1`, {
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": serviceKey,
      },
    });

    if (!res.ok) {
      console.warn("Tabela ainda não existe. Execute o SQL de criação no dashboard do Supabase.");
    }
  } catch (err) {
    console.warn("ensureTable:", err);
  }
}

// Roda a verificação uma vez ao inicializar
ensureTable();

// ─── Health check ──────────────────────────────────────────────────────────

app.get("/make-server-6a5c4630/health", async (c) => {
  try {
    // Teste real: tenta acessar a tabela
    await kv.getByPrefix("__health__");
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error("Health check falhou:", error.message);
    return c.json({ status: "error", details: error.message }, 503);
  }
});

// ─── PRODUTOS ──────────────────────────────────────────────────────────────

app.get("/make-server-6a5c4630/produtos", async (c) => {
  try {
    const produtos = await kv.getByPrefix("produto:");
    produtos.sort((a: any, b: any) =>
      new Date(b.dataEntrada).getTime() - new Date(a.dataEntrada).getTime()
    );
    return c.json({ produtos, total: produtos.length });
  } catch (error: any) {
    console.error("Erro ao buscar produtos:", error.message);
    return c.json({ error: "Erro ao buscar produtos", details: error.message }, 500);
  }
});

app.post("/make-server-6a5c4630/produtos", async (c) => {
  try {
    const produto = await c.req.json();
    if (!produto.id || !produto.descricao) {
      return c.json({ error: "Campos obrigatórios: id, descricao" }, 400);
    }
    produto.quantitativo = Number(produto.quantitativo) || 0;
    produto.limiteEstoqueBaixo = Number(produto.limiteEstoqueBaixo) || 10;
    produto.updatedAt = new Date().toISOString();

    await kv.set(`produto:${produto.id}`, produto);
    return c.json({ success: true, produto });
  } catch (error: any) {
    console.error("Erro ao salvar produto:", error.message);
    return c.json({ error: "Erro ao salvar produto", details: error.message }, 500);
  }
});

app.post("/make-server-6a5c4630/produtos/batch", async (c) => {
  try {
    const { produtos } = await c.req.json();
    if (!Array.isArray(produtos)) {
      return c.json({ error: "Campo 'produtos' deve ser um array" }, 400);
    }
    const keys = produtos.map((p: any) => `produto:${p.id}`);
    const values = produtos.map((p: any) => ({
      ...p,
      quantitativo: Number(p.quantitativo) || 0,
      limiteEstoqueBaixo: Number(p.limiteEstoqueBaixo) || 10,
      updatedAt: new Date().toISOString(),
    }));
    await kv.mset(keys, values);
    return c.json({ success: true, total: produtos.length });
  } catch (error: any) {
    console.error("Erro ao salvar produtos em lote:", error.message);
    return c.json({ error: "Erro ao salvar produtos em lote", details: error.message }, 500);
  }
});

app.delete("/make-server-6a5c4630/produtos/:id", async (c) => {
  try {
    const id = c.req.param("id");
    await kv.del(`produto:${id}`);
    return c.json({ success: true, id });
  } catch (error: any) {
    console.error("Erro ao deletar produto:", error.message);
    return c.json({ error: "Erro ao deletar produto", details: error.message }, 500);
  }
});

// ─── MOVIMENTAÇÕES ──────────────────────────────────────────────────────────

app.get("/make-server-6a5c4630/movimentacoes", async (c) => {
  try {
    const movimentacoes = await kv.getByPrefix("movimentacao:");
    movimentacoes.sort((a: any, b: any) =>
      new Date(b.dataSaida).getTime() - new Date(a.dataSaida).getTime()
    );
    return c.json({ movimentacoes, total: movimentacoes.length });
  } catch (error: any) {
    console.error("Erro ao buscar movimentações:", error.message);
    return c.json({ error: "Erro ao buscar movimentações", details: error.message }, 500);
  }
});

app.post("/make-server-6a5c4630/movimentacoes", async (c) => {
  try {
    const movimentacao = await c.req.json();
    if (!movimentacao.id || !movimentacao.descricao || !movimentacao.tipo) {
      return c.json({ error: "Campos obrigatórios: id, descricao, tipo" }, 400);
    }
    if (!["entrada", "saida"].includes(movimentacao.tipo)) {
      return c.json({ error: "Tipo deve ser 'entrada' ou 'saida'" }, 400);
    }
    movimentacao.quantitativo = Number(movimentacao.quantitativo) || 0;
    movimentacao.createdAt = new Date().toISOString();

    await kv.set(`movimentacao:${movimentacao.id}`, movimentacao);
    return c.json({ success: true, movimentacao });
  } catch (error: any) {
    console.error("Erro ao salvar movimentação:", error.message);
    return c.json({ error: "Erro ao salvar movimentação", details: error.message }, 500);
  }
});

app.delete("/make-server-6a5c4630/movimentacoes/:id", async (c) => {
  try {
    const id = c.req.param("id");
    await kv.del(`movimentacao:${id}`);
    return c.json({ success: true, id });
  } catch (error: any) {
    console.error("Erro ao deletar movimentação:", error.message);
    return c.json({ error: "Erro ao deletar movimentação", details: error.message }, 500);
  }
});

Deno.serve(app.fetch);
