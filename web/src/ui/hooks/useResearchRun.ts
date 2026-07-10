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
  layoutFromPreset,
  layoutReducer,
  layoutToBattlePreset,
  CUSTOM_BATTLE_ID,
  SAVED_CUSTOM_ID_PREFIX,
  isSavedCustomId,
  type BotLogEntry,
  type CustomBattleLayout,
  type LayoutAction,
  type ResearchRuleParams,
  type SavedCustomBattle,
} from "../../research/research.ts";

// Concrete (all-present) rule parameters held in UI state; only the active rule's
// field is applied when building the battle config.
export type ResearchRuleParamState = {
  killLimit: number;
  timeLimitTicks: number;
  captureHoldTicks: number;
};

const DEFAULT_RULE_PARAMS: ResearchRuleParamState = {
  killLimit: 3,
  timeLimitTicks: 300,
  captureHoldTicks: 90,
};
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
  unitPresetByUnit: Record<number, string>;
  setResearchUnitPresetId: (unitId: number, id: string) => void;
  researchRuleParams: ResearchRuleParamState;
  setResearchRuleParam: (key: keyof ResearchRuleParamState, value: number) => void;
  customBattleLayout: CustomBattleLayout;
  // What the field editor shows: the selected preset's geometry when a preset is
  // active, or the editable Custom layout (draft or a saved battle) once forked.
  editorLayout: CustomBattleLayout;
  dispatchLayoutAction: (action: LayoutAction) => void;
  // Named custom battles saved to local storage.
  savedCustomBattles: SavedCustomBattle[];
  // True when the current selection is a custom battle (draft or saved).
  isCustomBattleSelected: boolean;
  // Name of the active custom battle (empty for an unsaved draft).
  activeCustomBattleName: string;
  // The active layout differs from what is saved (or is an unnamed draft).
  isCustomBattleDirty: boolean;
  // Select a battle by id (preset, "custom" draft, or a saved custom id). Loads
  // the layout of a saved custom into the editor.
  selectResearchBattle: (id: string) => void;
  // Save the current custom layout under a name: creates a new saved battle from
  // a draft, or overwrites the selected saved battle.
  saveCustomBattle: (name: string) => void;
  // Delete a saved custom battle by id.
  deleteCustomBattle: (id: string) => void;
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
  researchBattleConfigJson: string;
  isResearchRunning: boolean;
  researchProgress: ResearchProgress | null;
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
  unitPresetId?: unknown;          // legacy single-unit preset (migrated to unitPresetByUnit)
  unitPresetByUnit?: unknown;
  ruleParams?: unknown;
  customBattleLayout?: unknown;
  savedCustomBattles?: unknown;
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
  unitPresetByUnit: Record<number, string>;
  ruleParams: ResearchRuleParamState;
  customBattleLayout: CustomBattleLayout;
  savedCustomBattles: SavedCustomBattle[];
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
  const [unitPresetByUnit, setUnitPresetByUnit] = useState<Record<number, string>>(stored.unitPresetByUnit);
  const [researchRuleParams, setResearchRuleParams] = useState<ResearchRuleParamState>(stored.ruleParams);
  const [customBattleLayout, setCustomBattleLayout] = useState<CustomBattleLayout>(stored.customBattleLayout);
  const [savedCustomBattles, setSavedCustomBattles] = useState<SavedCustomBattle[]>(stored.savedCustomBattles);
  // The working layout differs from what is saved (or is an unnamed draft that has
  // never been saved). Not persisted: unsaved edits are lost on reload by design.
  const [isCustomBattleDirty, setIsCustomBattleDirty] = useState(stored.battlePresetId === CUSTOM_BATTLE_ID);
  const [researchTickCount, setResearchTickCount] = useState(stored.tickCount);
  const [botLogs, setBotLogs] = useState<BotLogEntry[]>([]);
  const [isResearchRunning, setIsResearchRunning] = useState(false);
  const [researchProgress, setResearchProgress] = useState<ResearchProgress | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const researchBattlePreset = RESEARCH_BATTLE_PRESETS.find((preset) => preset.id === researchBattlePresetId) ?? RESEARCH_BATTLE_PRESETS[0];
  const researchRulePreset = RESEARCH_RULE_PRESETS.find((preset) => preset.id === researchRulePresetId) ?? RESEARCH_RULE_PRESETS[0];

  // A custom battle is selected when the id is the draft or a saved custom. In
  // both cases the run and the editor use the working customBattleLayout.
  const activeSavedBattle = savedCustomBattles.find((battle) => battle.id === researchBattlePresetId);
  const isCustomBattleSelected = researchBattlePresetId === CUSTOM_BATTLE_ID || activeSavedBattle !== undefined;
  const activeCustomBattleName = activeSavedBattle?.name ?? "";

  const researchBattleConfigJson = useMemo(
    () => createResearchBattleConfigJson({
      // Saved customs and the draft all run the working layout via CUSTOM_BATTLE_ID.
      battlePresetId: isCustomBattleSelected ? CUSTOM_BATTLE_ID : researchBattlePresetId,
      rulePresetId: researchRulePresetId,
      customBattle: layoutToBattlePreset(customBattleLayout),
      unitPresetIdByUnit: unitPresetByUnit,
      ruleParams: researchRuleParams as ResearchRuleParams,
      // The tick count is the deadline (safety cap), not a fixed run length: the
      // engine settles on score at this tick if the rule has not resolved first.
      maxTicks: researchTickCount,
    }),
    [researchBattlePresetId, isCustomBattleSelected, researchRulePresetId, customBattleLayout, unitPresetByUnit, researchRuleParams, researchTickCount],
  );

  function setResearchUnitPresetId(unitId: number, id: string): void {
    setUnitPresetByUnit((current) => ({ ...current, [unitId]: id }));
  }

  function setResearchRuleParam(key: keyof ResearchRuleParamState, value: number): void {
    setResearchRuleParams((current) => ({ ...current, [key]: value }));
  }

  // The editor mirrors whatever battle is selected: a preset's geometry directly,
  // or the editable working layout (draft or a saved custom) once forked/selected.
  const editorLayout = isCustomBattleSelected
    ? customBattleLayout
    : layoutFromPreset(researchBattlePreset);

  // Editing the field uses the working layout. While a preset is selected the first
  // edit forks that preset into the Custom draft (not the stale working layout), so
  // edits build on the battlefield the user is looking at.
  function dispatchLayoutAction(action: LayoutAction): void {
    if (isCustomBattleSelected) {
      setCustomBattleLayout((current) => layoutReducer(current, action));
      setIsCustomBattleDirty(true);
      return;
    }
    setCustomBattleLayout(layoutReducer(layoutFromPreset(researchBattlePreset), action));
    setResearchBattlePresetId(CUSTOM_BATTLE_ID);
    setIsCustomBattleDirty(true);
  }

  // Select a battle by id. Choosing a saved custom loads its layout into the editor
  // (discarding any unsaved draft edits, per the explicit-save model).
  function selectResearchBattle(id: string): void {
    const saved = savedCustomBattles.find((battle) => battle.id === id);
    if (saved) {
      setCustomBattleLayout(saved.layout);
      setIsCustomBattleDirty(false);
    } else if (id === CUSTOM_BATTLE_ID) {
      // Returning to the draft keeps its working layout; treat it as unsaved.
      setIsCustomBattleDirty(true);
    }
    setResearchBattlePresetId(id);
  }

  // Save the working layout: a draft becomes a new saved battle, an already-saved
  // battle is overwritten (its name updated to the given name).
  function saveCustomBattle(name: string): void {
    const trimmed = name.trim() || defaultCustomName(savedCustomBattles);
    if (activeSavedBattle) {
      setSavedCustomBattles((list) =>
        list.map((battle) => (battle.id === activeSavedBattle.id ? { ...battle, name: trimmed, layout: customBattleLayout } : battle)),
      );
      setIsCustomBattleDirty(false);
      return;
    }
    const id = `${SAVED_CUSTOM_ID_PREFIX}${nextSavedCustomSuffix(savedCustomBattles)}`;
    setSavedCustomBattles((list) => [...list, { id, name: trimmed, layout: customBattleLayout }]);
    setResearchBattlePresetId(id);
    setIsCustomBattleDirty(false);
  }

  // Delete a saved custom battle. If it is the active selection, its layout stays
  // in the editor as an unsaved draft.
  function deleteCustomBattle(id: string): void {
    setSavedCustomBattles((list) => list.filter((battle) => battle.id !== id));
    if (researchBattlePresetId === id) {
      setResearchBattlePresetId(CUSTOM_BATTLE_ID);
      setIsCustomBattleDirty(true);
    }
  }

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
      unitPresetByUnit,
      ruleParams: researchRuleParams,
      customBattleLayout,
      savedCustomBattles,
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
    researchRuleParams,
    researchTickCount,
    unitPresetByUnit,
    customBattleLayout,
    savedCustomBattles,
  ]);

  // After a run, editing any setup (battle/units/rule/field) drops back to preview
  // so the scene reflects the new config instead of the stale run replay. There is
  // no explicit Setup step: changing the config re-arms the preview automatically.
  useEffect(() => {
    setResearchMode((mode) => (mode === "loaded" ? "ready" : mode));
  }, [researchBattleConfigJson]);

  // Keep the scene showing a live preview of the selected battle whenever a run
  // isn't loaded or in flight. This makes the field/spawns/obstacles of the
  // current battle visible on first open (and update as the config changes),
  // instead of a placeholder field.
  useEffect(() => {
    if (researchMode === "simulating" || researchMode === "loaded") {
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
    unitPresetByUnit,
    setResearchUnitPresetId,
    researchRuleParams,
    setResearchRuleParam,
    customBattleLayout,
    editorLayout,
    dispatchLayoutAction,
    savedCustomBattles,
    isCustomBattleSelected,
    activeCustomBattleName,
    isCustomBattleDirty,
    selectResearchBattle,
    saveCustomBattle,
    deleteCustomBattle,
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
    researchBattleConfigJson,
    isResearchRunning,
    researchProgress,
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
  const defaultUnitPresetId = RESEARCH_UNIT_PRESETS[0]?.id ?? "";
  const fallback: NormalizedStoredResearchState = {
    battlePresetId: RESEARCH_BATTLE_PRESETS[0]?.id ?? "",
    rulePresetId: RESEARCH_RULE_PRESETS[0]?.id ?? "",
    unitPresetByUnit: { 1: defaultUnitPresetId, 2: defaultUnitPresetId },
    ruleParams: { ...DEFAULT_RULE_PARAMS },
    customBattleLayout: layoutFromPreset(RESEARCH_BATTLE_PRESETS[0]),
    savedCustomBattles: [],
    botLogicPresetId: "charger",
    editorBotSource: RESEARCH_BOT_LOGIC_PRESETS.find((p) => p.id === "charger")?.source ?? "",
    appliedBotSource: RESEARCH_BOT_LOGIC_PRESETS.find((p) => p.id === "charger")?.source ?? "",
    activeBotUnitId: 1,
    botLogicByUnit: {
      1: stateFromPresetId("charger"),
      2: stateFromPresetId("orbiter"),
    },
    tickCount: 10000,
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
    const savedCustomBattles = savedCustomBattlesFromStored(parsed, fallback.customBattleLayout);
    // A selection may be a built-in preset, the Custom draft, or a saved custom id.
    const battleIds = [...RESEARCH_BATTLE_PRESETS.map((preset) => preset.id), CUSTOM_BATTLE_ID, ...savedCustomBattles.map((battle) => battle.id)];
    const battlePresetId = validPresetId(parsed.battlePresetId, battleIds, fallback.battlePresetId);
    // Selecting a saved custom loads its layout; otherwise keep the working draft.
    const activeSaved = savedCustomBattles.find((battle) => battle.id === battlePresetId);
    return {
      battlePresetId,
      rulePresetId: validPresetId(parsed.rulePresetId, RESEARCH_RULE_PRESETS.map((preset) => preset.id), fallback.rulePresetId),
      unitPresetByUnit: unitPresetByUnitFromStored(parsed, fallback),
      ruleParams: ruleParamsFromStored(parsed, fallback),
      customBattleLayout: activeSaved ? activeSaved.layout : customBattleLayoutFromStored(parsed, fallback),
      savedCustomBattles,
      botLogicPresetId,
      editorBotSource: typeof parsed.editorBotSource === "string" ? parsed.editorBotSource : fallback.editorBotSource,
      appliedBotSource: typeof parsed.appliedBotSource === "string" ? parsed.appliedBotSource : fallback.appliedBotSource,
      activeBotUnitId: typeof parsed.activeBotUnitId === "number" ? parsed.activeBotUnitId : fallback.activeBotUnitId,
      botLogicByUnit: botLogicByUnitFromStored(parsed, fallback),
      tickCount: typeof parsed.tickCount === "number" ? parsed.tickCount : fallback.tickCount,
      // The loaded replay isn't persisted, so "simulating"/"loaded" can't be
      // restored meaningfully; fall back to a preview mode that reflects the config.
      mode: isResearchMode(parsed.mode) && parsed.mode !== "simulating" && parsed.mode !== "loaded" ? parsed.mode : fallback.mode,
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

function unitPresetByUnitFromStored(
  parsed: StoredResearchState,
  fallback: NormalizedStoredResearchState,
): Record<number, string> {
  const validIds = RESEARCH_UNIT_PRESETS.map((preset) => preset.id);
  const resolve = (value: unknown, byUnit: number): string =>
    validPresetId(value, validIds, fallback.unitPresetByUnit[byUnit]);
  if (isRecord(parsed.unitPresetByUnit)) {
    const map = parsed.unitPresetByUnit;
    return { 1: resolve(map[1], 1), 2: resolve(map[2], 2) };
  }
  // Migrate the legacy single unit preset to both bots.
  if (typeof parsed.unitPresetId === "string") {
    const migrated = resolve(parsed.unitPresetId, 1);
    return { 1: migrated, 2: migrated };
  }
  return { ...fallback.unitPresetByUnit };
}

function customBattleLayoutFromStored(
  parsed: StoredResearchState,
  fallback: NormalizedStoredResearchState,
): CustomBattleLayout {
  return parseLayout(parsed.customBattleLayout, fallback.customBattleLayout);
}

function parseLayout(raw: unknown, fb: CustomBattleLayout): CustomBattleLayout {
  if (!isRecord(raw) || !isRecord(raw.field) || !Array.isArray(raw.obstacles)) {
    return fb;
  }
  const num = (value: unknown, fallbackValue: number): number =>
    typeof value === "number" && Number.isFinite(value) ? value : fallbackValue;
  const field = raw.field as Record<string, unknown>;
  const shape = field.shape === "circle" ? "circle" : "rect";
  const point = (value: unknown, fx: number, fy: number): { x: number; y: number } => {
    const p = isRecord(value) ? value : {};
    return { x: num(p.x, fx), y: num(p.y, fy) };
  };
  const spawn = (value: unknown, sfb: { x: number; y: number; headingDeg: number }) => {
    const s = isRecord(value) ? value : {};
    return { x: num(s.x, sfb.x), y: num(s.y, sfb.y), headingDeg: num(s.headingDeg, sfb.headingDeg) };
  };
  return {
    field: {
      shape,
      cx: num(field.cx, fb.field.cx),
      cy: num(field.cy, fb.field.cy),
      rx: num(field.rx, fb.field.rx),
      ry: num(field.ry, fb.field.ry),
    },
    obstacles: raw.obstacles
      .filter(isRecord)
      .map((o, index) => ({
        id: typeof o.id === "string" ? o.id : `obs_${index}`,
        x: num(o.x, 0),
        y: num(o.y, 0),
        radius: num(o.radius, 1.3),
      })),
    flag: point(raw.flag, fb.flag.x, fb.flag.y),
    blueSpawn: spawn(raw.blueSpawn, fb.blueSpawn),
    targetSpawn: spawn(raw.targetSpawn, fb.targetSpawn),
  };
}

function savedCustomBattlesFromStored(parsed: StoredResearchState, fallbackLayout: CustomBattleLayout): SavedCustomBattle[] {
  const raw = parsed.savedCustomBattles;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter(isRecord)
    .filter((battle): battle is Record<string, unknown> & { id: string } => typeof battle.id === "string" && isSavedCustomId(battle.id))
    .map((battle) => ({
      id: battle.id,
      name: typeof battle.name === "string" && battle.name.trim() ? battle.name : "Custom",
      layout: parseLayout(battle.layout, fallbackLayout),
    }));
}

function defaultCustomName(list: SavedCustomBattle[]): string {
  return `Custom ${list.length + 1}`;
}

function nextSavedCustomSuffix(list: SavedCustomBattle[]): number {
  let max = 0;
  for (const battle of list) {
    const match = new RegExp(`^${SAVED_CUSTOM_ID_PREFIX}(\\d+)$`).exec(battle.id);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return max + 1;
}

function ruleParamsFromStored(
  parsed: StoredResearchState,
  fallback: NormalizedStoredResearchState,
): ResearchRuleParamState {
  const stored = isRecord(parsed.ruleParams) ? parsed.ruleParams : {};
  const num = (value: unknown, fallbackValue: number): number =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallbackValue;
  return {
    killLimit: num(stored.killLimit, fallback.ruleParams.killLimit),
    timeLimitTicks: num(stored.timeLimitTicks, fallback.ruleParams.timeLimitTicks),
    captureHoldTicks: num(stored.captureHoldTicks, fallback.ruleParams.captureHoldTicks),
  };
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
