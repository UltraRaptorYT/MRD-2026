import assert from "node:assert/strict";
import test from "node:test";
import { createGame, currentQuestion, leaderboard, observeGame, resolveVote, shuffleAnswers, tickGame } from "../lib/game";
import { defaults, sanitizeSettings } from "../lib/settings";
import { questions } from "../lib/questions";
import type { Choice, Game, Observation, Player } from "../lib/types";

const settings = { ...defaults, handHoldMs: 300, choiceHoldMs: 200 };
const pose = (id = 1, row: Choice = 0, choice: Choice | null = 1, raised = true): Observation => ({ id, row, choice, raised, foot: { x: 0.5, y: 0.5 }, landmarks: [] });
const player = (id: number, choice: Choice | null): Player => ({ id, trackId: id, row: (id - 1) as Choice, choice, candidate: choice, candidateSince: 0, lastSeen: 1000, present: true, correct: 0, score: 0, lastCorrect: null });

test("joining requires a continuous raised hand, respects one per row and max three", () => {
  let game = observeGame(createGame(0, "one"), [pose()], true, 100, settings);
  game = observeGame(game, [pose(1, 0, 1, false)], false, 250, settings);
  game = observeGame(game, [pose()], false, 300, settings);
  assert.equal(game.phase, "idle");
  game = observeGame(game, [pose()], false, 650, settings);
  assert.equal(game.phase, "joining");
  assert.equal(game.players.length, 1);
  const crowded = [pose(), pose(2, 1), pose(3, 1), pose(4, 2)];
  game = observeGame(game, crowded, true, 700, settings);
  game = observeGame(game, crowded, false, 1100, settings);
  assert.deepEqual(game.players.map(p => p.id), [1, 3]);
  game = observeGame(game, [pose(), pose(2, 1), pose(4, 2)], false, 1200, settings);
  game = observeGame(game, [pose(), pose(2, 1), pose(4, 2)], false, 1600, settings);
  assert.equal(game.players.length, 3);
});

test("absent joiners are removed and empty groups return to idle", () => {
  const game: Game = { ...createGame(0, "x"), phase: "joining", deadline: 1000, players: [{ ...player(1, null), present: false }] };
  assert.equal(tickGame(game, 1000, settings, () => "new").phase, "idle");
});

test("majority, tied choices only, abstention, and absent votes", () => {
  assert.equal(resolveVote([player(1, 0), player(2, 0), player(3, 2)]).difficulty, "easy");
  assert.equal(resolveVote([player(1, 0), player(2, 2)], () => 0.99).difficulty, "hard");
  assert.equal(resolveVote([player(1, 0), player(2, 1), player(3, 2)], () => 0.4).difficulty, "medium");
  assert.equal(resolveVote([{ ...player(1, 2), present: false }, player(2, null)]).difficulty, "easy");
});

test("choice must settle, boundaries and lost/ambiguous tracks clear it", () => {
  let game: Game = { ...createGame(0, "x"), phase: "question", deadline: 10000, players: [player(1, null)] };
  game = observeGame(game, [pose(1, 0, 2)], true, 1000, settings);
  assert.equal(game.players[0].choice, null);
  game = observeGame(game, [pose(1, 0, 2)], false, 1250, settings);
  assert.equal(game.players[0].choice, 2);
  game = observeGame(game, [pose(1, 0, null)], false, 1300, settings);
  assert.equal(game.players[0].choice, null);
  game = observeGame(game, [pose(1, 0, 2)], false, 1350, settings);
  game = observeGame(game, [pose(1, 0, 2)], false, 1600, settings);
  game = observeGame(game, [pose(1, 0, 2), pose(2, 0, 1)], false, 1700, settings);
  assert.equal(game.players[0].present, false);
  assert.equal(game.players[0].choice, null);
  game = observeGame(game, [pose(99, 0, 2)], false, 1800, settings);
  assert.equal(game.players[0].present, false, "replacement track must not inherit the player");
});

