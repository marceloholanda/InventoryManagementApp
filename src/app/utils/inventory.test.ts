import { describe, expect, it } from "vitest";
import { movementDelta, normalizeDescription, quantityAfterCorrection } from "./inventory";

describe("inventory rules", () => {
  it("normalizes product descriptions for matching", () => {
    expect(normalizeDescription("  Teclado MECÂNICO ")).toBe("teclado mecânico");
  });

  it("represents entries and exits with opposite deltas", () => {
    expect(movementDelta("entrada", 8)).toBe(8);
    expect(movementDelta("saida", 3)).toBe(-3);
  });

  it("adjusts an entry correction by the net difference", () => {
    expect(quantityAfterCorrection(12, "entrada", 10, 7)).toBe(9);
  });

  it("adjusts an exit correction by the net difference", () => {
    expect(quantityAfterCorrection(12, "saida", 4, 7)).toBe(9);
  });

  it("rejects a correction that would make stock negative", () => {
    expect(() => quantityAfterCorrection(2, "saida", 1, 4)).toThrow("estoque negativo");
  });
});

