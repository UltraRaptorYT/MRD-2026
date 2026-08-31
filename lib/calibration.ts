import type { Calibration } from "@/lib/types";

export const CALIBRATION_STORAGE_KEY = "mrd-quiz-calibration-v1";

export const defaultCalibration: Calibration = {
  PLAYER: [{ x: 0.04, y: 0.14 }, { x: 0.96, y: 0.14 }, { x: 0.98, y: 0.96 }, { x: 0.02, y: 0.96 }],
  READY: [{ x: 0.36, y: 0.72 }, { x: 0.64, y: 0.72 }, { x: 0.68, y: 0.93 }, { x: 0.32, y: 0.93 }],
  A: [{ x: 0.07, y: 0.35 }, { x: 0.31, y: 0.35 }, { x: 0.34, y: 0.65 }, { x: 0.04, y: 0.65 }],
  B: [{ x: 0.38, y: 0.35 }, { x: 0.62, y: 0.35 }, { x: 0.65, y: 0.65 }, { x: 0.35, y: 0.65 }],
  C: [{ x: 0.69, y: 0.35 }, { x: 0.93, y: 0.35 }, { x: 0.96, y: 0.65 }, { x: 0.66, y: 0.65 }],
};
