// Pure message protocol between the hangar Web Worker and the main thread.
// No DOM / worker globals are touched here so the guards and constructors can
// be unit-tested directly (see tests/hangarWorkerProtocol.test.mjs).
import type { BattleReplay } from "../replay/replay";
import type { BotLogEntry } from "./hangar";

// Stages reported while a hangar run progresses. `simulating` additionally
// carries a tick counter; the python/sdk stages are indeterminate loads.
export type HangarStage = "loading-python" | "installing-sdk" | "simulating";

export type HangarProgress = {
  stage: HangarStage;
  tick?: number;
  totalTicks?: number;
};

// Main thread -> worker: the one request that kicks off a run.
export type HangarRunRequest = {
  botSource: string;
  botSourcesByUnit?: Record<number, string>;
  battleConfigJson?: string;
  tickCount: number;
};

// Worker -> main thread messages.
export type WorkerProgressMessage = { type: "progress" } & HangarProgress;
export type WorkerDoneMessage = { type: "done"; replay: BattleReplay; logs: BotLogEntry[] };
export type WorkerErrorMessage = { type: "error"; message: string };
export type WorkerMessage = WorkerProgressMessage | WorkerDoneMessage | WorkerErrorMessage;

const HANGAR_STAGES: ReadonlySet<string> = new Set<HangarStage>([
  "loading-python",
  "installing-sdk",
  "simulating",
]);

export function runRequest(request: HangarRunRequest): HangarRunRequest {
  const built: HangarRunRequest = { botSource: request.botSource, tickCount: request.tickCount };
  if (request.battleConfigJson !== undefined) {
    built.battleConfigJson = request.battleConfigJson;
  }
  if (request.botSourcesByUnit !== undefined) {
    built.botSourcesByUnit = request.botSourcesByUnit;
  }
  return built;
}

export function progressMessage(progress: HangarProgress): WorkerProgressMessage {
  const message: WorkerProgressMessage = { type: "progress", stage: progress.stage };
  if (typeof progress.tick === "number") {
    message.tick = progress.tick;
  }
  if (typeof progress.totalTicks === "number") {
    message.totalTicks = progress.totalTicks;
  }
  return message;
}

export function doneMessage(replay: BattleReplay, logs: BotLogEntry[]): WorkerDoneMessage {
  return { type: "done", replay, logs };
}

export function errorMessage(message: string): WorkerErrorMessage {
  return { type: "error", message };
}

export function isProgressMessage(message: unknown): message is WorkerProgressMessage {
  return isRecord(message) && message.type === "progress" && isHangarStage(message.stage);
}

export function isDoneMessage(message: unknown): message is WorkerDoneMessage {
  return (
    isRecord(message) &&
    message.type === "done" &&
    isRecord(message.replay) &&
    Array.isArray(message.logs)
  );
}

export function isErrorMessage(message: unknown): message is WorkerErrorMessage {
  return isRecord(message) && message.type === "error" && typeof message.message === "string";
}

// Validate and normalize an inbound worker message. Returns null for anything
// that is not a recognized, well-formed message so callers can ignore noise.
export function parseWorkerMessage(data: unknown): WorkerMessage | null {
  if (isProgressMessage(data)) {
    const message: WorkerProgressMessage = { type: "progress", stage: data.stage };
    if (typeof data.tick === "number") {
      message.tick = data.tick;
    }
    if (typeof data.totalTicks === "number") {
      message.totalTicks = data.totalTicks;
    }
    return message;
  }
  if (isDoneMessage(data)) {
    return { type: "done", replay: data.replay, logs: data.logs };
  }
  if (isErrorMessage(data)) {
    return { type: "error", message: data.message };
  }
  return null;
}

export function parseRunRequest(data: unknown): HangarRunRequest | null {
  if (!isRecord(data)) {
    return null;
  }
  if (typeof data.botSource !== "string" || typeof data.tickCount !== "number") {
    return null;
  }
  if (data.battleConfigJson !== undefined && typeof data.battleConfigJson !== "string") {
    return null;
  }
  if (data.botSourcesByUnit !== undefined && !isStringRecord(data.botSourcesByUnit)) {
    return null;
  }
  return runRequest({
    botSource: data.botSource,
    botSourcesByUnit: data.botSourcesByUnit,
    tickCount: data.tickCount,
    battleConfigJson: data.battleConfigJson,
  });
}

function isHangarStage(value: unknown): value is HangarStage {
  return typeof value === "string" && HANGAR_STAGES.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringRecord(value: unknown): value is Record<number, string> {
  if (!isRecord(value)) {
    return false;
  }
  return Object.values(value).every((entry) => typeof entry === "string");
}
