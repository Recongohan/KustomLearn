import { expect, test } from "@playwright/test";

// Phone layout: every main screen fits the width and the tab bar navigates.
for (const path of ["/", "/quests", "/ranks", "/trophies", "/new", "/import"]) {
  test(`${path} fits a phone`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).last()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("the tab bar navigates", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).last().getByRole("link", { name: "Ranks" }).click();
  await expect(page).toHaveURL(/\/ranks$/);
  await expect(page.getByRole("heading", { name: "Ranks", level: 1 })).toBeVisible();
});
