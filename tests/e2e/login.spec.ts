import { expect, test } from "@playwright/test";

test("shows a protected login screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sistema de Inventário" })).toBeVisible();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page.getByLabel("Senha")).toBeVisible();
});

