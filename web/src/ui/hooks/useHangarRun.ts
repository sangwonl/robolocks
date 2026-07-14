import { useEffect, useMemo, useRef, useState } from "react";

import type { BattleReplay } from "../../replay/replay";
import {
  DEFAULT_HANGAR_BOT_SOURCE,
  MAX_HANGAR_TICKS,
  NO_OP_BOT_SOURCE,
  NO_OPPONENT_LOGIC_ID,
  HANGAR_BOT_LOGIC_PRESETS,
  HANGAR_BATTLE_PRESETS,
  HANGAR_RULE_PRESETS,
  HANGAR_UNIT_PRESETS,
  createHangarBattleConfigJson,
  createHangarSetupReplay,
  layoutFromPreset,
  layoutReducer,
  layoutToBattlePreset,
  CUSTOM_BATTLE_ID,
  SAVED_CUSTOM_ID_PREFIX,
  SAVED_BOT_LOGIC_ID_PREFIX,
  SAVED_HANGAR_BOT_ID_PREFIX,
  isSavedCustomId,
  isSavedBotLogicId,
  isSavedHangarBotId,
  type BotLogEntry,
  type CustomBattleLayout,
  type LayoutAction,
  type HangarRuleParams,
  type SavedCustomBattle,
  type SavedBotLogic,
  type SavedHangarBot,
} from "../../hangar/hangar.ts";

// Concrete (all-present) rule parameters held in UI state; only the active rule's
// field is applied when building the battle config.
export type HangarRuleParamState = {
  killLimit: number;
  timeLimitTicks: number;
  captureHoldTicks: number;
};

const DEFAULT_RULE_PARAMS: HangarRuleParamState = {
  killLimit: 3,
  // Tick-denominated durations assume the 60Hz hangar tick rate.
  timeLimitTicks: 600,
  captureHoldTicks: 180,
};
import {
  liveSetupRequest,
  liveStepRequest,
  parseWorkerMessage,
  type HangarProgress,
} from "../../hangar/hangarWorkerProtocol.ts";

export type UseHangarRunDeps = {
  applyReplay: (replay: BattleReplay, autoplay: boolean) => void;
  applyLiveReplay: (replay: BattleReplay) => void;
  setStatus: (status: string, options?: { isError?: boolean }) => void;
  pause: () => void;
};

export type UseHangarRunResult = {
  hangarMode: HangarMode;
  activeHangarBotUnitId: number;
  setActiveHangarBotUnitId: (unitId: number) => void;
  botLogicByUnit: Record<number, HangarBotLogicState>;
  hangarBattlePresetId: string;
  setHangarBattlePresetId: (id: string) => void;
  hangarRulePresetId: string;
  setHangarRulePresetId: (id: string) => void;
  unitPresetByUnit: Record<number, string>;
  setHangarUnitPresetId: (unitId: number, id: string) => void;
  hangarRuleParams: HangarRuleParamState;
  setHangarRuleParam: (key: keyof HangarRuleParamState, value: number) => void;
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
  selectHangarBattle: (id: string) => void;
  // Save the current custom layout under a name: creates a new saved battle from
  // a draft, or overwrites the selected saved battle.
  saveCustomBattle: (name: string) => void;
  // Delete a saved custom battle by id.
  deleteCustomBattle: (id: string) => void;
  hangarBotLogicPresetId: string;
  setHangarBotLogicPresetId: (unitId: number, id: string) => void;
  opponentBotLogicPresetId: string;
  setHangarOpponentLogicPresetId: (id: string) => void;
  hangarBotSource: string;
  setHangarBotSource: (source: string) => void;
  appliedBotSource: string;
  applyBotSource: () => void;
  // Named bot logics saved to local storage, selectable in every unit's dropdown.
  savedBotLogics: SavedBotLogic[];
  // Name of the active unit's bot logic when it is a saved entry (else empty).
  activeBotLogicName: string;
  // The active unit's bot logic is a saved (named) entry.
  isActiveBotLogicSaved: boolean;
  // The active unit's editor source differs from its saved entry (unsaved edits).
  isActiveBotLogicDirty: boolean;
  // Save the active unit's editor source under a name: new entry, or overwrite the
  // active saved entry.
  saveBotLogic: (name: string) => void;
  // Delete a saved bot logic by id.
  deleteBotLogic: (id: string) => void;
  savedHangarBots: SavedHangarBot[];
  selectedHangarBotId: string;
  clearSelectedHangarBot: () => void;
  saveHangarBot: (name: string) => void;
  loadHangarBot: (id: string) => void;
  deleteHangarBot: (id: string) => void;
  hangarTickCount: number;
  setHangarTickCount: (tickCount: number) => void;
  botLogs: BotLogEntry[];
  setBotLogs: (logs: BotLogEntry[]) => void;
  hangarBattlePreset: (typeof HANGAR_BATTLE_PRESETS)[number] | undefined;
  hangarRulePreset: (typeof HANGAR_RULE_PRESETS)[number] | undefined;
  hangarBattleConfigJson: string;
  isHangarRunning: boolean;
  hangarProgress: HangarProgress | null;
  runHangar: () => void;
  cancelHangar: () => void;
};

