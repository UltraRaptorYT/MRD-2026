export type Difficulty = "easy" | "medium" | "hard";
export type Choice = 0 | 1 | 2;
export interface Point { x: number; y: number }
export type Floor = [Point, Point, Point, Point];
export interface Landmark extends Point { visibility?: number }
export interface Question {
  id: string;
  difficulty: Difficulty;
  zh: { question: string; answers: [string, string, string] };
  en: { question: string; answers: [string, string, string] };
  correctAnswer: Choice;
}
export interface Settings {
  joinSeconds: number;
  voteSeconds: number;
  answerSeconds: number;
  revealSeconds: number;
  photoSeconds: number;
  resultsSeconds: number;
  inactivitySeconds: number;
  motionThreshold: number;
  confidence: number;
  handMargin: number;
  handHoldMs: number;
  choiceHoldMs: number;
  lostSeconds: number;
  boundaryMargin: number;
  mirror: boolean;
  cameraId: string;
  floor: Floor;
}
export interface Observation {
  id: number;
  foot: Point;
  row: Choice | null;
  choice: Choice | null;
  raised: boolean;
  landmarks: Landmark[];
}
export interface Player {
  id: number;
  trackId: number;
  row: Choice;
  choice: Choice | null;
  candidate: Choice | null;
  candidateSince: number;
  lastSeen: number;
  present: boolean;
  score: number;
  correct: number;
  lastCorrect: boolean | null;
}
export type Phase = "idle" | "joining" | "voting" | "question" | "reveal" | "photo" | "results";
export interface Game {
  sessionId: string;
  phase: Phase;
  deadline: number | null;
  lastMovement: number;
  players: Player[];
  hands: Record<number, number>;
  questions: Question[];
  questionIndex: number;
  difficulty: Difficulty | null;
  voteNote: string;
}
