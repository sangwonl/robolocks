import assert from "node:assert/strict";
import test from "node:test";

import { frameIndexAt, shortcutAction } from "../src/ui/hooks/useReplayPlayback.ts";

test("frameIndexAt returns 0 when no time has elapsed", () => {
  assert.equal(frameIndexAt(0, 10, 1, 100), 0);
  assert.equal(frameIndexAt(0, 30, 4, 500), 0);
});

test("frameIndexAt advances by exact multiples of the frame period at speed 1x", () => {
  const tickRate = 10; // 100ms per frame
  assert.equal(frameIndexAt(100, tickRate, 1, 100), 1);
  assert.equal(frameIndexAt(300, tickRate, 1, 100), 3);
  assert.equal(frameIndexAt(999, tickRate, 1, 100), 9);
});

test("frameIndexAt at 2x speed doubles the progression versus 1x for the same elapsed time", () => {
  const tickRate = 10;
  const elapsedMs = 200;
  const frameCount = 1000;
  const baseline = frameIndexAt(elapsedMs, tickRate, 1, frameCount);
  const doubled = frameIndexAt(elapsedMs, tickRate, 2, frameCount);
  assert.equal(baseline, 2);
  assert.equal(doubled, 4);
  assert.equal(doubled, baseline * 2);
});

test("frameIndexAt clamps at frameCount - 1 once elapsed time exceeds the replay length", () => {
  assert.equal(frameIndexAt(100_000, 10, 1, 50), 49);
  assert.equal(frameIndexAt(100_000, 10, 4, 5), 4);
});

test("frameIndexAt never returns a negative index or one beyond bounds for degenerate inputs", () => {
  assert.equal(frameIndexAt(500, 10, 1, 0), 0);
  assert.equal(frameIndexAt(-50, 10, 1, 100), 0);
});

test("shortcutAction maps space to toggle-play", () => {
  assert.equal(shortcutAction({ key: " ", shiftKey: false }), "toggle-play");
  assert.equal(shortcutAction({ key: " ", shiftKey: true }), "toggle-play");
  assert.equal(shortcutAction({ key: "Spacebar", shiftKey: false }), "toggle-play");
});

test("shortcutAction maps plain arrows to single-frame steps", () => {
  assert.equal(shortcutAction({ key: "ArrowLeft", shiftKey: false }), "step-backward");
  assert.equal(shortcutAction({ key: "ArrowRight", shiftKey: false }), "step-forward");
});

test("shortcutAction maps shift+arrow to large steps", () => {
  assert.equal(shortcutAction({ key: "ArrowLeft", shiftKey: true }), "step-backward-large");
  assert.equal(shortcutAction({ key: "ArrowRight", shiftKey: true }), "step-forward-large");
});

test("shortcutAction returns null for keys that are not playback shortcuts", () => {
  assert.equal(shortcutAction({ key: "a", shiftKey: false }), null);
  assert.equal(shortcutAction({ key: "Enter", shiftKey: false }), null);
  assert.equal(shortcutAction({ key: "ArrowUp", shiftKey: false }), null);
});
