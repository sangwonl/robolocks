import { useEffect, useMemo, useRef, useState } from "react";

import type { BattleReplay } from "../../replay/replay";
import {
  DEFAULT_RESEARCH_BOT_SOURCE,
  NO_OP_BOT_SOURCE,
  RESEARCH_BOT_LOGIC_PRESETS,
  RESEARCH_BATTLE_PRESETS,
  RESEARCH_RULE_PRESETS,
  RESEARCH_UNIT_PRESETS,
  createResearchBattleConfigJson,
  createResearchSetupReplay,
  type BotLogEntry,
} from "../../research/research.ts";
import {
  parseWorkerMessage,
  runRequest,
  type ResearchProgress,
} from "../../research/researchWorkerProtocol.ts";

export type UseResearchRunDeps = {
  applyReplay: (replay: BattleReplay, autoplay: boolean) => void;
  setStatus: (status: string, options?: { isError?: boolean }) => void;
  pause: () => void;
};

export type UseResearchRunResult = {
  researchMode: ResearchMode;
  activeResearchBotUnitId: number;
  setActiveResearchBotUnitId: (unitId: number) => void;
  botLogicByUnit: Record<number, ResearchBotLogicState>;
  researchBattlePresetId: string;
  setResearchBattlePresetId: (id: string) => void;
  researchRulePresetId: string;
  setResearchRulePresetId: (id: string) => void;
  researchUnitPresetId: string;
  setResearchUnitPresetId: (id: string) => void;
  researchBotLogicPresetId: string;
  setResearchBotLogicPresetId: (unitId: number, id: string) => void;
  researchBotSource: string;
  setResearchBotSource: (source: string) => void;
  appliedBotSource: string;
  applyBotSource: () => void;
  researchTickCount: number;
  setResearchTickCount: (tickCount: number) => void;
  botLogs: BotLogEntry[];
  setBotLogs: (logs: BotLogEntry[]) => void;
  researchBattlePreset: (typeof RESEARCH_BATTLE_PRESETS)[number] | undefined;
  researchRulePreset: (typeof RESEARCH_RULE_PRESETS)[number] | undefined;
  researchUnitPreset: (typeof RESEARCH_UNIT_PRESETS)[number] | undefined;
  researchBattleConfigJson: string;
  isResearchRunning: boolean;
  researchProgress: ResearchProgress | null;
  setupResearch: () => void;
  runResearch: () => void;
  cancelResearch: () => void;
};

export type ResearchMode = "empty" | "ready" | "simulating" | "loaded";

export type ResearchBotLogicState = {
  presetId: string;
  editorSource: string;
  appliedSource: string;
};

const STORAGE_KEY = "robolocks.research.v1";

type StoredResearchState = {
  battlePresetId?: unknown;
  rulePresetId?: unknown;
  unitPresetId?: unknown;
  botLogicPresetId?: unknown;
  editorBotSource?: unknown;
  appliedBotSource?: unknown;
  activeBotUnitId?: unknown;
  botLogicByUnit?: unknown;
  tickCount?: unknown;
  mode?: unknown;
};

type NormalizedStoredResearchState = {
  battlePresetId: string;
  rulePresetId: string;
  unitPresetId: string;
  botLogicPresetId: string;
  editorBotSource: string;
  appliedBotSource: string;
  activeBotUnitId: number;
  botLogicByUnit: Record<number, ResearchBotLogicState>;
  tickCount: number;
  mode: ResearchMode;
};

