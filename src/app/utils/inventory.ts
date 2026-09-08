import type { TipoMovimentacao } from "../types";

export function normalizeDescription(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR");
}

export function movementDelta(type: Exclude<TipoMovimentacao, "estorno">, quantity: number): number {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("A quantidade deve ser um inteiro maior que zero.");
  }
  return type === "entrada" ? quantity : -quantity;
}

export function quantityAfterCorrection(
  currentQuantity: number,
  originalType: Exclude<TipoMovimentacao, "estorno">,
  originalQuantity: number,
  newQuantity: number,
): number {
  const result = currentQuantity
    - movementDelta(originalType, originalQuantity)
    + movementDelta(originalType, newQuantity);
  if (result < 0) throw new Error("A correção deixaria o estoque negativo.");
  return result;
}

