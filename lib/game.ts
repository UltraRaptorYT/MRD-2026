import type { AnswerZone, Difficulty, GameSnapshot, PlayerZone, SimulatedPlayer } from "@/lib/types";
import { getQuestion, selectQuestions } from "@/lib/questions";

export const GAME_STORAGE_KEY = "mrd-quiz-game-v1";
export const GAME_CHANNEL = "mrd-quiz-live-v1";
export const answerZones: AnswerZone[] = ["A", "B", "C"];

export function makePlayers(count: number): SimulatedPlayer[] {
  return Array.from({ length: count }, (_, index) => ({ id: index + 1, zone: "uncertain", confidence: 0.92, status: "active" }));
}

export function createInitialGame(): GameSnapshot {
  return { phase: "idle", difficulty: "easy", score: 0, questionIndex: 0, questionIds: [], countdown: 10, players: makePlayers(3), lastAward: null, updatedAt: Date.now() };
}

export function beginGame(difficulty: Difficulty, players: SimulatedPlayer[]): GameSnapshot {
  return { phase: "question", difficulty, score: 0, questionIndex: 0, questionIds: selectQuestions(difficulty).map((question) => question.id), countdown: 10, players, lastAward: null, updatedAt: Date.now() };
}

export const currentQuestion = (game: GameSnapshot) => getQuestion(game.questionIds[game.questionIndex]);
export const correctZone = (game: GameSnapshot): AnswerZone | undefined => {
  const question = currentQuestion(game);
  return question ? answerZones[question.correctAnswer] : undefined;
};

export function zoneCounts(players: SimulatedPlayer[]) {
  return players.reduce((counts, player) => { counts[player.zone] += 1; return counts; }, { A: 0, B: 0, C: 0, uncertain: 0 } as Record<PlayerZone, number>);
}

export const canLock = (game: GameSnapshot) => game.players.length > 0 && game.players.every((player) => player.status === "active" && player.zone !== "uncertain");
export const lockAnswer = (game: GameSnapshot): GameSnapshot => canLock(game) ? { ...game, phase: "locked", countdown: 0, updatedAt: Date.now() } : { ...game, phase: "hold", countdown: 0, updatedAt: Date.now() };

export function revealAnswer(game: GameSnapshot): GameSnapshot {
  const correct = correctZone(game);
  const award = correct && game.players.every((player) => player.zone === correct) ? 10 : 0;
  return { ...game, phase: "reveal", score: game.score + award, lastAward: award, updatedAt: Date.now() };
}

export function nextQuestion(game: GameSnapshot): GameSnapshot {
  const nextIndex = game.questionIndex + 1;
  if (nextIndex >= game.questionIds.length) return { ...game, phase: "results", updatedAt: Date.now() };
  return { ...game, phase: "question", questionIndex: nextIndex, countdown: 10, lastAward: null, players: game.players.map((player) => ({ ...player, zone: "uncertain", confidence: 0.92, status: "active" })), updatedAt: Date.now() };
}
