import { useEffect, useMemo, useRef, useState } from "react";

import {
  arenaBotSourcesByUnit,
  buildArenaBattleConfigJson,
  canStartArenaEvaluation,
  createLocalBotBuild,
  importGitHubBotBuilds,
  matchSummaryFromReplay,
  removeArenaBuildState,
  removeArenaRepoState,
  seedsFromStart,
  summarizeArenaEvaluation,
  type ArenaEvaluationSummary,
  type ArenaMatchSummary,
  type ArenaRatingEntry,
  type BotBuild,
} from "../../arena/arena.ts";
import type { BattleReplay } from "../../replay/replay";
import type { BotLogEntry } from "../../hangar/hangar.ts";
import { HANGAR_BATTLE_PRESETS, HANGAR_RULE_PRESETS } from "../../hangar/hangar.ts";
import {
  liveSetupRequest,
  liveStepRequest,
  parseWorkerMessage,
} from "../../hangar/hangarWorkerProtocol.ts";
import type { HangarProgress } from "../../hangar/hangarWorkerProtocol.ts";

export type UseArenaRunDeps = {
  applyLiveReplay: (replay: BattleReplay) => void;
  setStatus: (status: string, options?: { isError?: boolean }) => void;
  pause: () => void;
  setBotLogs: (logs: BotLogEntry[]) => void;
};

export type RegisterLocalArenaBotOptions = {
  name: string;
  code: string;
  unitPresetId: string;
};

export type UseArenaRunResult = {
  builds: BotBuild[];
  ratings: Record<string, ArenaRatingEntry>;
  selectedMyBotId: string;
  setSelectedMyBotId: (id: string) => void;
  selectedLeftBuildId: string;
  setSelectedLeftBuildId: (id: string) => void;
  selectedRightBuildId: string;
  setSelectedRightBuildId: (id: string) => void;
  arenaBattlePresetId: string;
  setArenaBattlePresetId: (id: string) => void;
  arenaRulePresetId: string;
  setArenaRulePresetId: (id: string) => void;
  arenaSeedStart: number;
  setArenaSeedStart: (seed: number) => void;
  arenaSeedCount: number;
  setArenaSeedCount: (count: number) => void;
  arenaTickLimit: number;
  setArenaTickLimit: (ticks: number) => void;
  githubInput: string;
  setGithubInput: (value: string) => void;
  lastEvaluation: ArenaEvaluationSummary | null;
  lastMatches: ArenaMatchSummary[];
  arenaProgress: HangarProgress | null;
  isArenaRunning: boolean;
  isArenaPaused: boolean;
  isImportingBot: boolean;
  registerLocalBot: (options: RegisterLocalArenaBotOptions) => void;
  runArenaWithLocalBot: (options: RegisterLocalArenaBotOptions) => void;
  runArenaBuilds: (left: BotBuild, right: BotBuild) => void;
  importGitHubBot: () => Promise<void>;
  runArena: () => void;
  toggleArenaPause: () => void;
  cancelArena: () => void;
  removeBuild: (id: string) => void;
  removeGitHubRepo: (owner: string, repo: string, ref: string) => void;
  forgetLocalBot: (buildId: string) => void;
};

type StoredArenaState = {
  builds?: unknown;
  ratings?: unknown;
  selectedLeftBuildId?: unknown;
  selectedMyBotId?: unknown;
  selectedRightBuildId?: unknown;
  battlePresetId?: unknown;
  rulePresetId?: unknown;
  seedStart?: unknown;
  seedCount?: unknown;
  tickLimit?: unknown;
  githubInput?: unknown;
  lastEvaluation?: unknown;
  lastMatches?: unknown;
};

type NormalizedArenaState = {
  builds: BotBuild[];
  ratings: Record<string, ArenaRatingEntry>;
  selectedMyBotId: string;
  selectedLeftBuildId: string;
  selectedRightBuildId: string;
  battlePresetId: string;
  rulePresetId: string;
  seedStart: number;
  seedCount: number;
  tickLimit: number;
  githubInput: string;
  lastEvaluation: ArenaEvaluationSummary | null;
  lastMatches: ArenaMatchSummary[];
};

const STORAGE_KEY = "robolocks.arena.v1";
const DEFAULT_SEED_START = 101;
const DEFAULT_SEED_COUNT = 3;
const DEFAULT_TICK_LIMIT = 900;

