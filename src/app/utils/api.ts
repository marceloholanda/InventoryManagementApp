import { z } from "zod";
import { supabase } from "../lib/supabase";
import type { Movimentacao, NovaMovimentacao, Produto } from "../types";

const productRowSchema = z.object({
  id: z.string().uuid(),
  description: z.string(),
  invoice_number: z.string().nullable(),
  quantity: z.number().int().nonnegative(),
  low_stock_limit: z.number().int().positive(),
  responsible: z.string().nullable(),
  first_entry_date: z.string().nullable(),
});

const movementRowSchema = z.object({
  id: z.string().uuid(),
  product_id: z.string().uuid(),
  happened_on: z.string(),
  description_snapshot: z.string(),
  quantity: z.number().int().positive(),
  movement_type: z.enum(["entrada", "saida", "estorno"]),
  invoice_number: z.string().nullable(),
  responsible: z.string(),
  reason: z.string().nullable(),
  corrected_at: z.string().nullable(),
  related_movement_id: z.string().uuid().nullable(),
});

function unwrap<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("O servidor não retornou os dados esperados.");
  return data;
}

function mapProduct(row: z.infer<typeof productRowSchema>): Produto {
  return {
    id: row.id,
    dataEntrada: row.first_entry_date ?? "",
    descricao: row.description,
    notaFiscal: row.invoice_number ?? "",
    quantitativo: row.quantity,
    limiteEstoqueBaixo: row.low_stock_limit,
    responsavel: row.responsible ?? "",
  };
}

function mapMovement(row: z.infer<typeof movementRowSchema>): Movimentacao {
  return {
    id: row.id,
    productId: row.product_id,
    dataSaida: row.happened_on,
    descricao: row.description_snapshot,
    quantitativo: row.quantity,
    tipo: row.movement_type,
    notaFiscal: row.invoice_number ?? undefined,
    responsavel: row.responsible,
    motivo: row.reason ?? undefined,
    corrigida: Boolean(row.corrected_at),
    movimentoRelacionadoId: row.related_movement_id ?? undefined,
  };
}

export const api = {
  async getProdutos(): Promise<Produto[]> {
    const { data, error } = await supabase
      .from("products")
      .select("id, description, invoice_number, quantity, low_stock_limit, responsible, first_entry_date")
      .order("description");
    return productRowSchema.array().parse(unwrap(data, error)).map(mapProduct);
  },

  async getMovimentacoes(): Promise<Movimentacao[]> {
    const { data, error } = await supabase
      .from("inventory_movements")
      .select("id, product_id, happened_on, description_snapshot, quantity, movement_type, invoice_number, responsible, reason, corrected_at, related_movement_id")
      .order("created_at", { ascending: true });
    return movementRowSchema.array().parse(unwrap(data, error)).map(mapMovement);
  },

  async registrarMovimentacao(productId: string, movimento: NovaMovimentacao): Promise<void> {
    const { error } = await supabase.rpc("register_inventory_movement", {
      p_product_id: productId,
      p_movement_type: movimento.tipo,
      p_quantity: movimento.quantitativo,
      p_happened_on: movimento.dataSaida,
      p_responsible: movimento.responsavel,
      p_invoice_number: movimento.notaFiscal ?? null,
    });
    if (error) throw new Error(error.message);
  },

  async criarProdutoComEntrada(movimento: NovaMovimentacao): Promise<void> {
    const { error } = await supabase.rpc("create_product_with_initial_stock", {
      p_description: movimento.descricao,
      p_quantity: movimento.quantitativo,
      p_happened_on: movimento.dataSaida,
      p_responsible: movimento.responsavel,
      p_invoice_number: movimento.notaFiscal ?? null,
      p_low_stock_limit: movimento.limiteEstoqueBaixo ?? 10,
    });
    if (error) throw new Error(error.message);
  },

  async corrigirMovimentacao(
    movementId: string,
    newQuantity: number,
    reason: string,
    responsible: string,
  ): Promise<void> {
    const { error } = await supabase.rpc("correct_inventory_movement", {
      p_movement_id: movementId,
      p_new_quantity: newQuantity,
      p_reason: reason,
      p_responsible: responsible,
    });
    if (error) throw new Error(error.message);
  },

  async atualizarProduto(produto: Produto): Promise<void> {
    const { error } = await supabase
      .from("products")
      .update({
        description: produto.descricao.trim(),
        invoice_number: produto.notaFiscal.trim() || null,
        low_stock_limit: produto.limiteEstoqueBaixo,
        responsible: produto.responsavel.trim() || null,
        first_entry_date: produto.dataEntrada || null,
      })
      .eq("id", produto.id);
    if (error) throw new Error(error.message);
  },
};
