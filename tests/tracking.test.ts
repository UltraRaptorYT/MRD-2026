import assert from "node:assert/strict";
import test from "node:test";
import { defaultFloor, locate, project, unproject, validFloor } from "../lib/calibration";
import { PoseTracker } from "../lib/tracking";
import { defaults } from "../lib/settings";
import type { Floor, Landmark } from "../lib/types";

const floor: Floor = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const settings = { ...defaults, floor, mirror: false };
function pose(x: number, y: number, raised = false): Landmark[] {
  const result = Array.from({ length: 33 }, () => ({ x, y: y - 0.2, visibility: 0.99 }));
  result[0].y = y - 0.4;
  result[15].y = raised ? y - 0.5 : y - 0.15;
  result[27].y = y; result[28].y = y;
  return result;
}

test("perspective grid round-trips and maps all nine cells", () => {
  for (const f of [floor, defaultFloor]) {
    assert.equal(validFloor(f), true);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      const p = project(f, (col + 0.5) / 3, (row + 0.5) / 3);
      assert.deepEqual(locate(p, f, 0.018), { row, choice: col });
      const restored = unproject(f, p);
      assert.ok(Math.abs(restored.x - (col + 0.5) / 3) < 1e-6);
    }
  }
  assert.deepEqual(locate(project(defaultFloor, 1 / 3, 0.5), defaultFloor, 0.018), { row: 1, choice: null });
  assert.deepEqual(locate({ x: -1, y: -1 }, floor, 0.018), { row: null, choice: null });
  assert.equal(validFloor([floor[0], floor[2], floor[1], floor[3]]), false);
});

test("detector reorder preserves player IDs and full loss expires them", () => {
  const tracker = new PoseTracker();
  const first = tracker.update([pose(0.2, 0.5), pose(0.8, 0.8)], 100, settings);
  const next = tracker.update([pose(0.79, 0.8), pose(0.21, 0.5)], 200, settings);
  assert.equal(next.observations[0].id, first.observations[1].id);
  assert.equal(next.observations[1].id, first.observations[0].id);
  tracker.update([], 300, settings);
  assert.equal(tracker.update([pose(0.2, 0.5)], 1000, settings).observations[0].id, first.observations[0].id);
  assert.notEqual(tracker.update([pose(0.2, 0.5)], 4001, settings).observations[0].id, first.observations[0].id);
});

test("face anchoring, hand raise, confidence filtering, mirroring, and meaningful motion", () => {
  const tracker = new PoseTracker();
  const first = tracker.update([pose(0.2, 0.5, true)], 100, settings);
  assert.equal(first.observations[0].raised, true);
  assert.equal(tracker.update([pose(0.201, 0.5, true)], 200, settings).moved, false);
  assert.equal(tracker.update([pose(0.24, 0.5, true)], 300, settings).moved, true);
  const hiddenFeet = pose(0.2, 0.5); hiddenFeet[27].visibility = 0.1; hiddenFeet[28].visibility = 0.1;
  assert.equal(tracker.update([hiddenFeet], 400, settings).observations.length, 1);
  const lowConfidence = pose(0.2, 0.5); lowConfidence[0].visibility = 0.1;
  assert.equal(tracker.update([lowConfidence], 500, settings).observations.length, 0);
  const mirrored = new PoseTracker().update([pose(0.2, 0.5)], 100, { ...settings, mirror: true });
  assert.equal(mirrored.observations[0].row, 2);
  assert.equal(mirrored.observations[0].choice, 0);
});
