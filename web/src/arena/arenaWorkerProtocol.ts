import type { BattleReplay } from "../replay/replay";
import type { BotLogEntry } from "../hangar/hangar";
import type { HangarStage } from "../hangar/hangarWorkerProtocol";

export type ArenaBatchRun = {
  seed: number;
  battleConfigJson: string;
  tickCount: number;
};

export type ArenaRunRequest = {
  botSource: string;
  botSourcesByUnit?: Record<number, string>;
  runs: ArenaBatchRun[];
};

export type ArenaProgressPayload = {
  stage: HangarStage;
  runIndex: number;
  totalRuns: number;
  seed: number;
  tick?: number;
  totalTicks?: number;
};

export type ArenaProgressMessage = { type: "progress" } & ArenaProgressPayload;
export type ArenaMatchMessage = { type: "match"; seed: number; replay: BattleReplay; logs: BotLogEntry[] };
export type ArenaDoneMessage = { type: "done" };
export type ArenaErrorMessage = { type: "error"; message: string };
export type ArenaWorkerMessage = ArenaProgressMessage | ArenaMatchMessage | ArenaDoneMessage | ArenaErrorMessage;

const HANGAR_STAGES: ReadonlySet<string> = new Set<HangarStage>([
  "loading-python",
  "installing-sdk",
  "simulating",
]);

export function arenaRunRequest(request: ArenaRunRequest): ArenaRunRequest {
  const built: ArenaRunRequest = {
    botSource: request.botSource,
    runs: request.runs.map((run) => ({ seed: run.seed, battleConfigJson: run.battleConfigJson, tickCount: run.tickCount })),
  };
  if (request.botSourcesByUnit !== undefined) {
    built.botSourcesByUnit = request.botSourcesByUnit;
  }
  return built;
}

export function arenaProgressMessage(progress: ArenaProgressPayload): ArenaProgressMessage {
  const message: ArenaProgressMessage = {
    type: "progress",
    stage: progress.stage,
    runIndex: progress.runIndex,
    totalRuns: progress.totalRuns,
    seed: progress.seed,
  };
  if (typeof progress.tick === "number") {
    message.tick = progress.tick;
  }
  if (typeof progress.totalTicks === "number") {
    message.totalTicks = progress.totalTicks;
  }
  return message;
}

export function arenaMatchMessage(payload: { seed: number; replay: BattleReplay; logs: BotLogEntry[] }): ArenaMatchMessage {
  return { type: "match", seed: payload.seed, replay: payload.replay, logs: payload.logs };
}

export function arenaDoneMessage(): ArenaDoneMessage {
  return { type: "done" };
}

export function arenaErrorMessage(message: string): ArenaErrorMessage {
  return { type: "error", message };
}

export function parseArenaRunRequest(data: unknown): ArenaRunRequest | null {
  if (!isRecord(data) || typeof data.botSource !== "string" || !Array.isArray(data.runs) || data.runs.length === 0) {
    return null;
  }
  if (data.botSourcesByUnit !== undefined && !isStringRecord(data.botSourcesByUnit)) {
    return null;
  }
  const runs: ArenaBatchRun[] = [];
  for (const run of data.runs) {
    if (!isArenaBatchRun(run)) {
      return null;
    }
    runs.push({ seed: run.seed, battleConfigJson: run.battleConfigJson, tickCount: run.tickCount });
  }
  return arenaRunRequest({
    botSource: data.botSource,
    botSourcesByUnit: data.botSourcesByUnit,
    runs,
  });
}

export function parseArenaWorkerMessage(data: unknown): ArenaWorkerMessage | null {
  if (isProgressMessage(data)) {
    return arenaProgressMessage(data);
  }
  if (isMatchMessage(data)) {
    return data;
  }
  if (isRecord(data) && data.type === "done") {
    return arenaDoneMessage();
  }
  if (isRecord(data) && data.type === "error" && typeof data.message === "string") {
    return arenaErrorMessage(data.message);
  }
  return null;
}

function isArenaBatchRun(value: unknown): value is ArenaBatchRun {
  return isRecord(value)
    && typeof value.seed === "number"
    && typeof value.battleConfigJson === "string"
    && typeof value.tickCount === "number";
}

function isProgressMessage(value: unknown): value is ArenaProgressMessage {
  return isRecord(value)
    && value.type === "progress"
    && typeof value.stage === "string"
    && HANGAR_STAGES.has(value.stage)
    && typeof value.runIndex === "number"
    && typeof value.totalRuns === "number"
    && typeof value.seed === "number";
}

function isMatchMessage(value: unknown): value is ArenaMatchMessage {
  return isRecord(value)
    && value.type === "match"
    && typeof value.seed === "number"
    && isRecord(value.replay)
    && Array.isArray(value.logs);
}

function isStringRecord(value: unknown): value is Record<number, string> {
  if (!isRecord(value)) {
    return false;
  }
  return Object.values(value).every((entry) => typeof entry === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
