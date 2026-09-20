import { expect, test } from "@playwright/test";

test.use({
  permissions: ["camera"],
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
});

test("camera loads the real pose model and supports four-corner calibration", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(page.getByText("Tracking live", { exact: true })).toBeVisible({ timeout: 90000 });
  expect(await page.locator("video").evaluate(video => (video as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Calibrate 3×3 grid", exact: true }).click();
  const grid = page.getByLabel("Live 3 by 3 floor grid");
  const bounds = (await grid.boundingBox())!;
  for (const [x, y] of [[0.15, 0.35], [0.85, 0.35], [0.95, 0.95], [0.05, 0.95]]) {
    await grid.click({ position: { x: x * bounds.width, y: y * bounds.height } });
  }
  await expect(page.getByText("Setup saved on this device.")).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mrd-settings-v4")!).floor.length)).toBe(4);
  await expect(page.locator(".floor-overlay polygon")).toHaveCount(9);
  await page.getByRole("button", { name: "Reset game", exact: true }).click();
  await expect(page.getByText("Tracking live", { exact: true })).toBeVisible();
});
