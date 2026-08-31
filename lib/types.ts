export type Difficulty = "easy" | "medium" | "hard";
export type AnswerZone = "A" | "B" | "C";
export type PlayerZone = AnswerZone | "uncertain";

export interface Question {
  id: string;
  difficulty: Difficulty;
  zh: { question: string; answers: [string, string, string] };
  en: { question: string; answers: [string, string, string] };
  correctAnswer: 0 | 1 | 2;
}

export type GamePhase = "idle" | "question" | "countdown" | "hold" | "locked" | "reveal" | "results";

export interface SimulatedPlayer {
  id: number;
  zone: PlayerZone;
  confidence: number;
  status: "active" | "temporarily-lost";
}

export interface GameSnapshot {
  phase: GamePhase;
  difficulty: Difficulty;
  score: number;
  questionIndex: number;
  questionIds: string[];
  countdown: number;
  players: SimulatedPlayer[];
  lastAward: 0 | 10 | null;
  updatedAt: number;
}

export interface Point { x: number; y: number; }
export type CalibrationZone = "PLAYER" | "READY" | AnswerZone;
export type Calibration = Record<CalibrationZone, Point[]>;
