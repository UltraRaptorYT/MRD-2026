import { defaultFloor, validFloor } from "@/lib/calibration";
import type { Settings } from "@/lib/types";

export const SETTINGS_KEY = "mrd-settings-v2";
export const defaults: Settings = {
  joinSeconds: 5,
  voteSeconds: 10,
  answerSeconds: 15,
  revealSeconds: 4,
  photoSeconds: 8,
  resultsSeconds: 45,
  inactivitySeconds: 300,
  motionThreshold: 0.025,
  confidence: 0.55,
  handMargin: 0.04,
  handHoldMs: 1000,
  choiceHoldMs: 700,
  lostSeconds: 2,
  boundaryMargin: 0.018,
  mirror: true,
  cameraId: "",
  floor: defaultFloor,
};
export const numericSettings = {
  joinSeconds: [3, 60, 1, "Join window (seconds)"],
  voteSeconds: [5, 120, 1, "Difficulty vote (seconds)"],
  answerSeconds: [5, 120, 1, "Each question (seconds)"],
  revealSeconds: [2, 15, 1, "Answer reveal (seconds)"],
  photoSeconds: [3, 30, 1, "Photo pose countdown (seconds)"],
  resultsSeconds: [5, 180, 1, "Finish screen (seconds)"],
  inactivitySeconds: [10, 3600, 10, "No-movement reset (seconds)"],
  motionThreshold: [
    0.005,
    0.2,
    0.005,
    "Movement threshold (lower = more sensitive)",
  ],
  confidence: [0.3, 0.9, 0.05, "Landmark confidence"],
  handMargin: [0, 0.2, 0.01, "Hand height above head"],
  handHoldMs: [300, 3000, 100, "Raise-hand hold (milliseconds)"],
  choiceHoldMs: [200, 3000, 100, "Answer hold (milliseconds)"],
  lostSeconds: [0.5, 5, 0.5, "Tracking reconnect window (seconds)"],
  boundaryMargin: [0, 0.06, 0.002, "Grid boundary dead zone"],
} as const;

export function sanitizeSettings(input: unknown): Settings {
  const next = { ...defaults };
  if (!input || typeof input !== "object") return next;
  const data = input as Record<string, unknown>;
  for (const key of Object.keys(
    numericSettings,
  ) as (keyof typeof numericSettings)[]) {
    const value = data[key];
    const [min, max] = numericSettings[key];
    if (typeof value === "number" && Number.isFinite(value))
      next[key] = Math.max(min, Math.min(max, value));
  }
  if (typeof data.mirror === "boolean") next.mirror = data.mirror;
  if (typeof data.cameraId === "string") next.cameraId = data.cameraId;
  if (validFloor(data.floor)) next.floor = data.floor;
  return next;
}
