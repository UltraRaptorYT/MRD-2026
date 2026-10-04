import { expect, test } from "@playwright/test";

test("legacy routes combine into home and mobile layout fits", async ({ page }) => {
  await page.goto("/operator");
  await expect(page).toHaveURL(/\/?setup=1$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: /Set up once/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto("/display");
  await expect(page).toHaveURL(/\/$/);
});
