import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

// The v1 path: describe a topic, build the course, clear a level, pass a lab, see the rewards, share it.
test.describe.configure({ mode: "serial" });

let course = "";

async function noErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

test("builds a course from a description", async ({ page, request }) => {
  await request.put("/api/inngest"); // register the job functions with the dev server
  const errors = await noErrors(page);
  await page.goto("/new");
  await page.getByRole("button", { name: /SOC analyst from zero/ }).click();
  await page.getByRole("button", { name: "Build my 3 options" }).click();
  await page.getByRole("button", { name: /Fast track/ }).click();
  await page.getByRole("button", { name: "Lock in this plan" }).click();
  await page.waitForURL(/\/course\/[0-9a-f-]{36}$/);
  course = new URL(page.url()).pathname;
  await page.getByRole("button", { name: "Build my course" }).click();
  await page.getByRole("button", { name: "Open the world map" }).click({ timeout: 150_000 });
  await expect(page.getByRole("heading", { name: "World map" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("clears level 1 and gets the XP for it", async ({ page }) => {
  await page.goto(`${course}/m/1`);
  await page.getByRole("radio").nth(1).click(); // the fixture's answer
  await page.getByRole("button", { name: /^Check$/ }).click();
  await page.getByRole("button", { name: /See result/ }).click();
  await expect(page.getByText("Perfect clear")).toBeVisible();
  await expect(page.getByText("+50 XP")).toBeVisible();
});

test("passes a terminal lab, graded by the server's replay", async ({ page }) => {
  await page.goto(`${course}/m/2`);
  const lab = page.locator("section", { has: page.getByRole("heading", { name: /Pull the attacker/ }) });
  const prompt = lab.getByLabel(/command/);
  await prompt.fill("mkdir case");
  await prompt.press("Enter");
  await lab.getByRole("button", { name: "Check my work" }).click();
  await expect(lab.getByText(/of 4 tests pass/)).toBeVisible();
  await prompt.fill("grep 'Failed password' /var/log/auth.log | cut -d' ' -f12 | sort -u > case/ips.txt");
  await prompt.press("Enter");
  await lab.getByRole("button", { name: "Check my work" }).click();
  await expect(lab.getByText("Lab cleared")).toBeVisible();
  await expect(lab.getByText(/\+\d+ XP/)).toBeVisible();
});

test("shows progress on the dashboard and pays a quest", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("First blood")).toBeVisible();
  const claim = page.getByRole("button", { name: "Claim +50" });
  await claim.click({ force: true }); // it pulses, so it never settles
  await expect(page.getByText("Claimed").first()).toBeVisible();
});

test("exports the course and imports it again", async ({ page }, info) => {
  await page.goto(course);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByText("Download .kustom").click()]);
  const file = info.outputPath("course.kustom");
  await download.saveAs(file);
  expect(JSON.parse(readFileSync(file, "utf8")).format).toBe("kustomlearn");
  await page.goto("/import");
  await page.locator("input[type=file]").setInputFiles(file);
  await page.waitForURL((u) => /\/course\//.test(u.pathname) && u.pathname !== course);
  await expect(page.getByRole("heading", { name: "World map" })).toBeVisible();
});