type ArenaLiveMatch = {
  seed: number;
  replay: BattleReplay;
  logs: BotLogEntry[];
};

export function useArenaRun(deps: UseArenaRunDeps): UseArenaRunResult {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const stored = readStoredArenaState();
  const [builds, setBuilds] = useState<BotBuild[]>(stored.builds);
  const [ratings, setRatings] = useState<Record<string, ArenaRatingEntry>>(stored.ratings);
  const [selectedMyBotId, setSelectedMyBotId] = useState(stored.selectedMyBotId);
  const [selectedLeftBuildId, setSelectedLeftBuildId] = useState(stored.selectedLeftBuildId);
  const [selectedRightBuildId, setSelectedRightBuildId] = useState(stored.selectedRightBuildId);
  const [arenaBattlePresetId, setArenaBattlePresetId] = useState(stored.battlePresetId);
  const [arenaRulePresetId, setArenaRulePresetId] = useState(stored.rulePresetId);
  const [arenaSeedStart, setArenaSeedStartRaw] = useState(stored.seedStart);
  const [arenaSeedCount, setArenaSeedCountRaw] = useState(stored.seedCount);
  const [arenaTickLimit, setArenaTickLimitRaw] = useState(stored.tickLimit);
  const [githubInput, setGithubInput] = useState(stored.githubInput);
  const [lastEvaluation, setLastEvaluation] = useState<ArenaEvaluationSummary | null>(stored.lastEvaluation);
  const [lastMatches, setLastMatches] = useState<ArenaMatchSummary[]>(stored.lastMatches);
  const [arenaProgress, setArenaProgress] = useState<HangarProgress | null>(null);
  const [isArenaRunning, setIsArenaRunning] = useState(false);
  const [isArenaPaused, setIsArenaPaused] = useState(false);
  const [isImportingBot, setIsImportingBot] = useState(false);
  const cancelledRef = useRef(false);
  const workerRef = useRef<Worker | null>(null);
  const liveRunningRef = useRef(false);
  const liveStepPendingRef = useRef(false);
  const liveAccumulatorRef = useRef(0);
  const liveLastTimestampRef = useRef<number | null>(null);
  const liveRafRef = useRef<number | null>(null);

  const normalizedSelectedIds = useMemo(() => normalizeSelectedIds(builds, selectedLeftBuildId, selectedRightBuildId), [builds, selectedLeftBuildId, selectedRightBuildId]);
  useEffect(() => {
    if (selectedLeftBuildId !== normalizedSelectedIds.left) {
      setSelectedLeftBuildId(normalizedSelectedIds.left);
    }
    if (selectedRightBuildId !== normalizedSelectedIds.right) {
      setSelectedRightBuildId(normalizedSelectedIds.right);
    }
  }, [normalizedSelectedIds, selectedLeftBuildId, selectedRightBuildId]);

  useEffect(() => () => {
    stopLiveLoop(liveRafRef);
    teardownWorker(workerRef);
  }, []);

  useEffect(() => {
    writeStoredArenaState({
      builds,
      ratings,
      selectedMyBotId,
      selectedLeftBuildId,
      selectedRightBuildId,
      battlePresetId: arenaBattlePresetId,
      rulePresetId: arenaRulePresetId,
      seedStart: arenaSeedStart,
      seedCount: arenaSeedCount,
      tickLimit: arenaTickLimit,
      githubInput,
      lastEvaluation,
      lastMatches,
    });
  }, [builds, ratings, selectedMyBotId, selectedLeftBuildId, selectedRightBuildId, arenaBattlePresetId, arenaRulePresetId, arenaSeedStart, arenaSeedCount, arenaTickLimit, githubInput, lastEvaluation, lastMatches]);

  function setArenaSeedStart(seed: number): void {
    setArenaSeedStartRaw(Number.isFinite(seed) ? Math.max(1, Math.floor(seed)) : DEFAULT_SEED_START);
  }

  function setArenaSeedCount(count: number): void {
    setArenaSeedCountRaw(Number.isFinite(count) ? Math.max(1, Math.min(25, Math.floor(count))) : DEFAULT_SEED_COUNT);
  }

  function setArenaTickLimit(ticks: number): void {
    setArenaTickLimitRaw(Number.isFinite(ticks) ? Math.max(1, Math.min(18000, Math.floor(ticks))) : DEFAULT_TICK_LIMIT);
  }

  function registerLocalBot(options: RegisterLocalArenaBotOptions): void {
    const build = createLocalBotBuild(options);
    setBuilds((current) => upsertBuild(current, build));
    setSelectedLeftBuildId(build.id);
    deps.setStatus(`Registered ${build.name} for Arena`);
  }

  async function importGitHubBot(): Promise<void> {
    const input = githubInput.trim();
    if (!input) {
      deps.setStatus("Enter a GitHub bot repo", { isError: true });
      return;
    }
    setIsImportingBot(true);
    deps.setStatus("Importing GitHub bot");
    try {
      const importedBuilds = await importGitHubBotBuilds(input);
      setBuilds((current) => importedBuilds.reduce((next, build) => upsertBuild(next, build), current));
      setSelectedRightBuildId(importedBuilds[0]?.id ?? "");
      setGithubInput("");
      deps.setStatus(importedBuilds.length === 1 ? `Imported ${importedBuilds[0].name}` : `Imported ${importedBuilds.length} bots`);
    } catch (error: unknown) {
      deps.setStatus(`GitHub bot import failed: ${errorMessage(error)}`, { isError: true });
    } finally {
      setIsImportingBot(false);
    }
  }

  function runArena(): void {
    if (isArenaRunning || workerRef.current) {
      return;
    }
    const left = builds.find((build) => build.id === selectedLeftBuildId);
    const right = builds.find((build) => build.id === selectedRightBuildId);
    if (!left || !right) {
      deps.setStatus("Select two Arena bots", { isError: true });
      return;
    }
    cancelledRef.current = false;
    setIsArenaRunning(true);
    setIsArenaPaused(false);
    setArenaProgress({ stage: "loading-python" });
    setLastMatches([]);
    deps.pause();
    deps.setBotLogs([]);
    deps.setStatus("Running Arena evaluation");
    void runArenaSeries(left, right);
  }

  function runArenaBuilds(left: BotBuild, right: BotBuild): void {
    if (isArenaRunning || workerRef.current) {
      return;
    }
    cancelledRef.current = false;
    setIsArenaRunning(true);
    setIsArenaPaused(false);
    setArenaProgress({ stage: "loading-python" });
    setLastMatches([]);
    deps.pause();
    deps.setBotLogs([]);
    deps.setStatus(`Running Arena: ${left.name} vs ${right.name}`);
    void runArenaSeries(left, right);
  }

  function runArenaWithLocalBot(options: RegisterLocalArenaBotOptions): void {
    if (isArenaRunning || workerRef.current) {
      return;
    }
    const right = builds.find((build) => build.id === selectedRightBuildId) ?? builds[0];
    if (!right) {
      deps.setStatus("Import or add an opponent bot first", { isError: true });
      return;
    }
    const left = createLocalBotBuild(options);
    setBuilds((current) => upsertBuild(current, left));
    setSelectedLeftBuildId(left.id);
    setSelectedRightBuildId(right.id);
    cancelledRef.current = false;
    setIsArenaRunning(true);
    setIsArenaPaused(false);
    setArenaProgress({ stage: "loading-python" });
    setLastMatches([]);
    deps.pause();
    deps.setBotLogs([]);
    deps.setStatus(`Running Arena: ${left.name} vs ${right.name}`);
    void runArenaSeries(left, right);
  }

  function cancelArena(): void {
    cancelledRef.current = true;
    stopLiveLoop(liveRafRef);
    teardownWorker(workerRef);
    setIsArenaRunning(false);
    setIsArenaPaused(false);
    setArenaProgress(null);
    deps.setStatus("Arena run cancelled");
  }

  function removeBuild(id: string): void {
    const next = removeArenaBuildState({
      builds,
      ratings,
      selectedLeftBuildId,
      selectedRightBuildId,
      removeBuildId: id,
    });
    setBuilds(next.builds);
    setRatings(next.ratings);
    setSelectedLeftBuildId(next.selectedLeftBuildId);
    setSelectedRightBuildId(next.selectedRightBuildId);
  }

  function removeGitHubRepo(owner: string, repo: string, ref: string): void {
    const next = removeArenaRepoState({
      builds,
      ratings,
      selectedLeftBuildId,
      selectedRightBuildId,
      owner,
      repo,
      ref,
    });
    setBuilds(next.builds);
    setRatings(next.ratings);
    setSelectedLeftBuildId(next.selectedLeftBuildId);
    setSelectedRightBuildId(next.selectedRightBuildId);
  }

  function forgetLocalBot(buildId: string): void {
    setRatings((current) => {
      const next = { ...current };
      delete next[buildId];
      return next;
    });
    if (selectedMyBotId === buildId || selectedMyBotId === buildId.replace(/^hangar:/, "")) {
      setSelectedMyBotId("");
    }
    setLastEvaluation((current) => (
      current && (current.leftBuildId === buildId || current.rightBuildId === buildId) ? null : current
    ));
  }

  async function runArenaSeries(left: BotBuild, right: BotBuild): Promise<void> {
    const seeds = seedsFromStart(arenaSeedStart, arenaSeedCount);
    try {
      const matches: ArenaLiveMatch[] = [];
      for (let index = 0; index < seeds.length; index += 1) {
        if (cancelledRef.current) {
          break;
        }
        matches.push(await runArenaLiveMatch(left, right, seeds[index], index + 1, seeds.length));
      }
      const summaries = matches.map((match) => matchSummaryFromReplay(match.replay, match.seed));
      const logs = matches.flatMap((match) => match.logs);
      const evaluation = summarizeArenaEvaluation({
        leftBuildId: left.id,
        rightBuildId: right.id,
        matches: summaries,
        previousRatings: ratings,
      });
      setLastMatches(summaries);
      setLastEvaluation(evaluation);
      setRatings(evaluation.ratings);
      depsRef.current.setBotLogs(logs);
      depsRef.current.setStatus(`Arena complete: ${left.name} ${evaluation.leftScore}-${evaluation.rightScore} ${right.name}`);
    } catch (error: unknown) {
      depsRef.current.setStatus(`Arena run failed: ${errorMessage(error)}`, { isError: true });
    } finally {
      stopLiveLoop(liveRafRef);
      teardownWorker(workerRef);
      setIsArenaRunning(false);
      setIsArenaPaused(false);
      setArenaProgress(null);
    }
  }

  function startLiveLoop(worker: Worker): void {
    stopLiveLoop(liveRafRef);
    liveRunningRef.current = true;
    setIsArenaPaused(false);
    liveStepPendingRef.current = false;
    liveAccumulatorRef.current = 0;
    liveLastTimestampRef.current = null;

    const tick = (timestamp: number) => {
      if (!liveRunningRef.current || workerRef.current !== worker) {
        return;
      }
      const previous = liveLastTimestampRef.current ?? timestamp;
      liveLastTimestampRef.current = timestamp;
      liveAccumulatorRef.current = Math.min(8, liveAccumulatorRef.current + ((timestamp - previous) * 60) / 1000);
      const count = Math.min(4, Math.floor(liveAccumulatorRef.current));
      if (count > 0 && !liveStepPendingRef.current) {
        liveAccumulatorRef.current -= count;
        liveStepPendingRef.current = true;
        worker.postMessage(liveStepRequest(count));
      }
      liveRafRef.current = requestAnimationFrame(tick);
    };

    liveRafRef.current = requestAnimationFrame(tick);
  }

  function stopCurrentLiveMatch(): void {
    stopLiveLoop(liveRafRef);
    liveRunningRef.current = false;
    liveStepPendingRef.current = false;
    liveAccumulatorRef.current = 0;
    liveLastTimestampRef.current = null;
    teardownWorker(workerRef);
  }

  function toggleArenaPause(): void {
    const worker = workerRef.current;
    if (!worker || !isArenaRunning) {
      return;
    }
    if (isArenaPaused) {
      deps.setStatus("Arena live");
      startLiveLoop(worker);
      return;
    }
    liveRunningRef.current = false;
    liveStepPendingRef.current = false;
    liveAccumulatorRef.current = 0;
    liveLastTimestampRef.current = null;
    stopLiveLoop(liveRafRef);
    setIsArenaPaused(true);
    deps.setStatus("Arena paused");
  }

  function runArenaLiveMatch(left: BotBuild, right: BotBuild, seed: number, runIndex: number, totalRuns: number): Promise<ArenaLiveMatch> {
    return new Promise((resolve, reject) => {
      let replay: BattleReplay | null = null;
      const logs: BotLogEntry[] = [];
      const worker = new Worker(new URL("../../hangar/hangarWorker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent) => {
        const message = parseWorkerMessage(event.data);
        if (!message) {
          return;
        }
        if (message.type === "progress") {
          setArenaProgress({ stage: message.stage, tick: message.tick, totalTicks: message.totalTicks });
          depsRef.current.setStatus(`Arena match ${runIndex}/${totalRuns} seed ${seed}`);
          return;
        }
        if (message.type === "ready") {
          replay = message.replay;
          depsRef.current.applyLiveReplay(message.replay);
          startLiveLoop(worker);
          return;
        }
        if (message.type === "frames") {
          liveStepPendingRef.current = false;
          if (message.logs.length > 0) {
            logs.push(...message.logs);
            depsRef.current.setBotLogs([...logs]);
          }
          if (replay && message.frames.length > 0) {
            replay = { ...replay, frames: [...replay.frames, ...message.frames] };
            depsRef.current.applyLiveReplay(replay);
            setArenaProgress({ stage: "simulating", tick: replay.frames[replay.frames.length - 1]?.tick ?? 0, totalTicks: arenaTickLimit });
          }
          if (message.finished) {
            const completedReplay = replay;
            stopCurrentLiveMatch();
            if (!completedReplay) {
              reject(new Error("Arena live run finished without replay"));
              return;
            }
            resolve({ seed, replay: completedReplay, logs });
          }
          return;
        }
        if (message.type === "error") {
          stopCurrentLiveMatch();
          reject(new Error(message.message));
        }
      };
      worker.onerror = (event: ErrorEvent) => {
        stopCurrentLiveMatch();
        reject(new Error(event.message || "worker error"));
      };
      worker.postMessage(liveSetupRequest({
        botSource: left.code,
        botSourcesByUnit: arenaBotSourcesByUnit(left, right),
        battleConfigJson: buildArenaBattleConfigJson({
          battlePresetId: arenaBattlePresetId,
          rulePresetId: arenaRulePresetId,
          seed,
          tickLimit: arenaTickLimit,
          entrants: [left, right],
        }),
        tickCount: arenaTickLimit,
      }));
    });
  }

  return {
    builds,
    ratings,
    selectedMyBotId,
    setSelectedMyBotId,
    selectedLeftBuildId,
    setSelectedLeftBuildId,
    selectedRightBuildId,
    setSelectedRightBuildId,
    arenaBattlePresetId,
    setArenaBattlePresetId,
    arenaRulePresetId,
    setArenaRulePresetId,
    arenaSeedStart,
    setArenaSeedStart,
    arenaSeedCount,
    setArenaSeedCount,
    arenaTickLimit,
    setArenaTickLimit,
    githubInput,
    setGithubInput,
    lastEvaluation,
    lastMatches,
    arenaProgress,
    isArenaRunning,
    isArenaPaused,
    isImportingBot,
    registerLocalBot,
    runArenaWithLocalBot,
    runArenaBuilds,
    importGitHubBot,
    runArena,
    toggleArenaPause,
    cancelArena,
    removeBuild,
    removeGitHubRepo,
    forgetLocalBot,
  };
}

function readStoredArenaState(): NormalizedArenaState {
  const fallback: NormalizedArenaState = {
    builds: [],
    ratings: {},
    selectedMyBotId: "",
    selectedLeftBuildId: "",
    selectedRightBuildId: "",
    battlePresetId: HANGAR_BATTLE_PRESETS[0]?.id ?? "",
    rulePresetId: HANGAR_RULE_PRESETS[0]?.id ?? "",
    seedStart: DEFAULT_SEED_START,
    seedCount: DEFAULT_SEED_COUNT,
    tickLimit: DEFAULT_TICK_LIMIT,
    githubInput: "",
    lastEvaluation: null,
    lastMatches: [],
  };
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as StoredArenaState;
    const builds = Array.isArray(parsed.builds) ? parsed.builds.filter(isBotBuild) : [];
    const selected = normalizeSelectedIds(
      builds,
      typeof parsed.selectedLeftBuildId === "string" ? parsed.selectedLeftBuildId : "",
      typeof parsed.selectedRightBuildId === "string" ? parsed.selectedRightBuildId : "",
    );
    return {
      builds,
      ratings: isRatingMap(parsed.ratings) ? parsed.ratings : {},
      selectedMyBotId: typeof parsed.selectedMyBotId === "string" ? parsed.selectedMyBotId : "",
      selectedLeftBuildId: selected.left,
      selectedRightBuildId: selected.right,
      battlePresetId: validPresetId(parsed.battlePresetId, HANGAR_BATTLE_PRESETS.map((preset) => preset.id), fallback.battlePresetId),
      rulePresetId: validPresetId(parsed.rulePresetId, HANGAR_RULE_PRESETS.map((preset) => preset.id), fallback.rulePresetId),
      seedStart: typeof parsed.seedStart === "number" ? Math.max(1, Math.floor(parsed.seedStart)) : fallback.seedStart,
      seedCount: typeof parsed.seedCount === "number" ? Math.max(1, Math.min(25, Math.floor(parsed.seedCount))) : fallback.seedCount,
      tickLimit: typeof parsed.tickLimit === "number" ? Math.max(1, Math.min(18000, Math.floor(parsed.tickLimit))) : fallback.tickLimit,
      githubInput: typeof parsed.githubInput === "string" ? parsed.githubInput : fallback.githubInput,
      lastEvaluation: isArenaEvaluationSummary(parsed.lastEvaluation) ? parsed.lastEvaluation : null,
      lastMatches: Array.isArray(parsed.lastMatches) ? parsed.lastMatches.filter(isArenaMatchSummary) : [],
    };
  } catch {
    return fallback;
  }
}

