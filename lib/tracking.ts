import { locate } from "@/lib/calibration";
import type { Landmark, Observation, Point, Settings } from "@/lib/types";

interface Track { id: number; center: Point; seen: number; baseline: Landmark[] }
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const visible = (p: Landmark | undefined, confidence: number): p is Landmark => !!p && (p.visibility ?? 0) >= confidence;

export class PoseTracker {
  private tracks: Track[] = [];
  private nextId = 1;

  update(poses: Landmark[][], now: number, settings: Settings): { observations: Observation[]; moved: boolean } {
    this.tracks = this.tracks.filter(t => now - t.seen <= settings.lostSeconds * 1000);
    const detections = poses.flatMap(raw => {
      const landmarks = raw.map(p => ({ ...p, x: settings.mirror ? 1 - p.x : p.x }));
      const head = landmarks[0];
      if (!visible(head, settings.confidence)) return [];
      const [leftShoulder, rightShoulder] = [landmarks[11], landmarks[12]];
      const center = visible(leftShoulder, settings.confidence) && visible(rightShoulder, settings.confidence)
        ? { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 }
        : head;
      const anchor = { x: head.x, y: head.y };
      const raised = [landmarks[15], landmarks[16]].some(wrist => visible(wrist, settings.confidence) && wrist.y < head.y - settings.handMargin);
      const cell = locate(anchor, settings.floor, settings.boundaryMargin);
      // Players keep a fixed left/centre/right lane (grid column) and choose by
      // moving backward/centre/forward (grid row).
      return [{ anchor, center, landmarks, raised, row: cell.choice, choice: cell.row }];
    });

    // Globally nearest pairs, not detector-array order. Never give a vanished
    // player's ID to a new track after the reconnect window expires.
    const pairs = this.tracks.flatMap(track => detections.map((d, index) => ({ track, index, distance: distance(track.center, d.center) })))
      .filter(pair => pair.distance < 0.16).sort((a, b) => a.distance - b.distance);
    const assignments = new Map<number, Track>();
    const used = new Set<number>();
    for (const pair of pairs) {
      if (!assignments.has(pair.index) && !used.has(pair.track.id)) {
        assignments.set(pair.index, pair.track); used.add(pair.track.id);
      }
    }
    let moved = false;
    const observations = detections.map((d, index) => {
      let track = assignments.get(index);
      if (!track) {
        track = { id: this.nextId++, center: d.center, seen: now, baseline: d.landmarks };
        this.tracks.push(track);
        if (d.row !== null) moved = true;
      } else {
        const movement = [0, 11, 12, 15, 16].some(i => visible(d.landmarks[i], settings.confidence) && visible(track!.baseline[i], settings.confidence) && distance(d.landmarks[i], track!.baseline[i]) >= settings.motionThreshold);
        if (movement) {
          if (d.row !== null) moved = true;
          track.baseline = d.landmarks;
        }
        track.center = d.center;
        track.seen = now;
      }
      return { id: track.id, anchor: d.anchor, row: d.row, choice: d.choice, raised: d.raised, landmarks: d.landmarks };
    });
    return { observations, moved };
  }
}
