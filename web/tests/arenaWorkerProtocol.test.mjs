import assert from "node:assert/strict";
import test from "node:test";

import {
  arenaDoneMessage,
  arenaErrorMessage,
  arenaMatchMessage,
  arenaProgressMessage,
  arenaRunRequest,
  parseArenaRunRequest,
  parseArenaWorkerMessage,
} from "../src/arena/arenaWorkerProtocol.ts";

const replay = {
  type: "robolocks.replay.v1",
  tickRate: 60,
  obstacles: [],
  frames: [],
};

test("arenaRunRequest and parseArenaRunRequest preserve batch runs", () => {
  const request = arenaRunRequest({
    botSource: "def on_tick(state): return []",
    botSourcesByUnit: { 1: "left", 2: "right" },
    runs: [
      { seed: 101, battleConfigJson: "{\"seed\":101}", tickCount: 300 },
      { seed: 102, battleConfigJson: "{\"seed\":102}", tickCount: 300 },
    ],
  });

  assert.deepEqual(parseArenaRunRequest(request), request);
});

test("parseArenaRunRequest rejects malformed batch runs", () => {
  assert.equal(parseArenaRunRequest({ botSource: "x", runs: [] }), null);
  assert.equal(parseArenaRunRequest({ botSource: "x", runs: [{ seed: "bad", battleConfigJson: "{}", tickCount: 1 }] }), null);
  assert.equal(parseArenaRunRequest({ botSource: "x", runs: [{ seed: 1, battleConfigJson: 7, tickCount: 1 }] }), null);
});

test("arena worker messages round-trip", () => {
  const progress = arenaProgressMessage({ stage: "simulating", runIndex: 1, totalRuns: 3, seed: 101, tick: 20, totalTicks: 300 });
  assert.deepEqual(parseArenaWorkerMessage(progress), progress);

  const match = arenaMatchMessage({ seed: 101, replay, logs: [{ tick: 1, unitId: 1, stream: "stdout", message: "hello" }] });
  assert.deepEqual(parseArenaWorkerMessage(match), match);

  assert.deepEqual(parseArenaWorkerMessage(arenaDoneMessage()), { type: "done" });
  assert.deepEqual(parseArenaWorkerMessage(arenaErrorMessage("boom")), { type: "error", message: "boom" });
});