export type HangarMode = "empty" | "ready" | "simulating" | "loaded";

export type HangarBotLogicState = {
  presetId: string;
  editorSource: string;
  appliedSource: string;
};

const STORAGE_KEY = "robolocks.hangar.v1";
const HANGAR_AUTHORING_UNIT_ID = 1;
const HANGAR_OPPONENT_UNIT_ID = 2;
// Bumped when tick-denominated persisted values need rescaling. v2 doubled every
// tick duration for the 30Hz -> 60Hz hangar tick-rate change.
const HANGAR_SCHEMA_VERSION = 2;

type StoredHangarState = {
  schemaVersion?: unknown;
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
  savedBotLogics?: unknown;
  savedHangarBots?: unknown;
  selectedHangarBotId?: unknown;
  tickCount?: unknown;
  mode?: unknown;
};

type NormalizedStoredHangarState = {
  battlePresetId: string;
  rulePresetId: string;
  unitPresetByUnit: Record<number, string>;
  ruleParams: HangarRuleParamState;
  customBattleLayout: CustomBattleLayout;
  savedCustomBattles: SavedCustomBattle[];
  botLogicPresetId: string;
  editorBotSource: string;
  appliedBotSource: string;
  activeBotUnitId: number;
  botLogicByUnit: Record<number, HangarBotLogicState>;
  savedBotLogics: SavedBotLogic[];
  savedHangarBots: SavedHangarBot[];
  selectedHangarBotId: string;
  tickCount: number;
  mode: HangarMode;
};

