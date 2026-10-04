import type { Choice, Floor, Point } from "@/lib/types";

export const defaultFloor: Floor = [
  { x: 0.1, y: 0.18 }, { x: 0.9, y: 0.18 },
  { x: 0.9, y: 0.82 }, { x: 0.1, y: 0.82 },
];

export const previousDefaultFloor: Floor = [
  { x: 0.2, y: 0.28 }, { x: 0.8, y: 0.28 },
  { x: 0.8, y: 0.68 }, { x: 0.2, y: 0.68 },
];

// Map normalized grid coordinates into the calibrated on-screen rectangle.
export function project(floor: Floor, u: number, v: number): Point {
  const [a, b, c, d] = floor;
  const dx = a.x - b.x + c.x - d.x;
  const dy = a.y - b.y + c.y - d.y;
  const bx = b.x - c.x, by = b.y - c.y;
  const dx2 = d.x - c.x, dy2 = d.y - c.y;
  const determinant = bx * dy2 - dx2 * by;
  const g = (dx * dy2 - dx2 * dy) / determinant;
  const h = (bx * dy - dx * by) / determinant;
  const denominator = g * u + h * v + 1;
  return {
    x: ((b.x - a.x + g * b.x) * u + (d.x - a.x + h * d.x) * v + a.x) / denominator,
    y: ((b.y - a.y + g * b.y) * u + (d.y - a.y + h * d.y) * v + a.y) / denominator,
  };
}

export function unproject(floor: Floor, point: Point): Point {
  // Invert the smooth projective map with Newton iteration.
  let u = 0.5, v = 0.5;
  for (let i = 0; i < 12; i++) {
    const p = project(floor, u, v);
    const px = project(floor, u + 0.0001, v);
    const py = project(floor, u, v + 0.0001);
    const a = (px.x - p.x) / 0.0001, b = (py.x - p.x) / 0.0001;
    const c = (px.y - p.y) / 0.0001, d = (py.y - p.y) / 0.0001;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-10) return { x: -1, y: -1 };
    const ex = p.x - point.x, ey = p.y - point.y;
    u -= (d * ex - b * ey) / det;
    v -= (a * ey - c * ex) / det;
  }
  return { x: u, y: v };
}

export function validFloor(value: unknown): value is Floor {
  if (!Array.isArray(value) || value.length !== 4) return false;
  if (!value.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)) return false;
  const [a, b, c, d] = value;
  const straight = a.y === b.y && b.x === c.x && c.y === d.y && d.x === a.x;
  return straight && b.x - a.x >= 0.15 && d.y - a.y >= 0.15;
}

export function locate(anchor: Point, floor: Floor, margin: number): { row: Choice | null; choice: Choice | null } {
  const p = unproject(floor, anchor);
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x >= 1 || p.y < 0 || p.y >= 1) return { row: null, choice: null };
  const row = Math.floor(p.y * 3) as Choice;
  const choice = Math.floor(p.x * 3) as Choice;
  const nearLine = (n: number) => [1 / 3, 2 / 3].some(line => Math.abs(n - line) < margin);
  return { row: nearLine(p.y) ? null : row, choice: nearLine(p.x) ? null : choice };
}
