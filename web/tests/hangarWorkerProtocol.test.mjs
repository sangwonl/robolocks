import assert from "node:assert/strict";
import test from "node:test";

import {
  doneMessage,
  errorMessage,
  isDoneMessage,
  isErrorMessage,
  isProgressMessage,
  parseRunRequest,
  parseWorkerMessage,
  progressMessage,
  runRequest,
} from "../src/hangar/hangarWorkerProtocol.ts";

const SAMPLE_REPLAY = {
  type: "robolocks.replay.v1",
  tickRate: 30,
  obstacles: [],
  frames: [{ tick: 0, units: [], projectiles: [], events: [], actions: [] }],
};
const SAMPLE_LOGS = [{ tick: 1, unitId: 1, stream: "stdout", message: "hi" }];

test("progressMessage builds a stage-only progress message and round-trips", () => {
  const message = progressMessage({ stage: "loading-python" });
  assert.deepEqual(message, { type: "progress", stage: "loading-python" });
  assert.deepEqual(parseWorkerMessage(message), message);
  assert.equal(isProgressMessage(message), true);
});

test("progressMessage carries tick and totalTicks for simulating", () => {
  const message = progressMessage({ stage: "simulating", tick: 5, totalTicks: 10 });
  assert.deepEqual(message, { type: "progress", stage: "simulating", tick: 5, totalTicks: 10 });
  assert.deepEqual(parseWorkerMessage(message), message);
});

test("doneMessage carries replay and logs and round-trips", () => {
  const message = doneMessage(SAMPLE_REPLAY, SAMPLE_LOGS);
  assert.deepEqual(message, { type: "done", replay: SAMPLE_REPLAY, logs: SAMPLE_LOGS });
  assert.deepEqual(parseWorkerMessage(message), message);
  assert.equal(isDoneMessage(message), true);
});

test("errorMessage carries a message string and round-trips", () => {
  const message = errorMessage("boom");
  assert.deepEqual(message, { type: "error", message: "boom" });
  assert.deepEqual(parseWorkerMessage(message), message);
  assert.equal(isErrorMessage(message), true);
});

test("parseWorkerMessage rejects non-objects", () => {
  assert.equal(parseWorkerMessage(null), null);
  assert.equal(parseWorkerMessage(undefined), null);
  assert.equal(parseWorkerMessage("progress"), null);
  assert.equal(parseWorkerMessage(42), null);
});

test("parseWorkerMessage rejects unknown message types", () => {
  assert.equal(parseWorkerMessage({ type: "started" }), null);
  assert.equal(parseWorkerMessage({}), null);
});

test("parseWorkerMessage strictly validates progress stage", () => {
  assert.equal(parseWorkerMessage({ type: "progress" }), null);
  assert.equal(parseWorkerMessage({ type: "progress", stage: "bogus" }), null);
  assert.equal(parseWorkerMessage({ type: "progress", stage: 3 }), null);
  assert.equal(
    parseWorkerMessage({ type: "progress", stage: "installing-sdk" }).stage,
    "installing-sdk",
  );
});

test("parseWorkerMessage drops non-numeric tick fields on progress", () => {
  const parsed = parseWorkerMessage({ type: "progress", stage: "simulating", tick: "5", totalTicks: 10 });
  assert.deepEqual(parsed, { type: "progress", stage: "simulating", totalTicks: 10 });
});

test("parseWorkerMessage validates done payload shape", () => {
  assert.equal(parseWorkerMessage({ type: "done" }), null);
  assert.equal(parseWorkerMessage({ type: "done", replay: SAMPLE_REPLAY }), null);
  assert.equal(parseWorkerMessage({ type: "done", replay: null, logs: [] }), null);
  assert.equal(parseWorkerMessage({ type: "done", replay: SAMPLE_REPLAY, logs: "nope" }), null);
});

test("parseWorkerMessage validates error payload shape", () => {
  assert.equal(parseWorkerMessage({ type: "error" }), null);
  assert.equal(parseWorkerMessage({ type: "error", message: 5 }), null);
});

test("runRequest builds a request and parseRunRequest round-trips", () => {
  const request = runRequest({ botSource: "print(1)", battleConfigJson: "{}", tickCount: 12 });
  assert.deepEqual(request, { botSource: "print(1)", battleConfigJson: "{}", tickCount: 12 });
  assert.deepEqual(parseRunRequest(request), request);
});

test("runRequest omits an absent battleConfigJson", () => {
  const request = runRequest({ botSource: "print(1)", tickCount: 3 });
  assert.deepEqual(request, { botSource: "print(1)", tickCount: 3 });
  assert.deepEqual(parseRunRequest(request), request);
});

test("parseRunRequest rejects malformed requests", () => {
  assert.equal(parseRunRequest(null), null);
  assert.equal(parseRunRequest({ tickCount: 3 }), null);
  assert.equal(parseRunRequest({ botSource: "x" }), null);
  assert.equal(parseRunRequest({ botSource: 1, tickCount: 3 }), null);
  assert.equal(parseRunRequest({ botSource: "x", tickCount: "3" }), null);
  assert.equal(parseRunRequest({ botSource: "x", tickCount: 3, battleConfigJson: 9 }), null);
});