export function useHangarRun(deps: UseHangarRunDeps): UseHangarRunResult {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const stored = readStoredHangarState();
  const [hangarMode, setHangarMode] = useState<HangarMode>(stored.mode);
  const [activeHangarBotUnitId, setActiveHangarBotUnitIdRaw] = useState(HANGAR_AUTHORING_UNIT_ID);
  const [botLogicByUnit, setBotLogicByUnit] = useState<Record<number, HangarBotLogicState>>(stored.botLogicByUnit);
  const [savedBotLogics, setSavedBotLogics] = useState<SavedBotLogic[]>(stored.savedBotLogics);
  const [savedHangarBots, setSavedHangarBots] = useState<SavedHangarBot[]>(stored.savedHangarBots);
  const [selectedHangarBotId, setSelectedHangarBotId] = useState(stored.selectedHangarBotId);
  const [hangarBattlePresetId, setHangarBattlePresetId] = useState(stored.battlePresetId);
  const [hangarRulePresetId, setHangarRulePresetId] = useState(stored.rulePresetId);
  const [unitPresetByUnit, setUnitPresetByUnit] = useState<Record<number, string>>(stored.unitPresetByUnit);
  const [hangarRuleParams, setHangarRuleParams] = useState<HangarRuleParamState>(stored.ruleParams);
  const [customBattleLayout, setCustomBattleLayout] = useState<CustomBattleLayout>(stored.customBattleLayout);
  const [savedCustomBattles, setSavedCustomBattles] = useState<SavedCustomBattle[]>(stored.savedCustomBattles);
  // The working layout differs from what is saved (or is an unnamed draft that has
  // never been saved). Not persisted: unsaved edits are lost on reload by design.
  const [isCustomBattleDirty, setIsCustomBattleDirty] = useState(stored.battlePresetId === CUSTOM_BATTLE_ID);
  const [hangarTickCount, setHangarTickCountRaw] = useState(stored.tickCount);
  // The tick count is the deadline cap; keep it within the engine's supported range
  // so the displayed value always matches what actually runs.
  function setHangarTickCount(value: number): void {
    setHangarTickCountRaw(clampTickCount(value));
  }
  const [botLogs, setBotLogs] = useState<BotLogEntry[]>([]);
  const [isHangarRunning, setIsHangarRunning] = useState(false);
  const [hangarProgress, setHangarProgress] = useState<HangarProgress | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const liveReplayRef = useRef<BattleReplay | null>(null);
  const liveRunningRef = useRef(false);
  const liveStepPendingRef = useRef(false);
  const liveAccumulatorRef = useRef(0);
  const liveLastTimestampRef = useRef<number | null>(null);
  const liveRafRef = useRef<number | null>(null);

  const hangarBattlePreset = HANGAR_BATTLE_PRESETS.find((preset) => preset.id === hangarBattlePresetId) ?? HANGAR_BATTLE_PRESETS[0];
  const hangarRulePreset = HANGAR_RULE_PRESETS.find((preset) => preset.id === hangarRulePresetId) ?? HANGAR_RULE_PRESETS[0];

  // A custom battle is selected when the id is the draft or a saved custom. In
  // both cases the run and the editor use the working customBattleLayout.
  const activeSavedBattle = savedCustomBattles.find((battle) => battle.id === hangarBattlePresetId);
  const isCustomBattleSelected = hangarBattlePresetId === CUSTOM_BATTLE_ID || activeSavedBattle !== undefined;
  const activeCustomBattleName = activeSavedBattle?.name ?? "";
  const activeBotLogic = botLogicByUnit[activeHangarBotUnitId] ?? emptyBotLogicState();
  const hangarBotLogicPresetId = activeBotLogic.presetId;
  const hangarBotSource = activeBotLogic.editorSource;
  const appliedBotSource = activeBotLogic.appliedSource;
  const opponentBotLogicPresetId = botLogicByUnit[HANGAR_OPPONENT_UNIT_ID]?.presetId ?? "empty";

  const hangarBattleConfigJson = useMemo(
    () => createHangarBattleConfigJson({
      // Saved customs and the draft all run the working layout via CUSTOM_BATTLE_ID.
      battlePresetId: isCustomBattleSelected ? CUSTOM_BATTLE_ID : hangarBattlePresetId,
      rulePresetId: hangarRulePresetId,
      customBattle: layoutToBattlePreset(customBattleLayout),
      unitPresetIdByUnit: unitPresetByUnit,
      includeOpponent: opponentBotLogicPresetId !== NO_OPPONENT_LOGIC_ID,
      ruleParams: hangarRuleParams as HangarRuleParams,
      // The tick count is the deadline (safety cap), not a fixed run length: the
      // engine settles on score at this tick if the rule has not resolved first.
      maxTicks: hangarTickCount,
    }),
    [hangarBattlePresetId, isCustomBattleSelected, hangarRulePresetId, customBattleLayout, unitPresetByUnit, opponentBotLogicPresetId, hangarRuleParams, hangarTickCount],
  );

  function setHangarUnitPresetId(unitId: number, id: string): void {
    setUnitPresetByUnit((current) => ({ ...current, [unitId]: id }));
  }

  function setHangarRuleParam(key: keyof HangarRuleParamState, value: number): void {
    setHangarRuleParams((current) => ({ ...current, [key]: value }));
  }

  // The editor mirrors whatever battle is selected: a preset's geometry directly,
  // or the editable working layout (draft or a saved custom) once forked/selected.
  const editorLayout = isCustomBattleSelected
    ? customBattleLayout
    : layoutFromPreset(hangarBattlePreset);

  // Editing the field uses the working layout. While a preset is selected the first
  // edit forks that preset into the Custom draft (not the stale working layout), so
  // edits build on the battlefield the user is looking at.
  function dispatchLayoutAction(action: LayoutAction): void {
    if (isCustomBattleSelected) {
      setCustomBattleLayout((current) => layoutReducer(current, action));
      setIsCustomBattleDirty(true);
      return;
    }
    setCustomBattleLayout(layoutReducer(layoutFromPreset(hangarBattlePreset), action));
    setHangarBattlePresetId(CUSTOM_BATTLE_ID);
    setIsCustomBattleDirty(true);
  }

  // Select a battle by id. Choosing a saved custom loads its layout into the editor
  // (discarding any unsaved draft edits, per the explicit-save model).
  function selectHangarBattle(id: string): void {
    const saved = savedCustomBattles.find((battle) => battle.id === id);
    if (saved) {
      setCustomBattleLayout(saved.layout);
      setIsCustomBattleDirty(false);
    } else if (id === CUSTOM_BATTLE_ID) {
      // Returning to the draft keeps its working layout; treat it as unsaved.
      setIsCustomBattleDirty(true);
    }
    setHangarBattlePresetId(id);
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
    setHangarBattlePresetId(id);
    setIsCustomBattleDirty(false);
  }

  // Delete a saved custom battle. If it is the active selection, its layout stays
  // in the editor as an unsaved draft.
  function deleteCustomBattle(id: string): void {
    setSavedCustomBattles((list) => list.filter((battle) => battle.id !== id));
    if (hangarBattlePresetId === id) {
      setHangarBattlePresetId(CUSTOM_BATTLE_ID);
      setIsCustomBattleDirty(true);
    }
  }

  const activeSavedBotLogic = savedBotLogics.find((logic) => logic.id === activeBotLogic.presetId);
  const isActiveBotLogicSaved = activeSavedBotLogic !== undefined;
  const activeBotLogicName = activeSavedBotLogic?.name ?? "";
  const isActiveBotLogicDirty = isActiveBotLogicSaved && activeBotLogic.editorSource !== activeSavedBotLogic.source;

  // Save the active unit's editor source as a bot logic: a new named entry, or an
  // overwrite of the active saved entry.
  function saveBotLogic(name: string): void {
    const unitId = activeHangarBotUnitId;
    const state = botLogicByUnit[unitId] ?? emptyBotLogicState();
    const source = state.editorSource;
    const trimmed = name.trim() || defaultBotLogicName(savedBotLogics);
    if (isSavedBotLogicId(state.presetId)) {
      setSavedBotLogics((list) => list.map((logic) => (logic.id === state.presetId ? { ...logic, name: trimmed, source } : logic)));
      return;
    }
    const id = `${SAVED_BOT_LOGIC_ID_PREFIX}${nextSavedBotLogicSuffix(savedBotLogics)}`;
    setSavedBotLogics((list) => [...list, { id, name: trimmed, source }]);
    setBotLogicByUnit((current) => ({ ...current, [unitId]: { ...(current[unitId] ?? emptyBotLogicState()), presetId: id } }));
  }

  // Delete a saved bot logic. Units currently using it fall back to an unnamed
  // custom draft (their source is kept).
  function deleteBotLogic(id: string): void {
    setSavedBotLogics((list) => list.filter((logic) => logic.id !== id));
    setBotLogicByUnit((current) => {
      const next: Record<number, HangarBotLogicState> = {};
      for (const [unitId, state] of Object.entries(current)) {
        next[Number(unitId)] = state.presetId === id ? { ...state, presetId: "custom" } : state;
      }
      return next;
    });
  }

  // Tear down the worker on unmount so a run in flight never outlives the app.
  useEffect(() => () => {
    stopLiveLoop(liveRafRef);
    teardownWorker(workerRef);
  }, []);

  useEffect(() => {
    writeStoredHangarState({
      schemaVersion: HANGAR_SCHEMA_VERSION,
      battlePresetId: hangarBattlePresetId,
      rulePresetId: hangarRulePresetId,
      unitPresetByUnit,
      ruleParams: hangarRuleParams,
      customBattleLayout,
      savedCustomBattles,
      botLogicPresetId: hangarBotLogicPresetId,
      editorBotSource: hangarBotSource,
      appliedBotSource,
      activeBotUnitId: activeHangarBotUnitId,
      botLogicByUnit,
      savedBotLogics,
      savedHangarBots,
      selectedHangarBotId,
      tickCount: hangarTickCount,
      mode: hangarMode,
    });
  }, [
    appliedBotSource,
    activeHangarBotUnitId,
    botLogicByUnit,
    savedBotLogics,
    savedHangarBots,
    selectedHangarBotId,
    hangarBattlePresetId,
    hangarBotLogicPresetId,
    hangarBotSource,
    hangarMode,
    hangarRulePresetId,
    hangarRuleParams,
    hangarTickCount,
    unitPresetByUnit,
    customBattleLayout,
    savedCustomBattles,
  ]);

  // After a run, editing any setup (battle/units/rule/field) drops back to preview
  // so the scene reflects the new config instead of the stale run replay. There is
  // no explicit Setup step: changing the config re-arms the preview automatically.
  useEffect(() => {
    setHangarMode((mode) => (mode === "loaded" ? "ready" : mode));
  }, [hangarBattleConfigJson]);

  // Keep the scene showing a live preview of the selected battle whenever a run
  // isn't loaded or in flight. This makes the field/spawns/obstacles of the
  // current battle visible on first open (and update as the config changes),
  // instead of a placeholder field.
  useEffect(() => {
    if (hangarMode === "simulating" || hangarMode === "loaded") {
      return;
    }
    depsRef.current.pause();
    depsRef.current.applyReplay(createHangarSetupReplay(hangarBattleConfigJson), false);
  }, [hangarBattleConfigJson, hangarMode]);

  function finishRun(): void {
    stopLiveLoop(liveRafRef);
    liveRunningRef.current = false;
    liveStepPendingRef.current = false;
    liveAccumulatorRef.current = 0;
    liveLastTimestampRef.current = null;
    teardownWorker(workerRef);
    setIsHangarRunning(false);
    setHangarProgress(null);
  }

  function startLiveLoop(worker: Worker): void {
    stopLiveLoop(liveRafRef);
    liveRunningRef.current = true;
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

  function setHangarBotLogicPresetId(unitId: number, id: string): void {
    if (unitId === HANGAR_AUTHORING_UNIT_ID) {
      setSelectedHangarBotId("");
    }
    setActiveHangarBotUnitId(unitId);
    if (id === NO_OPPONENT_LOGIC_ID && unitId === HANGAR_OPPONENT_UNIT_ID) {
      setBotLogicByUnit((current) => ({
        ...current,
        [unitId]: { presetId: NO_OPPONENT_LOGIC_ID, editorSource: "", appliedSource: "" },
      }));
      return;
    }
    // A saved bot logic loads its source into the unit (both editor and applied).
    const saved = savedBotLogics.find((logic) => logic.id === id);
    if (saved) {
      setBotLogicByUnit((current) => ({
        ...current,
        [unitId]: { presetId: id, editorSource: saved.source, appliedSource: saved.source },
      }));
      return;
    }
    const preset = HANGAR_BOT_LOGIC_PRESETS.find((candidate) => candidate.id === id);
    if (!preset) {
      return;
    }
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

  function setHangarOpponentLogicPresetId(id: string): void {
    setHangarBotLogicPresetId(HANGAR_OPPONENT_UNIT_ID, id);
    setActiveHangarBotUnitId(HANGAR_AUTHORING_UNIT_ID);
  }

  function setActiveHangarBotUnitId(unitId: number): void {
    void unitId;
    setActiveHangarBotUnitIdRaw(HANGAR_AUTHORING_UNIT_ID);
  }

  function setHangarBotSource(source: string): void {
    setBotLogicByUnit((current) => {
      const previous = current[activeHangarBotUnitId] ?? emptyBotLogicState();
      const preset = HANGAR_BOT_LOGIC_PRESETS.find((candidate) => candidate.id === previous.presetId);
      return {
        ...current,
        [activeHangarBotUnitId]: {
          ...previous,
          presetId: preset && preset.id !== "custom" && source !== preset.source ? "custom" : previous.presetId,
          editorSource: source,
        },
      };
    });
  }

  function applyBotSource(): void {
    setBotLogicByUnit((current) => {
      const previous = current[activeHangarBotUnitId] ?? emptyBotLogicState();
      return {
        ...current,
        [activeHangarBotUnitId]: {
          ...previous,
          appliedSource: previous.editorSource,
        },
      };
    });
    deps.setStatus("Bot logic applied");
  }

  function saveHangarBot(name: string): void {
    const unitId = HANGAR_AUTHORING_UNIT_ID;
    const state = botLogicByUnit[unitId] ?? emptyBotLogicState();
    const code = state.editorSource || state.appliedSource;
    const trimmed = name.trim() || "My hangar bot";
    const now = new Date().toISOString();
    const bot: SavedHangarBot = {
      id: `${SAVED_HANGAR_BOT_ID_PREFIX}${nextSavedHangarBotSuffix(savedHangarBots)}`,
      name: trimmed,
      code,
      unitPresetId: unitPresetByUnit[unitId] ?? "",
      createdAt: now,
      updatedAt: now,
    };
    setSavedHangarBots((list) => [...list, bot]);
    setSelectedHangarBotId(bot.id);
  }

  function clearSelectedHangarBot(): void {
    setSelectedHangarBotId("");
  }

  function loadHangarBot(id: string): void {
    const bot = savedHangarBots.find((candidate) => candidate.id === id);
    if (!bot) {
      return;
    }
    setSelectedHangarBotId(bot.id);
    setUnitPresetByUnit((current) => ({ ...current, [HANGAR_AUTHORING_UNIT_ID]: bot.unitPresetId }));
    setBotLogicByUnit((current) => ({
      ...current,
      [HANGAR_AUTHORING_UNIT_ID]: { presetId: "custom", editorSource: bot.code, appliedSource: bot.code },
    }));
  }

  function deleteHangarBot(id: string): void {
    setSavedHangarBots((list) => list.filter((bot) => bot.id !== id));
    if (selectedHangarBotId === id) {
      setSelectedHangarBotId("");
    }
  }

  function runHangar(): void {
    if (workerRef.current) {
      return;
    }
    deps.pause();
    setBotLogs([]);
    setIsHangarRunning(true);
    setHangarMode("simulating");
    setHangarProgress({ stage: "loading-python" });
    deps.setStatus("Running hangar");

    const worker = new Worker(new URL("../../hangar/hangarWorker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent) => {
      const message = parseWorkerMessage(event.data);
      if (!message) {
        return;
      }
      if (message.type === "progress") {
        setHangarProgress({ stage: message.stage, tick: message.tick, totalTicks: message.totalTicks });
        return;
      }
      if (message.type === "ready") {
        liveReplayRef.current = message.replay;
        deps.applyLiveReplay(message.replay);
        setHangarProgress({ stage: "simulating", tick: 0, totalTicks: message.tickLimit });
        deps.setStatus("Hangar live");
        startLiveLoop(worker);
        return;
      }
      if (message.type === "frames") {
        liveStepPendingRef.current = false;
        const current = liveReplayRef.current;
        if (current && message.frames.length > 0) {
          const replay = {
            ...current,
            frames: [...current.frames, ...message.frames],
          };
          liveReplayRef.current = replay;
          deps.applyLiveReplay(replay);
          setHangarProgress({ stage: "simulating", tick: replay.frames[replay.frames.length - 1]?.tick ?? 0, totalTicks: hangarTickCount });
        }
        if (message.logs.length > 0) {
          setBotLogs((currentLogs) => [...currentLogs, ...message.logs]);
        }
        if (message.finished) {
          const frameCount = liveReplayRef.current?.frames.length ?? 0;
          finishRun();
          setHangarMode("loaded");
          deps.setStatus(`Hangar live complete - ${frameCount} frames`);
        }
        return;
      }
      if (message.type === "done") {
        finishRun();
        setBotLogs(message.logs);
        deps.applyReplay(message.replay, true);
        setHangarMode("loaded");
        deps.setStatus(`Hangar run loaded - ${message.replay.frames.length} frames`);
        return;
      }
      finishRun();
      setHangarMode("ready");
      deps.setStatus(`Hangar run failed: ${message.message}`, { isError: true });
    };

    worker.onerror = (event: ErrorEvent) => {
      finishRun();
      setHangarMode("ready");
      deps.setStatus(`Hangar run failed: ${event.message || "worker error"}`, { isError: true });
    };

    worker.postMessage(liveSetupRequest({
      botSource: appliedBotSource || hangarBotSource || (activeBotLogic.presetId === "empty" ? NO_OP_BOT_SOURCE : DEFAULT_HANGAR_BOT_SOURCE),
      botSourcesByUnit: botSourcesByUnit(botLogicByUnit),
      battleConfigJson: hangarBattleConfigJson,
      tickCount: hangarTickCount,
    }));
  }

  function cancelHangar(): void {
    if (!workerRef.current) {
      return;
    }
    finishRun();
    setHangarMode("ready");
    deps.setStatus("Hangar run cancelled");
  }

  return {
    hangarMode,
    activeHangarBotUnitId,
    setActiveHangarBotUnitId,
    botLogicByUnit,
    hangarBattlePresetId,
    setHangarBattlePresetId,
    hangarRulePresetId,
    setHangarRulePresetId,
    unitPresetByUnit,
    setHangarUnitPresetId,
    hangarRuleParams,
    setHangarRuleParam,
    customBattleLayout,
    editorLayout,
    dispatchLayoutAction,
    savedCustomBattles,
    isCustomBattleSelected,
    activeCustomBattleName,
    isCustomBattleDirty,
    selectHangarBattle,
    saveCustomBattle,
    deleteCustomBattle,
    hangarBotLogicPresetId,
    setHangarBotLogicPresetId,
    opponentBotLogicPresetId,
    setHangarOpponentLogicPresetId,
    hangarBotSource,
    setHangarBotSource,
    appliedBotSource,
    applyBotSource,
    savedBotLogics,
    activeBotLogicName,
    isActiveBotLogicSaved,
    isActiveBotLogicDirty,
    saveBotLogic,
    deleteBotLogic,
    savedHangarBots,
    selectedHangarBotId,
    clearSelectedHangarBot,
    saveHangarBot,
    loadHangarBot,
    deleteHangarBot,
    hangarTickCount,
    setHangarTickCount,
    botLogs,
    setBotLogs,
    hangarBattlePreset,
    hangarRulePreset,
    hangarBattleConfigJson,
    isHangarRunning,
    hangarProgress,
    runHangar,
    cancelHangar,
  };
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

function readStoredHangarState(): NormalizedStoredHangarState {
  const defaultUnitPresetId = HANGAR_UNIT_PRESETS[0]?.id ?? "";
  const fallback: NormalizedStoredHangarState = {
    battlePresetId: HANGAR_BATTLE_PRESETS[0]?.id ?? "",
    rulePresetId: HANGAR_RULE_PRESETS[0]?.id ?? "",
    unitPresetByUnit: { 1: defaultUnitPresetId, 2: defaultUnitPresetId },
    ruleParams: { ...DEFAULT_RULE_PARAMS },
    customBattleLayout: layoutFromPreset(HANGAR_BATTLE_PRESETS[0]),
    savedCustomBattles: [],
    savedBotLogics: [],
    savedHangarBots: [],
    selectedHangarBotId: "",
    botLogicPresetId: "charger",
    editorBotSource: HANGAR_BOT_LOGIC_PRESETS.find((p) => p.id === "charger")?.source ?? "",
    appliedBotSource: HANGAR_BOT_LOGIC_PRESETS.find((p) => p.id === "charger")?.source ?? "",
    activeBotUnitId: 1,
    botLogicByUnit: {
      1: stateFromPresetId("charger"),
      2: stateFromPresetId("orbiter"),
    },
    tickCount: MAX_HANGAR_TICKS,
    mode: "empty",
  };
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as StoredHangarState;
    // One-time migration: pre-v2 state stored tick durations at 30Hz. Double the
    // tick-denominated values so the real-time deadlines survive the 60Hz switch.
    const storedVersion = typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : 1;
    if (storedVersion < HANGAR_SCHEMA_VERSION) {
      if (typeof parsed.tickCount === "number") {
        parsed.tickCount = parsed.tickCount * 2;
      }
      if (isRecord(parsed.ruleParams)) {
        const ruleParams = parsed.ruleParams;
        if (typeof ruleParams.timeLimitTicks === "number") {
          ruleParams.timeLimitTicks = ruleParams.timeLimitTicks * 2;
        }
        if (typeof ruleParams.captureHoldTicks === "number") {
          ruleParams.captureHoldTicks = ruleParams.captureHoldTicks * 2;
        }
      }
    }
    const botLogicPresetId = validPresetId(
      parsed.botLogicPresetId,
      HANGAR_BOT_LOGIC_PRESETS.map((preset) => preset.id),
      fallback.botLogicPresetId,
    );
    const savedCustomBattles = savedCustomBattlesFromStored(parsed, fallback.customBattleLayout);
    const savedBotLogics = savedBotLogicsFromStored(parsed);
    const savedHangarBots = savedHangarBotsFromStored(parsed);
    // A selection may be a built-in preset, the Custom draft, or a saved custom id.
    const battleIds = [...HANGAR_BATTLE_PRESETS.map((preset) => preset.id), CUSTOM_BATTLE_ID, ...savedCustomBattles.map((battle) => battle.id)];
    const battlePresetId = validPresetId(parsed.battlePresetId, battleIds, fallback.battlePresetId);
    // Selecting a saved custom loads its layout; otherwise keep the working draft.
    const activeSaved = savedCustomBattles.find((battle) => battle.id === battlePresetId);
    // A unit's bot logic id may be a built-in preset or a saved bot logic id.
    const botLogicIds = [NO_OPPONENT_LOGIC_ID, ...HANGAR_BOT_LOGIC_PRESETS.map((preset) => preset.id), ...savedBotLogics.map((logic) => logic.id)];
    return {
      battlePresetId,
      rulePresetId: validPresetId(parsed.rulePresetId, HANGAR_RULE_PRESETS.map((preset) => preset.id), fallback.rulePresetId),
      unitPresetByUnit: unitPresetByUnitFromStored(parsed, fallback),
      ruleParams: ruleParamsFromStored(parsed, fallback),
      customBattleLayout: activeSaved ? activeSaved.layout : customBattleLayoutFromStored(parsed, fallback),
      savedCustomBattles,
      savedBotLogics,
      savedHangarBots,
      selectedHangarBotId: typeof parsed.selectedHangarBotId === "string" && savedHangarBots.some((bot) => bot.id === parsed.selectedHangarBotId) ? parsed.selectedHangarBotId : "",
      botLogicPresetId,
      editorBotSource: typeof parsed.editorBotSource === "string" ? parsed.editorBotSource : fallback.editorBotSource,
      appliedBotSource: typeof parsed.appliedBotSource === "string" ? parsed.appliedBotSource : fallback.appliedBotSource,
      activeBotUnitId: fallback.activeBotUnitId,
      botLogicByUnit: botLogicByUnitFromStored(parsed, fallback, botLogicIds),
      tickCount: typeof parsed.tickCount === "number" ? clampTickCount(parsed.tickCount) : fallback.tickCount,
      // The loaded replay isn't persisted, so "simulating"/"loaded" can't be
      // restored meaningfully; fall back to a preview mode that reflects the config.
      mode: isHangarMode(parsed.mode) && parsed.mode !== "simulating" && parsed.mode !== "loaded" ? parsed.mode : fallback.mode,
    };
  } catch {
    return fallback;
  }
}

function writeStoredHangarState(state: StoredHangarState): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clampTickCount(value: number): number {
  if (!Number.isFinite(value)) {
    return MAX_HANGAR_TICKS;
  }
  return Math.max(1, Math.min(MAX_HANGAR_TICKS, Math.floor(value)));
}

function validPresetId(value: unknown, validIds: string[], fallback: unknown): string {
  return typeof value === "string" && validIds.includes(value) ? value : String(fallback);
}

function isHangarMode(value: unknown): value is HangarMode {
  return value === "empty" || value === "ready" || value === "simulating" || value === "loaded";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function unitPresetByUnitFromStored(
  parsed: StoredHangarState,
  fallback: NormalizedStoredHangarState,
): Record<number, string> {
  const validIds = HANGAR_UNIT_PRESETS.map((preset) => preset.id);
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
  parsed: StoredHangarState,
  fallback: NormalizedStoredHangarState,
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

function savedCustomBattlesFromStored(parsed: StoredHangarState, fallbackLayout: CustomBattleLayout): SavedCustomBattle[] {
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
  parsed: StoredHangarState,
  fallback: NormalizedStoredHangarState,
): HangarRuleParamState {
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
  parsed: StoredHangarState,
  fallback: NormalizedStoredHangarState,
  validIds: string[],
): Record<number, HangarBotLogicState> {
  if (isRecord(parsed.botLogicByUnit)) {
    const entries = Object.entries(parsed.botLogicByUnit)
      .map(([unitId, value]) => [Number(unitId), botLogicStateFromUnknown(value, validIds)] as const)
      .filter(([unitId]) => Number.isFinite(unitId));
    if (entries.length > 0) {
      return Object.fromEntries(entries);
    }
  }
  return { ...fallback.botLogicByUnit };
}

function botLogicStateFromUnknown(value: unknown, validIds: string[]): HangarBotLogicState {
  const object = isRecord(value) ? value : {};
  // Unknown ids (e.g. a deleted saved logic) fall back to "custom" so the source
  // stays as an editable draft.
  const presetId = validPresetId(object.presetId, validIds, "custom");
  return {
    presetId,
    editorSource: typeof object.editorSource === "string" ? object.editorSource : "",
    appliedSource: typeof object.appliedSource === "string" ? object.appliedSource : "",
  };
}

function savedBotLogicsFromStored(parsed: StoredHangarState): SavedBotLogic[] {
  const raw = parsed.savedBotLogics;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter(isRecord)
    .filter((logic): logic is Record<string, unknown> & { id: string } => typeof logic.id === "string" && isSavedBotLogicId(logic.id))
    .map((logic) => ({
      id: logic.id,
      name: typeof logic.name === "string" && logic.name.trim() ? logic.name : "Logic",
      source: typeof logic.source === "string" ? logic.source : "",
    }));
}

function savedHangarBotsFromStored(parsed: StoredHangarState): SavedHangarBot[] {
  const raw = parsed.savedHangarBots;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter(isRecord)
    .filter((bot): bot is Record<string, unknown> & { id: string } => typeof bot.id === "string" && isSavedHangarBotId(bot.id))
    .map((bot) => ({
      id: bot.id,
      name: typeof bot.name === "string" && bot.name.trim() ? bot.name : "Hangar bot",
      code: typeof bot.code === "string" ? bot.code : "",
      unitPresetId: typeof bot.unitPresetId === "string" ? bot.unitPresetId : HANGAR_UNIT_PRESETS[0]?.id ?? "",
      createdAt: typeof bot.createdAt === "string" ? bot.createdAt : "",
      updatedAt: typeof bot.updatedAt === "string" ? bot.updatedAt : "",
    }));
}

function defaultBotLogicName(list: SavedBotLogic[]): string {
  return `Logic ${list.length + 1}`;
}

function nextSavedBotLogicSuffix(list: SavedBotLogic[]): number {
  let max = 0;
  for (const logic of list) {
    const match = new RegExp(`^${SAVED_BOT_LOGIC_ID_PREFIX}(\\d+)$`).exec(logic.id);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return max + 1;
}

function nextSavedHangarBotSuffix(list: SavedHangarBot[]): number {
  let max = 0;
  for (const bot of list) {
    const match = new RegExp(`^${SAVED_HANGAR_BOT_ID_PREFIX}(\\d+)$`).exec(bot.id);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return max + 1;
}

function emptyBotLogicState(): HangarBotLogicState {
  return {
    presetId: "empty",
    editorSource: "",
    appliedSource: "",
  };
}

function stateFromPresetId(presetId: string): HangarBotLogicState {
  return stateFromPreset(HANGAR_BOT_LOGIC_PRESETS.find((preset) => preset.id === presetId));
}

function stateFromPreset(preset: (typeof HANGAR_BOT_LOGIC_PRESETS)[number] | undefined): HangarBotLogicState {
  if (!preset) {
    return emptyBotLogicState();
  }
  return {
    presetId: preset.id,
    editorSource: preset.source,
    appliedSource: preset.source,
  };
}

function botSourcesByUnit(botLogicByUnit: Record<number, HangarBotLogicState>): Record<number, string> {
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
      return [Number(unitId), DEFAULT_HANGAR_BOT_SOURCE];
    }),
  );
}