test("late frames cannot change answers after the buzzer", () => {
  const game: Game = { ...createGame(0, "x"), phase: "question", deadline: 2000, players: [player(1, 0)] };
  assert.equal(observeGame(game, [pose(1, 0, 2)], true, 2100, settings), game);
});

test("five random questions, independent awards, photo, results, and automatic reset", () => {
  let game: Game = { ...createGame(0, "x"), phase: "voting", deadline: 1000, players: [player(1, 0), player(2, 0), player(3, 2)] };
  game = tickGame(game, 1000, settings);
  assert.equal(game.difficulty, "easy");
  assert.equal(new Set(game.questions.map(q => q.id)).size, 5);
  let now = 1000;
  for (let i = 0; i < 5; i++) {
    assert.equal(game.phase, "question");
    const correct = currentQuestion(game).correctAnswer;
    now = game.deadline!;
    game = { ...game, players: game.players.map((p, index) => ({ ...p, present: index !== 2, lastSeen: now, choice: index === 1 ? ((correct + 1) % 3) as Choice : correct })) };
    game = tickGame(game, now, settings);
    assert.equal(game.phase, "reveal");
    assert.deepEqual(game.players.map(p => p.score), [(i + 1) * 10, 0, 0]);
    const again = tickGame(game, now, settings);
    assert.deepEqual(again.players, game.players, "reveal must not award twice");
    now = game.deadline!; game = tickGame(game, now, settings);
  }
  assert.equal(game.phase, "photo");
  assert.equal(game.players[0].correct, 5);
  now = game.deadline!; game = tickGame(game, now, settings);
  assert.equal(game.phase, "results");
  assert.equal(game.deadline, now + 45000);
  game = tickGame(game, game.deadline!, settings, () => "next-group");
  assert.equal(game.phase, "idle");
  assert.equal(game.sessionId, "next-group");
  assert.equal(game.players.length, 0);
});

test("shuffling keeps correct translations aligned without changing the bank", () => {
  const original = questions[0];
  const copy = structuredClone(original);
  const shuffled = shuffleAnswers(original, () => 0);
  assert.equal(shuffled.en.answers[shuffled.correctAnswer], original.en.answers[original.correctAnswer]);
  assert.equal(shuffled.zh.answers[shuffled.correctAnswer], original.zh.answers[original.correctAnswer]);
  assert.deepEqual(original, copy);
  assert.notDeepEqual(shuffled.en.answers, original.en.answers);
});

test("no movement resets every active phase, presence alone does not refresh activity", () => {
  for (const phase of ["joining", "voting", "question", "reveal", "photo", "results"] as const) {
    const game: Game = { ...createGame(0, "x"), phase, deadline: 999999 };
    assert.equal(tickGame(game, 300000, settings, () => "reset").phase, "idle");
  }
  let game: Game = { ...createGame(0, "x"), phase: "joining", deadline: 999999, players: [player(1, null)] };
  game = observeGame(game, [pose()], false, 299999, settings);
  assert.equal(game.lastMovement, 0);
  assert.equal(tickGame(game, 300000, settings, () => "reset").phase, "idle");
  game = observeGame(game, [pose()], true, 299999, settings);
  assert.equal(tickGame(game, 300000, settings).phase, "joining");
});

test("shared ranks and validated settings", () => {
  assert.deepEqual(leaderboard([{ ...player(1, null), correct: 3 }, { ...player(2, null), correct: 3 }, player(3, null)]).map(p => p.rank), [1, 1, 3]);
  const settings = sanitizeSettings({ inactivitySeconds: -10, confidence: NaN, mirror: "yes", floor: [{ x: 0, y: 0 }] });
  assert.equal(settings.inactivitySeconds, 10);
  assert.equal(settings.confidence, defaults.confidence);
  assert.deepEqual(settings.floor, defaults.floor);
});