export function useResearchRun(deps: UseResearchRunDeps): UseResearchRunResult {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const stored = readStoredResearchState();
  const [researchMode, setResearchMode] = useState<ResearchMode>(stored.mode);
  const [activeResearchBotUnitId, setActiveResearchBotUnitId] = useState(stored.activeBotUnitId);
  const [botLogicByUnit, setBotLogicByUnit] = useState<Record<number, ResearchBotLogicState>>(stored.botLogicByUnit);
  const [researchBattlePresetId, setResearchBattlePresetId] = useState(stored.battlePresetId);
  const [researchRulePresetId, setResearchRulePresetId] = useState(stored.rulePresetId);
  const [researchUnitPresetId, setResearchUnitPresetId] = useState(stored.unitPresetId);
  const [researchTickCount, setResearchTickCount] = useState(stored.tickCount);
  const [botLogs, setBotLogs] = useState<BotLogEntry[]>([]);
  const [isResearchRunning, setIsResearchRunning] = useState(false);
  const [researchProgress, setResearchProgress] = useState<ResearchProgress | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const researchBattlePreset = RESEARCH_BATTLE_PRESETS.find((preset) => preset.id === researchBattlePresetId) ?? RESEARCH_BATTLE_PRESETS[0];
  const researchRulePreset = RESEARCH_RULE_PRESETS.find((preset) => preset.id === researchRulePresetId) ?? RESEARCH_RULE_PRESETS[0];
  const researchUnitPreset = RESEARCH_UNIT_PRESETS.find((preset) => preset.id === researchUnitPresetId) ?? RESEARCH_UNIT_PRESETS[0];
  const researchBattleConfigJson = useMemo(
    () => createResearchBattleConfigJson({
      battlePresetId: researchBattlePresetId,
      rulePresetId: researchRulePresetId,
      unitPresetId: researchUnitPresetId,
      // The tick count is the deadline (safety cap), not a fixed run length: the
      // engine settles on score at this tick if the rule has not resolved first.
      maxTicks: researchTickCount,
    }),
    [researchBattlePresetId, researchRulePresetId, researchUnitPresetId, researchTickCount],
  );
  const activeBotLogic = botLogicByUnit[activeResearchBotUnitId] ?? emptyBotLogicState();
  const researchBotLogicPresetId = activeBotLogic.presetId;
  const researchBotSource = activeBotLogic.editorSource;
  const appliedBotSource = activeBotLogic.appliedSource;

  // Tear down the worker on unmount so a run in flight never outlives the app.
  useEffect(() => () => teardownWorker(workerRef), []);

  useEffect(() => {
    writeStoredResearchState({
      battlePresetId: researchBattlePresetId,
      rulePresetId: researchRulePresetId,
      unitPresetId: researchUnitPresetId,
      botLogicPresetId: researchBotLogicPresetId,
      editorBotSource: researchBotSource,
      appliedBotSource,
      activeBotUnitId: activeResearchBotUnitId,
      botLogicByUnit,
      tickCount: researchTickCount,
      mode: researchMode,
    });
  }, [
    appliedBotSource,
    activeResearchBotUnitId,
    botLogicByUnit,
    researchBattlePresetId,
    researchBotLogicPresetId,
    researchBotSource,
    researchMode,
    researchRulePresetId,
    researchTickCount,
    researchUnitPresetId,
  ]);

  useEffect(() => {
    if (researchMode !== "ready") {
      return;
    }
    depsRef.current.pause();
    depsRef.current.applyReplay(createResearchSetupReplay(researchBattleConfigJson), false);
  }, [researchBattleConfigJson, researchMode]);

  function finishRun(): void {
    teardownWorker(workerRef);
    setIsResearchRunning(false);
    setResearchProgress(null);
  }

  function setupResearch(): void {
    deps.pause();
    setBotLogs([]);
    setResearchMode("ready");
    deps.applyReplay(createResearchSetupReplay(researchBattleConfigJson), false);
    deps.setStatus("Research ready");
  }

  function setResearchBotLogicPresetId(unitId: number, id: string): void {
    const preset = RESEARCH_BOT_LOGIC_PRESETS.find((candidate) => candidate.id === id);
    if (!preset) {
      return;
    }
    setActiveResearchBotUnitId(unitId);
    if (preset.id === "custom") {
      setBotLogicByUnit((current) => ({
        ...current,
        [unitId]: {
          ...(current[unitId] ?? emptyBotLogicState()),
          presetId: "custom",
        },
      }));
      return;
    }
    setBotLogicByUnit((current) => ({
      ...current,
      [unitId]: stateFromPreset(preset),
    }));
  }

  function setResearchBotSource(source: string): void {
    setBotLogicByUnit((current) => {
      const previous = current[activeResearchBotUnitId] ?? emptyBotLogicState();
      const preset = RESEARCH_BOT_LOGIC_PRESETS.find((candidate) => candidate.id === previous.presetId);
      return {
        ...current,
        [activeResearchBotUnitId]: {
          ...previous,
          presetId: preset && preset.id !== "custom" && source !== preset.source ? "custom" : previous.presetId,
          editorSource: source,
        },
      };
    });
  }

  function applyBotSource(): void {
    setBotLogicByUnit((current) => {
      const previous = current[activeResearchBotUnitId] ?? emptyBotLogicState();
      return {
        ...current,
        [activeResearchBotUnitId]: {
          ...previous,
          appliedSource: previous.editorSource,
        },
      };
    });
    deps.setStatus("Bot logic applied");
  }

  function runResearch(): void {
    if (workerRef.current) {
      return;
    }
    deps.pause();
    setBotLogs([]);
    setIsResearchRunning(true);
    setResearchMode("simulating");
    setResearchProgress({ stage: "loading-python" });
    deps.setStatus("Running research");

    const worker = new Worker(new URL("../../research/researchWorker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent) => {
      const message = parseWorkerMessage(event.data);
      if (!message) {
        return;
      }
      if (message.type === "progress") {
        setResearchProgress({ stage: message.stage, tick: message.tick, totalTicks: message.totalTicks });
        return;
      }
      if (message.type === "done") {
        finishRun();
        setBotLogs(message.logs);
        deps.applyReplay(message.replay, true);
        setResearchMode("loaded");
        deps.setStatus(`Research run loaded - ${message.replay.frames.length} frames`);
        return;
      }
      finishRun();
      setResearchMode("ready");
      deps.setStatus(`Research run failed: ${message.message}`, { isError: true });
    };

    worker.onerror = (event: ErrorEvent) => {
      finishRun();
      setResearchMode("ready");
      deps.setStatus(`Research run failed: ${event.message || "worker error"}`, { isError: true });
    };

    worker.postMessage(runRequest({
      botSource: appliedBotSource || researchBotSource || (activeBotLogic.presetId === "empty" ? NO_OP_BOT_SOURCE : DEFAULT_RESEARCH_BOT_SOURCE),
      botSourcesByUnit: botSourcesByUnit(botLogicByUnit),
      battleConfigJson: researchBattleConfigJson,
      tickCount: researchTickCount,
    }));
  }

  function cancelResearch(): void {
    if (!workerRef.current) {
      return;
    }
    finishRun();
    setResearchMode("ready");
    deps.setStatus("Research run cancelled");
  }

  return {
    researchMode,
    activeResearchBotUnitId,
    setActiveResearchBotUnitId,
    botLogicByUnit,
    researchBattlePresetId,
    setResearchBattlePresetId,
    researchRulePresetId,
    setResearchRulePresetId,
    researchUnitPresetId,
    setResearchUnitPresetId,
    researchBotLogicPresetId,
    setResearchBotLogicPresetId,
    researchBotSource,
    setResearchBotSource,
    appliedBotSource,
    applyBotSource,
    researchTickCount,
    setResearchTickCount,
    botLogs,
    setBotLogs,
    researchBattlePreset,
    researchRulePreset,
    researchUnitPreset,
    researchBattleConfigJson,
    isResearchRunning,
    researchProgress,
    setupResearch,
    runResearch,
    cancelResearch,
  };
}

function teardownWorker(workerRef: { current: Worker | null }): void {
  if (workerRef.current) {
    workerRef.current.terminate();
    workerRef.current = null;
  }
}

function readStoredResearchState(): NormalizedStoredResearchState {
  const fallback: NormalizedStoredResearchState = {
    battlePresetId: RESEARCH_BATTLE_PRESETS[0]?.id ?? "",
    rulePresetId: RESEARCH_RULE_PRESETS[0]?.id ?? "",
    unitPresetId: RESEARCH_UNIT_PRESETS[0]?.id ?? "",
    botLogicPresetId: "advance_fire",
    editorBotSource: RESEARCH_BOT_LOGIC_PRESETS.find((p) => p.id === "advance_fire")?.source ?? "",
    appliedBotSource: RESEARCH_BOT_LOGIC_PRESETS.find((p) => p.id === "advance_fire")?.source ?? "",
    activeBotUnitId: 1,
    botLogicByUnit: {
      1: stateFromPresetId("advance_fire"),
      2: stateFromPresetId("hold_line"),
    },
    tickCount: 180,
    mode: "empty",
  };
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as StoredResearchState;
    const botLogicPresetId = validPresetId(
      parsed.botLogicPresetId,
      RESEARCH_BOT_LOGIC_PRESETS.map((preset) => preset.id),
      fallback.botLogicPresetId,
    );
    return {
      battlePresetId: validPresetId(parsed.battlePresetId, RESEARCH_BATTLE_PRESETS.map((preset) => preset.id), fallback.battlePresetId),
      rulePresetId: validPresetId(parsed.rulePresetId, RESEARCH_RULE_PRESETS.map((preset) => preset.id), fallback.rulePresetId),
      unitPresetId: validPresetId(parsed.unitPresetId, RESEARCH_UNIT_PRESETS.map((preset) => preset.id), fallback.unitPresetId),
      botLogicPresetId,
      editorBotSource: typeof parsed.editorBotSource === "string" ? parsed.editorBotSource : fallback.editorBotSource,
      appliedBotSource: typeof parsed.appliedBotSource === "string" ? parsed.appliedBotSource : fallback.appliedBotSource,
      activeBotUnitId: typeof parsed.activeBotUnitId === "number" ? parsed.activeBotUnitId : fallback.activeBotUnitId,
      botLogicByUnit: botLogicByUnitFromStored(parsed, fallback),
      tickCount: typeof parsed.tickCount === "number" ? parsed.tickCount : fallback.tickCount,
      mode: isResearchMode(parsed.mode) && parsed.mode !== "simulating" ? parsed.mode : fallback.mode,
    };
  } catch {
    return fallback;
  }
}