function writeStoredArenaState(state: StoredArenaState): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeSelectedIds(builds: BotBuild[], left: string, right: string): { left: string; right: string } {
  const ids = builds.map((build) => build.id);
  return {
    left: ids.includes(left) ? left : ids[0] ?? "",
    right: ids.includes(right) ? right : ids.find((id) => id !== left) ?? ids[1] ?? "",
  };
}

export { canStartArenaEvaluation };

function upsertBuild(builds: BotBuild[], next: BotBuild): BotBuild[] {
  const index = builds.findIndex((build) => build.id === next.id);
  if (index === -1) {
    return [...builds, next];
  }
  return builds.map((build, buildIndex) => buildIndex === index ? next : build);
}

function teardownWorker(workerRef: { current: Worker | null }): void {
  if (workerRef.current) {
    workerRef.current.terminate();
    workerRef.current = null;
  }
}

function stopLiveLoop(rafRef: { current: number | null }): void {
  if (rafRef.current !== null) {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }
}

function validPresetId(value: unknown, validIds: string[], fallback: string): string {
  return typeof value === "string" && validIds.includes(value) ? value : fallback;
}

function isBotBuild(value: unknown): value is BotBuild {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.code === "string"
    && isRecord(value.unit)
    && typeof value.unit.unitPresetId === "string"
    && isRecord(value.source);
}

function isRatingMap(value: unknown): value is Record<string, ArenaRatingEntry> {
  if (!isRecord(value)) {
    return false;
  }
  return Object.values(value).every(isRatingEntry);
}

function isRatingEntry(value: unknown): value is ArenaRatingEntry {
  return isRecord(value)
    && typeof value.buildId === "string"
    && typeof value.rating === "number"
    && typeof value.matches === "number"
    && typeof value.wins === "number"
    && typeof value.losses === "number"
    && typeof value.draws === "number";
}

function isArenaEvaluationSummary(value: unknown): value is ArenaEvaluationSummary {
  return isRecord(value)
    && typeof value.leftBuildId === "string"
    && typeof value.rightBuildId === "string"
    && typeof value.leftScore === "number"
    && typeof value.rightScore === "number"
    && (typeof value.winnerBuildId === "string" || value.winnerBuildId === null)
    && isRatingMap(value.ratings);
}

function isArenaMatchSummary(value: unknown): value is ArenaMatchSummary {
  return isRecord(value)
    && typeof value.seed === "number"
    && (typeof value.winnerTeamId === "number" || value.winnerTeamId === null)
    && typeof value.leftKills === "number"
    && typeof value.rightKills === "number"
    && typeof value.replayFrameCount === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
