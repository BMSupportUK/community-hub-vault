import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("Android menu opens repeatedly without crashing duplicate rail badges", async ({ page }) => {
  const sessionPath = join(homedir(), ".cache/lovable-auth/session.json");
  test.skip(!existsSync(sessionPath), "Requires a locally minted staff test session");
  const session = JSON.parse(readFileSync(sessionPath, "utf8"));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("after `subscribe()`")) errors.push(message.text());
  });
  await page.goto("/");
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [session.storage_key, JSON.stringify(session.session)]);
  await page.goto("/staff-portal");
  const menu = page.getByRole("button", { name: "Open navigation" });
  await expect(menu).toBeVisible();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await menu.tap();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Shop Orders", exact: true })).toBeVisible();
    await drawer.getByRole("button", { name: "Close", exact: true }).tap();
    await expect(drawer).toHaveCount(0);
  }
  await menu.tap();
  await page.getByRole("dialog").getByRole("link", { name: "Shift history", exact: true }).tap();
  await expect(page).toHaveURL(/\/shift-history$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});