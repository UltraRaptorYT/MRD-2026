import { expect, test } from "@playwright/test";

test.use({
  permissions: ["camera"],
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
});

test("camera loads the real pose model and supports straight rectangular calibration", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expect(page.getByText("Tracking live", { exact: true })).toBeVisible({ timeout: 90000 });
  expect(await page.locator("video").evaluate(video => (video as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Calibrate 3×3 grid", exact: true }).click();
  const grid = page.getByLabel("Live 3 by 3 floor grid");
  const bounds = (await grid.boundingBox())!;
  for (const [x, y] of [[0.15, 0.35], [0.85, 0.85]]) {
    await grid.click({ position: { x: x * bounds.width, y: y * bounds.height } });
  }
  await expect(page.getByText("Setup saved on this device.")).toBeVisible();
  const floor = await page.evaluate(() => JSON.parse(localStorage.getItem("mrd-settings-v5")!).floor);
  expect(floor).toHaveLength(4);
  expect(floor[0].y).toBe(floor[1].y);
  expect(floor[1].x).toBe(floor[2].x);
  expect(floor[2].y).toBe(floor[3].y);
  expect(floor[3].x).toBe(floor[0].x);
  await expect(page.locator(".floor-overlay polygon")).toHaveCount(9);
  await page.getByRole("button", { name: "Reset game", exact: true }).click();
  await expect(page.getByText("Tracking live", { exact: true })).toBeVisible();
});
