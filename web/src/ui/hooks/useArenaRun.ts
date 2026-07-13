import { useEffect, useMemo, useRef, useState } from "react";

import {
  arenaBotSourcesByUnit,
  buildArenaBattleConfigJson,
  canStartArenaEvaluation,
  createLocalBotBuild,
  importGitHubBotBuild,
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
  arenaRunRequest,
  parseArenaWorkerMessage,
  type ArenaMatchMessage,
} from "../../arena/arenaWorkerProtocol.ts";
import type { HangarProgress } from "../../hangar/hangarWorkerProtocol.ts";

export type UseArenaRunDeps = {
  applyReplay: (replay: BattleReplay, autoplay: boolean) => void;
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
  isImportingBot: boolean;
  registerLocalBot: (options: RegisterLocalArenaBotOptions) => void;
  runArenaWithLocalBot: (options: RegisterLocalArenaBotOptions) => void;
  runArenaBuilds: (left: BotBuild, right: BotBuild) => void;
  importGitHubBot: () => Promise<void>;
  runArena: () => void;
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
  const [isImportingBot, setIsImportingBot] = useState(false);
  const cancelledRef = useRef(false);
  const workerRef = useRef<Worker | null>(null);

  const normalizedSelectedIds = useMemo(() => normalizeSelectedIds(builds, selectedLeftBuildId, selectedRightBuildId), [builds, selectedLeftBuildId, selectedRightBuildId]);
  useEffect(() => {
    if (selectedLeftBuildId !== normalizedSelectedIds.left) {
      setSelectedLeftBuildId(normalizedSelectedIds.left);
    }
    if (selectedRightBuildId !== normalizedSelectedIds.right) {
      setSelectedRightBuildId(normalizedSelectedIds.right);
    }
  }, [normalizedSelectedIds, selectedLeftBuildId, selectedRightBuildId]);

  useEffect(() => () => teardownWorker(workerRef), []);

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
      const build = await importGitHubBotBuild(input);
      setBuilds((current) => upsertBuild(current, build));
      setSelectedRightBuildId(build.id);
      setGithubInput("");
      deps.setStatus(`Imported ${build.name}`);
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
    setArenaProgress({ stage: "loading-python" });
    setLastMatches([]);
    deps.pause();
    deps.setBotLogs([]);
    deps.setStatus(`Running Arena: ${left.name} vs ${right.name}`);
    void runArenaSeries(left, right);
  }

  function cancelArena(): void {
    cancelledRef.current = true;
    teardownWorker(workerRef);
    setIsArenaRunning(false);
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
      const matches = await runArenaBatchWorker(left, right, seeds);
      const summaries = matches.map((match) => matchSummaryFromReplay(match.replay, match.seed));
      const logs = matches.flatMap((match) => match.logs);
      const lastReplay = matches[matches.length - 1]?.replay;
      if (lastReplay) {
        depsRef.current.applyReplay(lastReplay, true);
      }
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
      teardownWorker(workerRef);
      setIsArenaRunning(false);
      setArenaProgress(null);
    }
  }

  function runArenaBatchWorker(left: BotBuild, right: BotBuild, seeds: number[]): Promise<ArenaMatchMessage[]> {
    return new Promise((resolve, reject) => {
      const matches: ArenaMatchMessage[] = [];
      const worker = new Worker(new URL("../../arena/arenaWorker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent) => {
        const message = parseArenaWorkerMessage(event.data);
        if (!message) {
          return;
        }
        if (message.type === "progress") {
          setArenaProgress({ stage: message.stage, tick: message.tick, totalTicks: message.totalTicks });
          depsRef.current.setStatus(`Arena match ${message.runIndex}/${message.totalRuns} seed ${message.seed}`);
          return;
        }
        if (message.type === "match") {
          matches.push(message);
          return;
        }
        if (message.type === "done") {
          teardownWorker(workerRef);
          resolve(matches);
          return;
        }
        if (message.type === "error") {
          teardownWorker(workerRef);
          reject(new Error(message.message));
        }
      };
      worker.onerror = (event: ErrorEvent) => {
        teardownWorker(workerRef);
        reject(new Error(event.message || "worker error"));
      };
      worker.postMessage(arenaRunRequest({
        botSource: left.code,
        botSourcesByUnit: arenaBotSourcesByUnit(left, right),
        runs: seeds.map((seed) => ({
          seed,
          battleConfigJson: buildArenaBattleConfigJson({
            battlePresetId: arenaBattlePresetId,
            rulePresetId: arenaRulePresetId,
            seed,
            tickLimit: arenaTickLimit,
            entrants: [left, right],
          }),
          tickCount: arenaTickLimit,
        })),
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
    isImportingBot,
    registerLocalBot,
    runArenaWithLocalBot,
    runArenaBuilds,
    importGitHubBot,
    runArena,
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
