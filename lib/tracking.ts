import { locate } from "@/lib/calibration";
import type { Landmark, Observation, Point, Settings } from "@/lib/types";

interface Track { id: number; center: Point; velocity: Point; seen: number; baseline: Landmark[] }
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const visible = (p: Landmark | undefined, confidence: number): p is Landmark => !!p && (p.visibility ?? 0) >= confidence;
const average = (points: Landmark[]): Point => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
});

// Minimum-cost assignment (Hungarian algorithm) with one unmatched option per
// track. This avoids the order-dependent swaps caused by greedy nearest pairs.
function assign(costs: number[][], unmatchedCost: number): number[] {
  const rows = costs.length;
  if (!rows) return [];
  const detections = costs[0]?.length ?? 0;
  const columns = detections + rows;
  const u = Array(rows + 1).fill(0), v = Array(columns + 1).fill(0);
  const p = Array(columns + 1).fill(0), way = Array(columns + 1).fill(0);
  for (let i = 1; i <= rows; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = Array(columns + 1).fill(Infinity), used = Array(columns + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= columns; j++) if (!used[j]) {
        const cost = j <= detections ? costs[i0 - 1][j - 1] : unmatchedCost;
        const current = cost - u[i0] - v[j];
        if (current < minv[j]) { minv[j] = current; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= columns; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0 !== 0);
  }
  const result = Array(rows).fill(-1);
  for (let j = 1; j <= detections; j++) if (p[j]) result[p[j] - 1] = j - 1;
  return result;
}

export class PoseTracker {
  private tracks: Track[] = [];
  private nextId = 1;

  update(poses: Landmark[][], now: number, settings: Settings): { observations: Observation[]; moved: boolean; acceptedPoseCount: number } {
    this.tracks = this.tracks.filter(t => now - t.seen <= settings.lostSeconds * 1000);
    const detections = poses.flatMap(raw => {
      const landmarks = raw.map(p => ({ ...p, x: settings.mirror ? 1 - p.x : p.x }));
      const [leftShoulder, rightShoulder] = [landmarks[11], landmarks[12]];
      const shouldersVisible =
        visible(leftShoulder, settings.confidence) &&
        visible(rightShoulder, settings.confidence);
      const face = landmarks
        .slice(0, 11)
        .filter(point => visible(point, settings.confidence));
      // Use the nose when reliable, otherwise the visible face points. Requiring
      // more than one weak landmark avoids phantom detections on background objects.
      const nose = landmarks[0];
      const anchor = visible(nose, settings.confidence)
        ? { x: nose.x, y: nose.y }
        : face.length >= 2 ? average(face) : null;
      if (!anchor) return [];
      const center = shouldersVisible
        ? { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 }
        : anchor;
      const raised = [landmarks[15], landmarks[16]].some(wrist => visible(wrist, settings.confidence) && wrist.y < anchor.y - settings.handMargin);
      const cell = locate(anchor, settings.floor, settings.boundaryMargin);
      // Players keep a fixed left/centre/right lane (grid column) and choose by
      // moving backward/centre/forward (grid row).
      return [{ anchor, center, landmarks, raised, row: cell.choice, choice: cell.row }];
    });

    // Predict each person's next shoulder position, then assign detections
    // globally so detector-array reordering does not swap nearby identities.
    const maxMatchDistance = 0.24;
    const costs = this.tracks.map(track => {
      const dt = Math.min(0.5, Math.max(0, (now - track.seen) / 1000));
      const predicted = { x: track.center.x + track.velocity.x * dt, y: track.center.y + track.velocity.y * dt };
      return detections.map(d => distance(predicted, d.center) < maxMatchDistance ? distance(predicted, d.center) : 1e3);
    });
    const assignment = assign(costs, maxMatchDistance);
    const detectionTracks = new Map<number, Track>();
    assignment.forEach((detectionIndex, trackIndex) => {
      if (detectionIndex >= 0 && costs[trackIndex][detectionIndex] < maxMatchDistance)
        detectionTracks.set(detectionIndex, this.tracks[trackIndex]);
    });
    let moved = false;
    const observations = detections.map((d, index) => {
      let track = detectionTracks.get(index);
      if (!track) {
        track = { id: this.nextId++, center: d.center, velocity: { x: 0, y: 0 }, seen: now, baseline: d.landmarks };
        this.tracks.push(track);
        if (d.row !== null) moved = true;
      } else {
        const movement = [0, 11, 12, 15, 16].some(i => visible(d.landmarks[i], settings.confidence) && visible(track!.baseline[i], settings.confidence) && distance(d.landmarks[i], track!.baseline[i]) >= settings.motionThreshold);
        if (movement) {
          if (d.row !== null) moved = true;
          track.baseline = d.landmarks;
        }
        const dt = Math.max(0.05, (now - track.seen) / 1000);
        const measured = { x: (d.center.x - track.center.x) / dt, y: (d.center.y - track.center.y) / dt };
        track.velocity = {
          x: Math.max(-1, Math.min(1, track.velocity.x * 0.5 + measured.x * 0.5)),
          y: Math.max(-1, Math.min(1, track.velocity.y * 0.5 + measured.y * 0.5)),
        };
        track.center = d.center;
        track.seen = now;
      }
      return { id: track.id, anchor: d.anchor, row: d.row, choice: d.choice, raised: d.raised, landmarks: d.landmarks };
    });
    return { observations, moved, acceptedPoseCount: detections.length };
  }
}