function writeStoredResearchState(state: StoredResearchState): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function validPresetId(value: unknown, validIds: string[], fallback: unknown): string {
  return typeof value === "string" && validIds.includes(value) ? value : String(fallback);
}

function isResearchMode(value: unknown): value is ResearchMode {
  return value === "empty" || value === "ready" || value === "simulating" || value === "loaded";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function botLogicByUnitFromStored(
  parsed: StoredResearchState,
  fallback: NormalizedStoredResearchState,
): Record<number, ResearchBotLogicState> {
  if (isRecord(parsed.botLogicByUnit)) {
    const entries = Object.entries(parsed.botLogicByUnit)
      .map(([unitId, value]) => [Number(unitId), botLogicStateFromUnknown(value)] as const)
      .filter(([unitId]) => Number.isFinite(unitId));
    if (entries.length > 0) {
      return Object.fromEntries(entries);
    }
  }
  return { ...fallback.botLogicByUnit };
}

function botLogicStateFromUnknown(value: unknown): ResearchBotLogicState {
  const object = isRecord(value) ? value : {};
  const presetId = validPresetId(
    object.presetId,
    RESEARCH_BOT_LOGIC_PRESETS.map((preset) => preset.id),
    "custom",
  );
  return {
    presetId,
    editorSource: typeof object.editorSource === "string" ? object.editorSource : "",
    appliedSource: typeof object.appliedSource === "string" ? object.appliedSource : "",
  };
}

function emptyBotLogicState(): ResearchBotLogicState {
  return {
    presetId: "empty",
    editorSource: "",
    appliedSource: "",
  };
}

function stateFromPresetId(presetId: string): ResearchBotLogicState {
  return stateFromPreset(RESEARCH_BOT_LOGIC_PRESETS.find((preset) => preset.id === presetId));
}

function stateFromPreset(preset: (typeof RESEARCH_BOT_LOGIC_PRESETS)[number] | undefined): ResearchBotLogicState {
  if (!preset) {
    return emptyBotLogicState();
  }
  return {
    presetId: preset.id,
    editorSource: preset.source,
    appliedSource: preset.source,
  };
}

function botSourcesByUnit(botLogicByUnit: Record<number, ResearchBotLogicState>): Record<number, string> {
  return Object.fromEntries(
    Object.entries(botLogicByUnit).map(([unitId, state]) => {
      const source = state.appliedSource || state.editorSource;
      if (source) {
        return [Number(unitId), source];
      }
      // When the user explicitly selects the "empty" preset, both sources are ""
      // and that is intentional — substitute a no-op bot so the simulation runs
      // with a stationary unit instead of crashing on an unregistered bot.
      if (state.presetId === "empty") {
        return [Number(unitId), NO_OP_BOT_SOURCE];
      }
      return [Number(unitId), DEFAULT_RESEARCH_BOT_SOURCE];
    }),
  );
}
