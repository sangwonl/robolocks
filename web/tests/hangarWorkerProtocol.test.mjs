import assert from "node:assert/strict";
import test from "node:test";

import {
  doneMessage,
  errorMessage,
  framesMessage,
  isDoneMessage,
  isErrorMessage,
  isFramesMessage,
  isProgressMessage,
  isReadyMessage,
  liveDisposeRequest,
  liveSetupRequest,
  liveStepRequest,
  parseLiveRequest,
  parseRunRequest,
  parseWorkerMessage,
  progressMessage,
  readyMessage,
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

test("readyMessage carries an initial live replay and round-trips", () => {
  const message = readyMessage(SAMPLE_REPLAY, 600);
  assert.deepEqual(message, { type: "ready", replay: SAMPLE_REPLAY, tickLimit: 600 });
  assert.deepEqual(parseWorkerMessage(message), message);
  assert.equal(isReadyMessage(message), true);
});

test("framesMessage carries live frame chunks and round-trips", () => {
  const frames = SAMPLE_REPLAY.frames;
  const message = framesMessage({ frames, logs: SAMPLE_LOGS, finished: false });
  assert.deepEqual(message, { type: "frames", frames, logs: SAMPLE_LOGS, finished: false });
  assert.deepEqual(parseWorkerMessage(message), message);
  assert.equal(isFramesMessage(message), true);
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

test("parseWorkerMessage validates live payload shapes", () => {
  assert.equal(parseWorkerMessage({ type: "ready", replay: SAMPLE_REPLAY }), null);
  assert.equal(parseWorkerMessage({ type: "ready", replay: null, tickLimit: 5 }), null);
  assert.equal(parseWorkerMessage({ type: "frames", frames: [], logs: [] }), null);
  assert.equal(parseWorkerMessage({ type: "frames", frames: "nope", logs: [], finished: false }), null);
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

test("live requests build and parse setup, step, and dispose messages", () => {
  const setup = liveSetupRequest({ botSource: "print(1)", battleConfigJson: "{}", tickCount: 12 });
  assert.deepEqual(setup, { type: "setup", botSource: "print(1)", battleConfigJson: "{}", tickCount: 12 });
  assert.deepEqual(parseLiveRequest(setup), setup);
  assert.deepEqual(liveStepRequest(2.9), { type: "step", count: 2 });
  assert.deepEqual(parseLiveRequest({ type: "step", count: 3 }), { type: "step", count: 3 });
  assert.deepEqual(parseLiveRequest(liveDisposeRequest()), { type: "dispose" });
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

test("parseLiveRequest rejects malformed live messages", () => {
  assert.equal(parseLiveRequest(null), null);
  assert.equal(parseLiveRequest({ type: "setup", tickCount: 3 }), null);
  assert.equal(parseLiveRequest({ type: "step" }), null);
  assert.equal(parseLiveRequest({ type: "step", count: "3" }), null);
  assert.equal(parseLiveRequest({ type: "bogus" }), null);
});
