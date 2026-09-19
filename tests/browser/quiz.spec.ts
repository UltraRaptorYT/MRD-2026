import { expect, test, type Page } from "@playwright/test";
import bank from "../../data/questions.json";

async function setupDemo(page: Page, overrides = {}) {
  await page.clock.install();
  await page.addInitScript((custom) => localStorage.setItem("mrd-settings-v2", JSON.stringify({ joinSeconds: 3, voteSeconds: 5, answerSeconds: 5, revealSeconds: 2, photoSeconds: 3, resultsSeconds: 5, handHoldMs: 300, choiceHoldMs: 200, ...custom })), overrides);
  await page.goto("/");
  await page.getByLabel("Try without a camera").check();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
}
async function buzzer(page: Page) {
  const seconds = parseInt(await page.locator(".timer").innerText());
  await page.clock.runFor(seconds * 1000 + 100);
}

test("three-player full round, majority, individual scores, photo fallback, and next group", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await setupDemo(page);
  for (let id = 1; id <= 3; id++) {
    await page.getByLabel(`Player ${id} present`, { exact: true }).check();
    await page.getByLabel(`Player ${id} hand raised`, { exact: true }).check();
  }
  await page.clock.runFor(800);
  await expect(page.getByText("3 / 3 PLAYERS JOINED")).toBeVisible();
  await buzzer(page);
  await expect(page.getByRole("heading", { name: "Pick your difficulty." })).toBeVisible();
  await page.getByRole("button", { name: "Player 1 Left", exact: true }).click();
  await page.getByRole("button", { name: "Player 2 Left", exact: true }).click();
  await page.getByRole("button", { name: "Player 3 Right", exact: true }).click();
  await page.clock.runFor(400);
  await buzzer(page);
  const ids = new Set<string>();
  for (let round = 0; round < 5; round++) {
    await expect(page.locator(".round-meta")).toContainText(`QUESTION ${round + 1} / 5 · easy`);
    const heading = await page.locator(".question-heading h1").innerText();
    const question = bank.find(q => q.en.question === heading)!;
    ids.add(question.id);
    const options = await page.locator(".answer-option h2").allTextContents();
    const correct = options.indexOf(question.en.answers[question.correctAnswer]);
    expect(correct).toBeGreaterThanOrEqual(0);
    for (let id = 1; id <= 3; id++) {
      const col = id === 2 ? (correct + 1) % 3 : correct;
      await page.getByRole("button", { name: `Player ${id} ${["Left", "Middle", "Right"][col]}`, exact: true }).click();
    }
    await page.clock.runFor(400);
    await expect(page.locator(".player-lanes > div").nth(0)).toContainText(`${["Left", "Middle", "Right"][correct]} selected`);
    await buzzer(page);
    await expect(page.locator(".correct-answer")).toHaveCount(1);
    await expect(page.locator(".leaderboard article").filter({ hasText: "Player 1" })).toContainText(`${round + 1} / 5 correct`);
    await expect(page.locator(".leaderboard article").filter({ hasText: "Player 2" })).toContainText("0 / 5 correct");
    await buzzer(page);
  }
  expect(ids.size).toBe(5);
  await expect(page.getByRole("heading", { name: /Get together/ })).toBeVisible();
  await buzzer(page);
  await expect(page.getByRole("heading", { name: /Nice moves/ })).toContainText("P1 + P3 tie!");
  await expect(page.getByText("Demo finished. A live camera is needed for a real group photo.")).toBeVisible();
  await buzzer(page);
  await expect(page.getByRole("heading", { name: /Step in/ })).toBeVisible();
  await expect(page.getByLabel("Group leaderboard")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("solo join and no-movement reset honor configurable inactivity", async ({ page }) => {
  await setupDemo(page, { inactivitySeconds: 10, joinSeconds: 30 });
  await page.getByLabel("Player 3 present", { exact: true }).check();
  await page.getByLabel("Player 3 hand raised", { exact: true }).check();
  await page.clock.runFor(800);
  await expect(page.getByText("1 / 3 PLAYERS JOINED")).toBeVisible();
  await page.clock.runFor(11000);
  await expect(page.getByRole("heading", { name: /Step in/ })).toBeVisible();
  await expect(page.getByLabel("Player 3 present", { exact: true })).not.toBeChecked();
});

test("legacy routes combine into home and mobile layout fits", async ({ page }) => {
  await page.goto("/operator");
  await expect(page).toHaveURL(/\/\?setup=1$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: /Set up once/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto("/display");
  await expect(page).toHaveURL("http://localhost:3100/");
});
