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
      const [lh, rh, la, ra] = [landmarks[23], landmarks[24], landmarks[27], landmarks[28]];
      if (![lh, rh, la, ra].every(p => visible(p, settings.confidence))) return [];
      const foot = { x: (la.x + ra.x) / 2, y: (la.y + ra.y) / 2 };
      const center = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
      const head = landmarks[0];
      const raised = visible(head, settings.confidence) && [landmarks[15], landmarks[16]].some(wrist => visible(wrist, settings.confidence) && wrist.y < head.y - settings.handMargin);
      return [{ foot, center, landmarks, raised, ...locate(foot, settings.floor, settings.boundaryMargin) }];
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
        const movement = [0, 11, 12, 15, 16, 23, 24, 27, 28].some(i => visible(d.landmarks[i], settings.confidence) && visible(track!.baseline[i], settings.confidence) && distance(d.landmarks[i], track!.baseline[i]) >= settings.motionThreshold);
        if (movement) {
          if (d.row !== null) moved = true;
          track.baseline = d.landmarks;
        }
        track.center = d.center;
        track.seen = now;
      }
      return { id: track.id, foot: d.foot, row: d.row, choice: d.choice, raised: d.raised, landmarks: d.landmarks };
    });
    return { observations, moved };
  }
}
