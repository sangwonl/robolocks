import { createRoot, type Root } from "react-dom/client";
import {
  createContext,
  lazy,
  memo,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FunctionComponent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  DockviewDefaultTab,
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";

import type { BattleFrame, FieldBoundsFrame, StaticObstacleFrame } from "../types/protocol";
import type { BattleReplay } from "../replay/replay";
import { parseBattleReplay } from "../replay/replay.ts";
import { CUSTOM_BATTLE_ID, MAX_HANGAR_TICKS, NO_OPPONENT_LOGIC_ID, HANGAR_BOT_LOGIC_PRESETS, HANGAR_BATTLE_PRESETS, HANGAR_RULE_PRESETS, HANGAR_UNIT_PRESETS, type SavedHangarBot } from "../hangar/hangar.ts";
import type { BotBuild } from "../arena/arena.ts";
import type { HangarProgress } from "../hangar/hangarWorkerProtocol.ts";
import { cn } from "../lib/utils.ts";
import { deriveStatusText } from "./statusText.ts";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Label } from "../components/ui/label.tsx";
import { BattleSceneThreeView } from "./BattleSceneThreeView.tsx";
import { BattleFieldEditor } from "./BattleFieldEditor.tsx";
import { BotConsole } from "./BotConsole.tsx";
import { Inspector, Stat } from "./Inspector.tsx";
import { PlaybackControls } from "./PlaybackControls.tsx";
import { RuleSummary } from "./RuleSummary.tsx";
import { teamCssVariables } from "./teamPalette.ts";
import { useArenaRun } from "./hooks/useArenaRun.ts";
import { shortcutAction, useReplayPlayback } from "./hooks/useReplayPlayback.ts";
import { useHangarRun } from "./hooks/useHangarRun.ts";

const CodeEditor = lazy(() => import("./CodeEditor.tsx").then((module) => ({ default: module.CodeEditor })));

export type RenderAppOptions = {
  defaultReplayUrl?: string | null;
  autoplayDefaultReplay?: boolean;
  fetchText?: (url: string) => Promise<string>;
};

const reactRoots = new WeakMap<HTMLElement, Root>();

// Stable empty-obstacle reference so the battle scene is not rebuilt every render
// while no replay is loaded (scene lifetime keys on the obstacles identity).
const NO_OBSTACLES: StaticObstacleFrame[] = [];

// Stable default field (matches the engine's default BattleBounds) used while no
// replay is loaded, so the scene/camera key on a constant identity.
const NO_FIELD: FieldBoundsFrame = { min: { x: 0, y: 0 }, max: { x: 40, y: 24 } };

// Bot authoring guide (rendered on GitHub). Linked from the Bot logic panel.
const BOT_GUIDE_URL = "https://github.com/sangwonl/robolocks/blob/main/docs/bots/writing-bots.md";
const ARENA_GUIDE_URL = "https://github.com/sangwonl/robolocks/blob/main/docs/bots/arena-guide.md";
const HANGAR_OWN_UNIT_ID = 1;

// Team colors are sourced once from teamPalette.ts and applied at the app
// root as CSS custom properties, so styles.css never hardcodes a team hex.
const TEAM_CSS_VARIABLES = teamCssVariables();

type PlaybackState = ReturnType<typeof useReplayPlayback>;
type HangarState = ReturnType<typeof useHangarRun>;
type ArenaState = ReturnType<typeof useArenaRun>;

type WorkbenchPanelContextValue = {
  canPlay: boolean;
  canStepBackward: boolean;
  canStepForward: boolean;
  frame: BattleFrame | null;
  frameCount: number;
  isLoading: boolean;
  isPlaying: boolean;
  loadReplayFile: (file: File) => Promise<void>;
  loadedReplay: BattleReplay | null;
  onPlayPause: () => void;
  playback: PlaybackState;
  replayIndex: number;
  hangar: HangarState;
  arena: ArenaState;
  statusIsError: boolean;
  statusText: string;
};

const WorkbenchPanelContext = createContext<WorkbenchPanelContextValue | null>(null);

const DOCKVIEW_COMPONENTS: Record<string, FunctionComponent<IDockviewPanelProps>> = {
  battle: BattleDockPanel,
  battleField: BattleFieldDockPanel,
  arena: ArenaDockPanel,
  hangar: HangarDockPanel,
  replay: ReplayDockPanel,
  rules: RulesDockPanel,
  units: UnitsDockPanel,
  console: ConsoleDockPanel,
};

function LockedDockTab(props: IDockviewPanelHeaderProps) {
  return <DockviewDefaultTab {...props} hideClose />;
}

const DOCK_PANEL_CLASS = "h-full min-h-0 overflow-auto bg-[var(--surface-raised)] p-2.5";
const STATE_DOCK_PANEL_CLASS = "h-full min-h-0 overflow-auto bg-[var(--surface-raised)] p-2";
const FIELD_CLASS = "grid gap-1.5 text-[11px] font-semibold text-[var(--text-dim)]";
const SELECT_CLASS =
  "h-7 w-full min-w-0 rounded-md border border-[var(--line)] bg-[var(--surface-inset)] px-2 py-1 text-[11px] font-semibold text-[var(--text-soft)] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-55";

export function renderApp(root: HTMLElement, options: RenderAppOptions = {}): void {
  const existing = reactRoots.get(root);
  if (existing) {
    existing.unmount();
  }
  const reactRoot = createRoot(root);
  reactRoots.set(root, reactRoot);
  reactRoot.render(<WorkbenchApp options={options} />);
}

const DockviewHost = memo(function DockviewHost({ onReady }: { onReady: (event: DockviewReadyEvent) => void }) {
  return (
    <div className="min-h-0 flex-1" onKeyDownCapture={handleDockKeyDownCapture}>
      <DockviewReact
        className="dockview-workbench dockview-theme-dark h-full min-h-0 bg-[var(--surface-app)] text-[var(--text)]"
        components={DOCKVIEW_COMPONENTS}
        defaultTabComponent={LockedDockTab}
        getTabContextMenuItems={() => []}
        keyboardNavigation={false}
        onReady={onReady}
      />
    </div>
  );
});

function WorkbenchApp({ options }: { options: RenderAppOptions }) {
  const [loadedReplay, setLoadedReplay] = useState<BattleReplay | null>(null);
  const [status, setStatusText] = useState("Ready");
  const [statusIsError, setStatusIsError] = useState(false);
  const setStatus = useCallback((message: string, options?: { isError?: boolean }) => {
    setStatusText(message);
    setStatusIsError(Boolean(options?.isError));
  }, []);
  const [isLoading, setIsLoading] = useState(false);
  const playback = useReplayPlayback(loadedReplay);
  const pendingReplayIndexRef = useRef<number | null>(null);
  const hangar = useHangarRun({
    applyReplay,
    applyLiveReplay,
    setStatus,
    pause: playback.pause,
  });
  const arena = useArenaRun({
    applyLiveReplay,
    setStatus,
    pause: playback.pause,
    setBotLogs: hangar.setBotLogs,
  });

  const fetchText = options.fetchText ?? fetchTextFromUrl;
  const defaultReplayUrl = options.defaultReplayUrl === undefined ? null : options.defaultReplayUrl;
  const autoplayDefaultReplay = options.autoplayDefaultReplay ?? false;

  const replayIndex = playback.frameIndex;
  const isPlaying = playback.isPlaying;
  const frame = loadedReplay?.frames[replayIndex] ?? null;
  const canStepBackward = Boolean(loadedReplay && replayIndex > 0);
  const canStepForward = Boolean(loadedReplay && replayIndex < loadedReplay.frames.length - 1);
  const canPlay = Boolean(loadedReplay && loadedReplay.frames.length > 1);
  const frameCount = loadedReplay?.frames.length ?? 0;

  useEffect(() => {
    const pendingIndex = pendingReplayIndexRef.current;
    if (pendingIndex === null || !loadedReplay) {
      return;
    }
    pendingReplayIndexRef.current = null;
    playback.stepTo(Math.min(pendingIndex, loadedReplay.frames.length - 1));
  }, [loadedReplay, playback]);

  const statusText = useMemo(() => {
    const frameLabel = loadedReplay && frame
      ? `Replay ${replayIndex + 1}/${loadedReplay.frames.length} - tick ${frame.tick}`
      : null;
    return deriveStatusText({ status, statusIsError, frameLabel });
  }, [frame, loadedReplay, replayIndex, status, statusIsError]);

  useEffect(() => {
    if (!defaultReplayUrl) {
      return;
    }
    void loadReplayUrl(defaultReplayUrl, autoplayDefaultReplay);
  }, [defaultReplayUrl, autoplayDefaultReplay]);

  // Global playback shortcuts: Space toggles play/pause, ArrowLeft/Right
  // step one frame, Shift+Arrow steps 10 frames. Active only once a replay
  // is loaded, and only when focus is not inside a text-entry surface (see
  // isEditableTarget below - this is what keeps Space from being swallowed
  // while typing bot code in the Monaco editor).
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented) {
        return;
      }
      if (!loadedReplay || isEditableTarget(event.target)) {
        return;
      }
      const action = shortcutAction(event);
      if (!action) {
        return;
      }
      const isRunning = hangar.isHangarRunning || arena.isArenaRunning;
      if (action === "toggle-play" && !canPlay && !isRunning) {
        return;
      }
      event.preventDefault();
      switch (action) {
        case "toggle-play":
          handlePlayPause();
          break;
        case "step-backward":
          playback.stepTo(Math.max(0, replayIndex - 1));
          break;
        case "step-forward":
          playback.stepTo(Math.min(frameCount - 1, replayIndex + 1));
          break;
        case "step-backward-large":
          playback.stepTo(Math.max(0, replayIndex - 10));
          break;
        case "step-forward-large":
          playback.stepTo(Math.min(frameCount - 1, replayIndex + 10));
          break;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [loadedReplay, canPlay, isPlaying, replayIndex, frameCount, playback, hangar, arena]);

  function handlePlayPause(): void {
    if (hangar.isHangarRunning) {
      hangar.toggleHangarPause();
      return;
    }
    if (arena.isArenaRunning) {
      arena.toggleArenaPause();
      return;
    }
    if (isPlaying) {
      playback.pause();
      return;
    }
    playback.play();
  }

  async function loadReplayUrl(url: string, autoplay: boolean): Promise<void> {
    playback.pause();
    setIsLoading(true);
    setStatus("Loading replay");
    try {
      applyReplayText(await fetchText(url), autoplay);
    } catch (error: unknown) {
      setLoadedReplay(null);
      setStatus(`Replay load failed: ${errorMessage(error)}`, { isError: true });
    } finally {
      setIsLoading(false);
    }
  }

  function applyReplayText(text: string, autoplay: boolean): void {
    applyReplay(parseBattleReplay(text), autoplay);
  }

  function applyReplay(replay: BattleReplay, autoplay: boolean): void {
    pendingReplayIndexRef.current = null;
    setLoadedReplay(replay);
    setStatus("Replay loaded");
    if (autoplay && replay.frames.length > 1) {
      playback.play();
    } else {
      playback.pause();
    }
  }

  function applyLiveReplay(replay: BattleReplay): void {
    pendingReplayIndexRef.current = Math.max(0, replay.frames.length - 1);
    setLoadedReplay(replay);
  }

  async function loadReplayFile(file: File): Promise<void> {
    playback.pause();
    setIsLoading(true);
    setStatus("Loading replay");
    try {
      hangar.setBotLogs([]);
      applyReplayText(await file.text(), false);
    } catch (error: unknown) {
      setLoadedReplay(null);
      setStatus(`Replay load failed: ${errorMessage(error)}`, { isError: true });
    } finally {
      setIsLoading(false);
    }
  }

  const panelContext = useMemo<WorkbenchPanelContextValue>(() => ({
    canPlay,
    canStepBackward,
    canStepForward,
    frame,
    frameCount,
    isLoading,
    isPlaying,
    loadReplayFile,
    loadedReplay,
    onPlayPause: handlePlayPause,
    playback,
    replayIndex,
    hangar,
    arena,
    statusIsError,
    statusText,
  }), [
    canPlay,
    canStepBackward,
    canStepForward,
    frame,
    frameCount,
    isLoading,
    isPlaying,
    loadedReplay,
    handlePlayPause,
    playback,
    replayIndex,
    hangar,
    arena,
    statusIsError,
    statusText,
  ]);

  const handleDockReady = useCallback((event: DockviewReadyEvent) => {
    event.api.addPanel({
      id: "battle-scene",
      component: "battle",
      title: "Battle Scene",
    });
    event.api.addPanel({
      id: "battle-field",
      component: "battleField",
      title: "Battle Field",
      inactive: true,
      position: { referencePanel: "battle-scene", direction: "within" },
    });
    event.api.addPanel({
      id: "hangar",
      component: "hangar",
      title: "Hangar",
      position: { referencePanel: "battle-scene", direction: "left" },
      initialWidth: 640,
    });
    event.api.addPanel({
      id: "arena",
      component: "arena",
      title: "Arena",
      inactive: true,
      position: { referencePanel: "hangar", direction: "within" },
    });
    event.api.addPanel({
      id: "units",
      component: "units",
      title: "Units",
      position: { referencePanel: "battle-scene", direction: "right" },
      initialWidth: 360,
    });
    event.api.addPanel({
      id: "rules",
      component: "rules",
      title: "Rules",
      inactive: true,
      position: { referencePanel: "units", direction: "within" },
    });
    event.api.addPanel({
      id: "console",
      component: "console",
      title: "Console",
      position: { referencePanel: "units", direction: "below" },
      initialHeight: 220,
    });
  }, []);

  return (
    <section
      className="flex h-full min-h-0 w-full flex-col overflow-hidden"
      style={{
        ...TEAM_CSS_VARIABLES,
      } as CSSProperties}
    >
      <WorkbenchPanelContext.Provider value={panelContext}>
        <DockviewHost onReady={handleDockReady} />
      </WorkbenchPanelContext.Provider>
      <div
        className="flex min-h-[26px] items-center gap-2.5 border-t border-[var(--line-strong)] bg-[var(--surface-sunken)] px-2.5 text-[11px] font-semibold text-[var(--text-muted)]"
        role="status"
      >
        <span className="text-[10px] font-bold uppercase text-[var(--brand)]">Robolocks</span>
        <strong
          className={cn(
            "min-w-0 overflow-hidden truncate text-[11px] font-semibold text-[var(--text-soft)]",
            statusIsError && "text-[var(--danger)]",
          )}
        >
          {statusText}
        </strong>
      </div>
    </section>
  );
}

async function fetchTextFromUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`.trim());
  }
  return response.text();
}

const HANGAR_STAGE_LABELS: Record<HangarProgress["stage"], string> = {
  "loading-python": "Loading Python runtime",
  "installing-sdk": "Installing SDK",
  simulating: "Simulating battle",
};

function useWorkbenchPanel(): WorkbenchPanelContextValue {
  const context = useContext(WorkbenchPanelContext);
  if (!context) {
    throw new Error("Workbench panel context is missing");
  }
  return context;
}

function BattleDockPanel() {
  const {
    canPlay,
    canStepBackward,
    canStepForward,
    frame,
    frameCount,
    isLoading,
    isPlaying,
    loadedReplay,
    onPlayPause,
    playback,
    replayIndex,
    hangar,
    arena,
  } = useWorkbenchPanel();
  const isRunPaused = hangar.isHangarRunning ? hangar.isHangarPaused : arena.isArenaPaused;
  const toggleRunPause = hangar.isHangarRunning ? hangar.toggleHangarPause : arena.toggleArenaPause;
  const stopRun = hangar.isHangarRunning ? hangar.cancelHangar : arena.cancelArena;
  return (
    <section className="battle-scene relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-[var(--surface-scene)]">
      <BattleSceneThreeView frame={frame} obstacles={loadedReplay?.obstacles ?? NO_OBSTACLES} field={loadedReplay?.frames[0]?.field ?? NO_FIELD} />
      {hangar.isHangarRunning ? (
        <HangarRunOverlay progress={hangar.hangarProgress} />
      ) : arena.isArenaRunning ? (
        <HangarRunOverlay progress={arena.arenaProgress} />
      ) : null}
      <PlaybackControls
        canPlay={canPlay}
        canStepBackward={canStepBackward}
        canStepForward={canStepForward}
        canRun={!isLoading && !hangar.isHangarRunning && !arena.isArenaRunning}
        isRunning={hangar.isHangarRunning || arena.isArenaRunning}
        isRunPaused={isRunPaused}
        onRun={hangar.runHangar}
        onRunPlayPause={toggleRunPause}
        onStopRun={stopRun}
        currentIndex={replayIndex}
        frame={frame}
        frameCount={frameCount}
        isPlaying={isPlaying}
        onNext={() => playback.stepTo(Math.min(frameCount - 1, replayIndex + 1))}
        onPlayPause={onPlayPause}
        onPrev={() => playback.stepTo(Math.max(0, replayIndex - 1))}
        onReset={() => playback.seek(0)}
        onSeek={(index) => playback.seek(index)}
        speed={playback.speed}
        onSpeedChange={playback.setSpeed}
      />
    </section>
  );
}

function BattleFieldDockPanel() {
  const { hangar } = useWorkbenchPanel();
  const selId = hangar.hangarBattlePresetId;
  const isCustom = hangar.isCustomBattleSelected;
  const isSaved = isCustom && selId !== CUSTOM_BATTLE_ID;
  const presetLabel = HANGAR_BATTLE_PRESETS.find((preset) => preset.id === selId)?.label ?? "—";

  const [nameDraft, setNameDraft] = useState(hangar.activeCustomBattleName);
  // Reset the name field whenever the selected battle changes.
  useEffect(() => {
    setNameDraft(hangar.activeCustomBattleName);
  }, [selId, hangar.activeCustomBattleName]);

  const running = hangar.isHangarRunning;
  const nameChanged = isSaved && nameDraft.trim() !== hangar.activeCustomBattleName;
  const canSave = isCustom && !running && (hangar.isCustomBattleDirty || nameChanged);

  return (
    <section className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 bg-[var(--surface-raised)] p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-dim)]">
        {isCustom ? (
          <>
            <span className="u-label text-[10px]">Name</span>
            <input
              className="min-w-0 flex-[1_1_140px] rounded-md border border-[var(--line-control)] bg-[var(--surface-well)] px-2 py-1 text-[11px] font-semibold text-[var(--text-soft)] disabled:opacity-55"
              value={nameDraft}
              placeholder={isSaved ? hangar.activeCustomBattleName : "Name this battle"}
              disabled={running}
              onChange={(event) => setNameDraft(event.currentTarget.value)}
            />
            {hangar.isCustomBattleDirty && (
              <span className="text-[10px] text-[var(--brand)]" title="Unsaved changes">
                ●
              </span>
            )}
            <button
              type="button"
              className="rounded-md border border-[var(--line-control)] bg-[var(--surface-well)] px-2 py-1 text-[10px] font-bold text-[var(--text-soft)] disabled:opacity-40"
              disabled={!canSave}
              onClick={() => hangar.saveCustomBattle(nameDraft)}
            >
              {isSaved ? "Save" : "Save as…"}
            </button>
            {isSaved && (
              <button
                type="button"
                className="rounded-md border border-[var(--status-contested-border)] bg-[var(--surface-well)] px-2 py-1 text-[10px] font-bold text-[var(--text-soft)] disabled:opacity-40"
                disabled={running}
                onClick={() => hangar.deleteCustomBattle(selId)}
              >
                Delete
              </button>
            )}
          </>
        ) : (
          <>
            <span className="u-label text-[10px]">Editing</span>
            <span className="rounded-md border border-[var(--line-control)] bg-[var(--surface-well)] px-2 py-1 text-[10px] font-bold text-[var(--text-soft)]">
              {presetLabel}
            </span>
            <span className="ml-auto u-label text-[9px] text-[var(--text-muted)]">edits fork into a Custom draft</span>
          </>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <BattleFieldEditor
          layout={hangar.editorLayout}
          dispatch={hangar.dispatchLayoutAction}
          disabled={running}
        />
      </div>
    </section>
  );
}

function HangarDockPanel() {
  const { isLoading, hangar } = useWorkbenchPanel();
  return (
    <section className="h-full min-h-0 overflow-hidden bg-[var(--surface-raised)] p-2.5">
      <div className="grid h-full min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-2">
        <div className="grid gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2">
          <span className="u-label text-[10px]">Battle Environment</span>
          <div className="flex min-w-0 flex-wrap items-end gap-x-1.5 gap-y-1.5" aria-label="Battle environment presets">
            <BattleEnvironmentControls isLoading={isLoading} hangar={hangar} />
          </div>
          <div className="grid gap-1.5 border-t border-[var(--line-control)] pt-1.5">
            <div className={FIELD_CLASS}>
              <Label htmlFor="hangar-opponent-bot">Opponent bot</Label>
              <select
                id="hangar-opponent-bot"
                className={SELECT_CLASS}
                value={hangar.opponentBotLogicPresetId}
                disabled={isLoading || hangar.isHangarRunning}
                onChange={(event) => hangar.setHangarOpponentLogicPresetId(event.currentTarget.value)}
              >
                <option value={NO_OPPONENT_LOGIC_ID}>No opponent</option>
                {HANGAR_BOT_LOGIC_PRESETS.filter((preset) => preset.id !== "custom").map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.id === "empty" ? "Dummy — stationary" : preset.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="grid min-h-0 grid-rows-[auto_auto_auto_minmax(0,1fr)] gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="u-label text-[10px]">My bot</span>
            <a
              href={BOT_GUIDE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-[9px] font-semibold text-[var(--brand)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
              title="Open the bot authoring guide (orders, movement model, examples)"
            >
              Guide ↗
            </a>
          </div>
          <BotLogicSaveBar />
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-1.5">
            <div className={FIELD_CLASS}>
              <Label htmlFor="hangar-own-unit">Unit preset</Label>
              <select
                id="hangar-own-unit"
                className={SELECT_CLASS}
                value={hangar.unitPresetByUnit[HANGAR_OWN_UNIT_ID] ?? HANGAR_UNIT_PRESETS[0]?.id}
                disabled={isLoading || hangar.isHangarRunning}
                onChange={(event) => hangar.setHangarUnitPresetId(HANGAR_OWN_UNIT_ID, event.currentTarget.value)}
              >
                {HANGAR_UNIT_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
            <span className="u-label pb-1 text-right text-[9px]">
              {(hangar.botLogicByUnit[HANGAR_OWN_UNIT_ID]?.editorSource ?? "") !== (hangar.botLogicByUnit[HANGAR_OWN_UNIT_ID]?.appliedSource ?? "") ? "edited" : "applied"}
            </span>
          </div>
          <div className={cn(FIELD_CLASS, "min-h-0")}>
            <Label>Bot code</Label>
            <Suspense
              fallback={
                <div className="u-label grid min-h-60 place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface-inset)] text-[10px]">
                  Loading editor
                </div>
              }
            >
              <CodeEditor
                disabled={isLoading}
                onApply={hangar.applyBotSource}
                onValueChange={hangar.setHangarBotSource}
                value={hangar.hangarBotSource}
              />
            </Suspense>
          </div>
        </div>
      </div>
    </section>
  );
}

function BattleEnvironmentControls({ isLoading, hangar }: { isLoading: boolean; hangar: HangarState }) {
  const mode = (hangar.hangarRulePreset?.rule as { mode?: string } | undefined)?.mode;
  const field =
    mode === "kill_limit_deathmatch" ? { key: "killLimit" as const, label: "Kill limit", max: 999 }
    : mode === "timed_deathmatch" ? { key: "timeLimitTicks" as const, label: "Time (ticks)", max: MAX_HANGAR_TICKS }
    : mode === "capture_point" ? { key: "captureHoldTicks" as const, label: "Hold ticks", max: MAX_HANGAR_TICKS }
    : null;
  return (
    <>
      <div className={cn(FIELD_CLASS, "min-w-0 flex-[1_1_116px]")}>
        <Label htmlFor="hangar-battle-preset">Battlefield</Label>
        <select
          id="hangar-battle-preset"
          className={SELECT_CLASS}
          value={hangar.hangarBattlePresetId}
          disabled={isLoading}
          onChange={(event) => hangar.selectHangarBattle(event.currentTarget.value)}
        >
          {HANGAR_BATTLE_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
          {hangar.savedCustomBattles.length > 0 && (
            <optgroup label="Saved">
              {hangar.savedCustomBattles.map((battle) => (
                <option key={battle.id} value={battle.id}>
                  {battle.name}
                </option>
              ))}
            </optgroup>
          )}
          <option value={CUSTOM_BATTLE_ID}>Custom (draft — edit in Battle Field tab)</option>
        </select>
      </div>
      <div className={cn(FIELD_CLASS, "min-w-0 flex-[1_1_116px]")}>
        <Label htmlFor="hangar-rule-preset">Rule</Label>
        <select
          id="hangar-rule-preset"
          className={SELECT_CLASS}
          value={hangar.hangarRulePresetId}
          disabled={isLoading}
          onChange={(event) => hangar.setHangarRulePresetId(event.currentTarget.value)}
        >
          {HANGAR_RULE_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </div>
      {field ? (
        <div className={cn(FIELD_CLASS, "flex-[0_0_92px]")}>
          <Label htmlFor="hangar-rule-param">{field.label}</Label>
          <Input
            id="hangar-rule-param"
            type="number"
            min={1}
            max={field.max}
            value={hangar.hangarRuleParams[field.key]}
            disabled={isLoading}
            onChange={(event) => {
              const next = event.currentTarget.valueAsNumber;
              if (!Number.isNaN(next)) {
                hangar.setHangarRuleParam(field.key, next);
              }
            }}
          />
        </div>
      ) : null}
      <div className={cn(FIELD_CLASS, "flex-[0_0_92px]")}>
        <Label htmlFor="hangar-ticks">Ticks</Label>
        <Input
          id="hangar-ticks"
          type="number"
          min={1}
          max={MAX_HANGAR_TICKS}
          value={hangar.hangarTickCount}
          disabled={isLoading}
          onChange={(event) => {
            const nextTickCount = event.currentTarget.valueAsNumber;
            if (!Number.isNaN(nextTickCount)) {
              hangar.setHangarTickCount(nextTickCount);
            }
          }}
        />
      </div>
    </>
  );
}

function BotLogicSaveBar() {
  const { arena, hangar } = useWorkbenchPanel();
  const activeUnit = HANGAR_OWN_UNIT_ID;
  const running = hangar.isHangarRunning;
  const activeLogic = hangar.botLogicByUnit[activeUnit];
  const activePresetLabel = hangar.hangarBotLogicPresetId !== "custom"
    ? HANGAR_BOT_LOGIC_PRESETS.find((preset) => preset.id === hangar.hangarBotLogicPresetId)?.label
    : "";
  const buildSource = activeLogic?.editorSource || activeLogic?.appliedSource || "";
  const selectedSavedBot = hangar.savedHangarBots.find((bot) => bot.id === hangar.selectedHangarBotId);

  const defaultBuildName = selectedSavedBot?.name || activePresetLabel || "My hangar bot";
  const [isCreatingBot, setIsCreatingBot] = useState(hangar.savedHangarBots.length === 0);
  const [buildNameDraft, setBuildNameDraft] = useState(defaultBuildName);
  // Reset the suggested bot name when entering creation or changing the selected bot/logic.
  useEffect(() => {
    setBuildNameDraft(defaultBuildName);
  }, [isCreatingBot, hangar.selectedHangarBotId, hangar.hangarBotLogicPresetId, defaultBuildName]);

  const canSaveBuild = !running && buildSource.trim().length > 0;
  const canDeleteBuild = !running && !isCreatingBot && Boolean(selectedSavedBot);

  function saveBuildToArena(): void {
    hangar.saveHangarBot(buildNameDraft.trim() || "Untitled bot");
    setIsCreatingBot(false);
  }

  function startNewBot(): void {
    hangar.clearSelectedHangarBot();
    setBuildNameDraft("");
    setIsCreatingBot(true);
  }

  function cancelNewBot(): void {
    setIsCreatingBot(false);
    setBuildNameDraft(defaultBuildName);
  }

  function deleteSelectedBot(): void {
    if (!hangar.selectedHangarBotId) {
      return;
    }
    arena.forgetLocalBot(hangarBotBuildIdFromSavedId(hangar.selectedHangarBotId));
    hangar.deleteHangarBot(hangar.selectedHangarBotId);
  }

  return (
    <div className={FIELD_CLASS}>
      <Label htmlFor="hangar-bot-selector">Bot</Label>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5">
        {isCreatingBot ? (
          <>
            <input
              id="hangar-bot-selector"
              className="h-7 min-w-0 rounded-md border border-[var(--brand-border)] bg-[var(--surface-well)] px-2 py-1 text-[11px] font-semibold text-[var(--text-soft)] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-55"
              value={buildNameDraft}
              placeholder="Untitled bot"
              disabled={running}
              onChange={(event) => setBuildNameDraft(event.currentTarget.value)}
            />
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                className="h-7 rounded-md border border-[var(--line-control)] bg-[var(--surface-well)] px-2 text-[10px] font-bold text-[var(--text-soft)] disabled:opacity-40"
                disabled={running}
                onClick={cancelNewBot}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-7 rounded-md border border-[var(--brand-border)] bg-[var(--surface-well)] px-2 text-[10px] font-bold text-[var(--brand)] disabled:opacity-40"
                disabled={!canSaveBuild}
                onClick={saveBuildToArena}
                title="Save this unit preset and Python code as a Hangar bot"
              >
                Save
              </button>
            </div>
          </>
        ) : (
          <>
            <select
              id="hangar-bot-selector"
              className={SELECT_CLASS}
              value={hangar.selectedHangarBotId}
              disabled={running || hangar.savedHangarBots.length === 0}
              onChange={(event) => {
                const id = event.currentTarget.value;
                if (id) {
                  hangar.loadHangarBot(id);
                }
              }}
            >
              {hangar.savedHangarBots.length > 0 && !selectedSavedBot ? (
                <option value="">Select bot</option>
              ) : null}
              {hangar.savedHangarBots.length === 0 ? (
                <option value="">No saved bots</option>
              ) : null}
              {hangar.savedHangarBots.map((bot) => (
                <option key={bot.id} value={bot.id}>
                  {bot.name}
                </option>
              ))}
            </select>
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                className="h-7 rounded-md border border-[var(--brand-border)] bg-[var(--surface-well)] px-2 text-[10px] font-bold text-[var(--brand)] disabled:opacity-40"
                disabled={running}
                onClick={startNewBot}
              >
                New bot
              </button>
              <button
                type="button"
                className="h-7 rounded-md border border-[var(--status-contested-border)] bg-[var(--surface-well)] px-2 text-[10px] font-bold text-[var(--text-soft)] disabled:opacity-40"
                disabled={!canDeleteBuild}
                onClick={deleteSelectedBot}
                title="Delete the selected Hangar bot"
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ArenaDockPanel() {
  const { arena, isLoading, hangar } = useWorkbenchPanel();
  const ratingBuilds = [...hangar.savedHangarBots.map(hangarBotToBuild), ...arena.builds];
  const selectedMyBot = findArenaBuildById(ratingBuilds, arena.selectedMyBotId) ?? ratingBuilds[0];
  const selectedOpponent = findArenaBuildById(ratingBuilds, arena.selectedRightBuildId) ?? ratingBuilds.find((build) => build.id !== selectedMyBot?.id) ?? ratingBuilds[0];
  const canRun = !isLoading && !arena.isArenaRunning && Boolean(selectedMyBot && selectedOpponent);
  const importedRepos = importedRepoGroups(arena.builds);

  return (
    <section className={DOCK_PANEL_CLASS}>
      <div className="grid gap-2 text-[11px] font-semibold text-[var(--text-dim)]">
        <div className="grid gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="u-label text-[10px]">Bot pool</span>
            <a
              href={ARENA_GUIDE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-[9px] font-semibold text-[var(--brand)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
              title="Open the Arena guide"
            >
              Guide ↗
            </a>
          </div>
          <div className={FIELD_CLASS}>
            <Label htmlFor="arena-repo-import">GitHub repo</Label>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
              <Input
                id="arena-repo-import"
                aria-label="GitHub bot repo"
                placeholder="owner/repo or github:owner/repo@ref"
                value={arena.githubInput}
                disabled={arena.isArenaRunning || arena.isImportingBot}
                onChange={(event) => arena.setGithubInput(event.currentTarget.value)}
              />
              <Button
                type="button"
                variant="secondary"
                className="h-7 px-2 text-[10px]"
                disabled={arena.isArenaRunning || arena.isImportingBot}
                onClick={() => void arena.importGitHubBot()}
              >
                {arena.isImportingBot ? "Importing" : "Import"}
              </Button>
            </div>
          </div>
          {importedRepos.length === 0 ? (
            <span className="text-[10px] text-[var(--text-muted)]">No repos imported yet.</span>
          ) : (
            <div className="grid gap-1">
              {importedRepos.map((repo) => (
                <div key={repo.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 rounded-md border border-[var(--line-control)] bg-[var(--surface-well)] px-2 py-1">
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-bold text-[var(--text-soft)]">{repo.owner}/{repo.repo}</div>
                    <div className="truncate text-[9px] text-[var(--text-muted)]">{repo.ref} · {repo.builds.length} bot{repo.builds.length === 1 ? "" : "s"}</div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${repo.owner}/${repo.repo}`}
                    title="Remove repo"
                    className="grid h-5 w-5 appearance-none place-items-center border-0 bg-transparent p-0 text-[13px] font-bold leading-none text-[var(--text-muted)] hover:rounded hover:bg-[var(--surface-hover)] hover:text-[var(--text-soft)] focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)] disabled:opacity-40"
                    disabled={arena.isArenaRunning}
                    onClick={() => arena.removeGitHubRepo(repo.owner, repo.repo, repo.ref)}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2">
          <span className="u-label text-[10px]">Battle Environment</span>
          <div className="grid grid-cols-2 gap-1.5">
            <div className={FIELD_CLASS}>
              <Label htmlFor="arena-left-bot">My bot</Label>
              <select
                id="arena-left-bot"
                className={SELECT_CLASS}
                value={selectedMyBot?.id ?? ""}
                disabled={arena.isArenaRunning}
                onChange={(event) => arena.setSelectedMyBotId(event.currentTarget.value)}
              >
                <ArenaBotOptions hangarBots={hangar.savedHangarBots} importedBuilds={arena.builds} />
              </select>
            </div>
            <div className={FIELD_CLASS}>
              <Label htmlFor="arena-right-bot">Opponent</Label>
              <select
                id="arena-right-bot"
                className={SELECT_CLASS}
                value={selectedOpponent?.id ?? ""}
                disabled={arena.isArenaRunning}
                onChange={(event) => arena.setSelectedRightBuildId(event.currentTarget.value)}
              >
                <ArenaBotOptions hangarBots={hangar.savedHangarBots} importedBuilds={arena.builds} />
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className={FIELD_CLASS}>
              <Label htmlFor="arena-battle">Battlefield</Label>
              <select
                id="arena-battle"
                className={SELECT_CLASS}
                value={arena.arenaBattlePresetId}
                disabled={arena.isArenaRunning}
                onChange={(event) => arena.setArenaBattlePresetId(event.currentTarget.value)}
              >
                {HANGAR_BATTLE_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={FIELD_CLASS}>
              <Label htmlFor="arena-rule">Rule</Label>
              <select
                id="arena-rule"
                className={SELECT_CLASS}
                value={arena.arenaRulePresetId}
                disabled={arena.isArenaRunning}
                onChange={(event) => arena.setArenaRulePresetId(event.currentTarget.value)}
              >
                {HANGAR_RULE_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5">
            <div className={FIELD_CLASS}>
              <Label htmlFor="arena-seed">Seed</Label>
              <Input
                id="arena-seed"
                type="number"
                min={1}
                value={arena.arenaSeedStart}
                disabled={arena.isArenaRunning}
                onChange={(event) => arena.setArenaSeedStart(event.currentTarget.valueAsNumber)}
              />
            </div>
            <div className={FIELD_CLASS}>
              <Label htmlFor="arena-seed-count">Runs</Label>
              <Input
                id="arena-seed-count"
                type="number"
                min={1}
                max={25}
                value={arena.arenaSeedCount}
                disabled={arena.isArenaRunning}
                onChange={(event) => arena.setArenaSeedCount(event.currentTarget.valueAsNumber)}
              />
            </div>
            <div className={FIELD_CLASS}>
              <Label htmlFor="arena-ticks">Ticks</Label>
              <Input
                id="arena-ticks"
                type="number"
                min={1}
                max={MAX_HANGAR_TICKS}
                value={arena.arenaTickLimit}
                disabled={arena.isArenaRunning}
                onChange={(event) => arena.setArenaTickLimit(event.currentTarget.valueAsNumber)}
              />
            </div>
            <Button
              type="button"
              className="mt-auto h-7 px-2 text-[10px]"
              disabled={!canRun}
              onClick={() => {
                if (!selectedMyBot || !selectedOpponent) return;
                arena.setSelectedMyBotId(selectedMyBot.id);
                arena.setSelectedRightBuildId(selectedOpponent.id);
                arena.runArenaBuilds(selectedMyBot, selectedOpponent);
              }}
            >
              Run
            </Button>
          </div>
          {!canRun ? (
            <span className="text-[10px] text-[var(--text-muted)]">
              Save or import at least one bot to run Arena.
            </span>
          ) : null}
        </div>

        <div className="grid gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2">
          <span className="u-label text-[10px]">Leaderboard</span>
          <div className="grid gap-1.5">
            <div className="grid gap-0.5">
              <span className="text-[10px] font-bold text-[var(--text-soft)]">Local ratings</span>
              <span className="text-[9px] text-[var(--text-muted)]">Updated only by completed Arena runs between two different bots.</span>
            </div>
            {ratingBuilds.length === 0 ? (
              <span className="text-[10px] text-[var(--text-muted)]">Save or import bots to start.</span>
            ) : (
              <div className="grid gap-1">
                {ratingBuilds
                  .sort((a, b) => ratingSortValue(arena.ratings[b.id]) - ratingSortValue(arena.ratings[a.id]))
                  .map((build, index) => {
                    const rating = arena.ratings[build.id];
                    return (
                      <div key={build.id} className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-md border border-[var(--line-control)] bg-[var(--surface-well)] px-2 py-1">
                        <div className="text-[10px] font-bold tabular-nums text-[var(--text-muted)]">#{index + 1}</div>
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-bold text-[var(--text-soft)]">{build.name}</div>
                          <div className="truncate text-[9px] text-[var(--text-muted)]">{buildOriginLabel(build)} · {ratingRecordSummary(rating)}</div>
                        </div>
                        <div className="text-right tabular-nums">
                          <div className="text-[11px] font-bold text-[var(--text)]">{rating && rating.matches > 0 ? Math.round(rating.rating) : "Unrated"}</div>
                          <div className="text-[9px] text-[var(--text-muted)]">{rating && rating.matches > 0 ? "rating" : "no runs"}</div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {arena.lastEvaluation ? (
            <div className="grid gap-1.5 pt-1">
              <span className="text-[10px] font-bold text-[var(--text-soft)]">Last run</span>
              <div className="grid gap-1 rounded-md border border-[var(--line-control)] bg-[var(--surface-well)] px-2 py-1.5">
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
                  <div className="min-w-0">
                    <div className="u-label text-[9px]">My bot</div>
                    <div className="truncate text-[11px] font-bold text-[var(--text-soft)]">{buildNameById(ratingBuilds, arena.lastEvaluation.leftBuildId)}</div>
                  </div>
                  <div className="rounded-md bg-[var(--surface-sunken)] px-2 py-1 text-center text-[12px] font-bold tabular-nums text-[var(--text)]">
                    {arena.lastEvaluation.leftScore}-{arena.lastEvaluation.rightScore}
                  </div>
                  <div className="min-w-0 text-right">
                    <div className="u-label text-[9px]">Opponent</div>
                    <div className="truncate text-[11px] font-bold text-[var(--text-soft)]">{buildNameById(ratingBuilds, arena.lastEvaluation.rightBuildId)}</div>
                  </div>
                </div>
                <div className="truncate text-[9px] text-[var(--text-muted)]">
                  {arena.lastMatches.length} run{arena.lastMatches.length === 1 ? "" : "s"} · seeds {arena.lastMatches.map((match) => match.seed).join(", ")}
                </div>
              </div>
              <div className="grid gap-0.5">
                {arena.lastMatches.map((match) => (
                  <div key={match.seed} className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                    <span className="tabular-nums">seed {match.seed}</span>
                    <span className="truncate">{arenaMatchWinnerLabel(match.winnerTeamId)}</span>
                    <span className="tabular-nums">kills {match.leftKills}-{match.rightKills}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function hangarBotToBuild(bot: SavedHangarBot): BotBuild {
  return {
    id: hangarBotBuildIdFromSavedId(bot.id),
    name: bot.name,
    version: "hangar",
    createdAt: bot.createdAt,
    sdkVersion: "0.1",
    author: "local",
    code: bot.code,
    unit: { unitPresetId: bot.unitPresetId },
    source: { kind: "local" },
  };
}

function ArenaBotOptions({
  hangarBots,
  importedBuilds,
}: {
  hangarBots: SavedHangarBot[];
  importedBuilds: BotBuild[];
}) {
  if (hangarBots.length === 0 && importedBuilds.length === 0) {
    return <option value="">No bots available</option>;
  }
  return (
    <>
      {hangarBots.length > 0 ? (
        <optgroup label="Hangar">
          {hangarBots.map((bot) => (
            <option key={bot.id} value={hangarBotBuildIdFromSavedId(bot.id)}>
              {bot.name}
            </option>
          ))}
        </optgroup>
      ) : null}
      {importedBuilds.length > 0 ? (
        <optgroup label="Imported">
          {importedBuilds.map((build) => (
            <option key={build.id} value={build.id}>
              {build.name}
            </option>
          ))}
        </optgroup>
      ) : null}
    </>
  );
}

function findArenaBuildById(builds: BotBuild[], id: string): BotBuild | undefined {
  return builds.find((build) => build.id === id)
    ?? builds.find((build) => build.id === hangarBotBuildIdFromSavedId(id));
}

function hangarBotBuildIdFromSavedId(savedBotId: string): string {
  return `hangar:${savedBotId}`;
}

type ImportedRepoGroup = {
  id: string;
  owner: string;
  repo: string;
  ref: string;
  builds: BotBuild[];
};

function importedRepoGroups(builds: BotBuild[]): ImportedRepoGroup[] {
  const byRepo = new Map<string, ImportedRepoGroup>();
  for (const build of builds) {
    if (build.source.kind !== "github") {
      continue;
    }
    const id = `${build.source.owner}/${build.source.repo}@${build.source.ref}`;
    const current = byRepo.get(id);
    if (current) {
      current.builds.push(build);
      continue;
    }
    byRepo.set(id, {
      id,
      owner: build.source.owner,
      repo: build.source.repo,
      ref: build.source.ref,
      builds: [build],
    });
  }
  return [...byRepo.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function ratingRecordSummary(rating: ArenaState["ratings"][string] | undefined): string {
  if (!rating || rating.matches === 0) {
    return "run Arena to record results";
  }
  return `${rating.matches} rated run${rating.matches === 1 ? "" : "s"} · ${rating.wins}W ${rating.losses}L ${rating.draws}D`;
}

function ratingSortValue(rating: ArenaState["ratings"][string] | undefined): number {
  if (!rating || rating.matches === 0) {
    return Number.NEGATIVE_INFINITY;
  }
  return rating.rating;
}

function arenaMatchWinnerLabel(winnerTeamId: number | null): string {
  if (winnerTeamId === 1) {
    return "My bot won";
  }
  if (winnerTeamId === 2) {
    return "Opponent won";
  }
  return "Draw";
}

function buildOriginLabel(build: BotBuild): string {
  if (build.source.kind === "github") {
    return `${build.source.owner}/${build.source.repo}`;
  }
  return "Hangar";
}

function buildNameById(builds: ArenaState["builds"], id: string): string {
  return builds.find((build) => build.id === id)?.name ?? id;
}

function ReplayDockPanel() {
  const { frame, isLoading, loadReplayFile, loadedReplay, replayIndex } = useWorkbenchPanel();
  return (
    <section className={DOCK_PANEL_CLASS}>
      <div className="grid gap-1.5 text-[11px] font-semibold text-[var(--text-dim)]">
        <Label htmlFor="replay-file">Replay JSON</Label>
        <Input
          id="replay-file"
          type="file"
          accept="application/json,.json"
          disabled={isLoading}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) {
              void loadReplayFile(file);
            }
          }}
        />
        <ReplaySummary replay={loadedReplay} frame={frame} replayIndex={replayIndex} />
      </div>
    </section>
  );
}

function UnitsDockPanel() {
  const { frame } = useWorkbenchPanel();
  return (
    <section className={STATE_DOCK_PANEL_CLASS}>
      <Inspector frame={frame} />
    </section>
  );
}

function RulesDockPanel() {
  const { frame } = useWorkbenchPanel();
  return (
    <section className={STATE_DOCK_PANEL_CLASS}>
      <RuleSummary frame={frame} />
    </section>
  );
}

function ConsoleDockPanel() {
  const { frame, hangar } = useWorkbenchPanel();
  return (
    <section className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)] overflow-hidden bg-[var(--surface-raised)] p-2">
      <BotConsole logs={hangar.botLogs} currentTick={frame?.tick ?? 0} />
    </section>
  );
}

// Lightweight run status shown over the battle viewport. Loading stages use a
// blocking overlay; live stepping uses a compact badge while controls stay in
// the playback bar.
function HangarRunOverlay({
  progress,
}: {
  progress: HangarProgress | null;
}) {
  const stage = progress?.stage ?? "loading-python";
  const stageLabel = HANGAR_STAGE_LABELS[stage];
  const showTicks = stage === "simulating" && typeof progress?.totalTicks === "number";
  if (stage === "simulating") {
    return (
      <div className="pointer-events-none absolute left-3 top-3 z-[4] flex items-center gap-2 border border-[var(--line)] bg-[var(--surface-panel)] px-2.5 py-1.5 shadow-[0_8px_24px_var(--shadow)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]" aria-hidden="true" />
        <span className="text-[10px] font-semibold text-[var(--text-soft)]">Live</span>
        {showTicks ? (
          <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
            tick {progress?.tick ?? 0} / {progress?.totalTicks}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <div
      className="absolute inset-0 z-[4] flex items-center justify-center bg-[var(--overlay)] backdrop-blur-md"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 border border-[var(--brand-border)] bg-[var(--overlay-strong)] px-7 py-5 text-center shadow-[0_14px_42px_var(--shadow)]">
        <span className="hangar-overlay-spinner" aria-hidden="true" />
        <span className="text-[13px] font-semibold text-[var(--text)]">{stageLabel}</span>
        {showTicks ? (
          <div className="grid gap-0.5">
            <span className="text-[13px] font-semibold tabular-nums text-[var(--text)]">tick {progress?.tick ?? 0}</span>
            <span className="u-label text-[9px] text-[var(--text-muted)]">runs until the rule decides · deadline {progress?.totalTicks}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ReplaySummary({
  replay,
  frame,
  replayIndex,
}: {
  replay: BattleReplay | null;
  frame: BattleFrame | null;
  replayIndex: number;
}) {
  if (!replay) {
    return <div className="text-[11px] font-semibold text-[var(--text-muted)]">No replay loaded.</div>;
  }
  return (
    <dl className="mt-2.5 grid grid-cols-2 gap-x-2 gap-y-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2">
      <Stat label="Frames" value={String(replay.frames.length)} />
      <Stat label="Tick Rate" value={`${replay.tickRate} Hz`} />
      <Stat label="Units" value={String(frame?.units.length ?? 0)} />
      <Stat label="Obstacles" value={String(replay.obstacles.length)} />
      <Stat label="Current" value={`${replayIndex + 1}/${replay.frames.length}`} />
      <Stat label="Tick" value={String(frame?.tick ?? 0)} />
    </dl>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Focus guard for the global playback shortcuts. Blocks the shortcuts
// whenever focus is anywhere text entry could consume the same keys:
// native inputs/textareas/selects, any contenteditable, and Monaco's
// editing surface. Monaco's own keyboard-capturing node already renders as
// a <textarea class="inputarea"> (verified in CodeEditor.tsx), so the
// TEXTAREA tag check alone covers it; the `.monaco-editor` closest() check
// is kept as a second, more resilient line of defense in case that
// internal implementation detail ever changes.
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {
    return true;
  }
  if (target.isContentEditable) {
    return true;
  }
  return target.closest(".monaco-editor") !== null;
}

function handleDockKeyDownCapture(event: ReactKeyboardEvent<HTMLDivElement>): void {
  if (event.key !== "Backspace" && event.key !== "Delete") {
    return;
  }
  const target = event.target;
  if (!(target instanceof HTMLElement) || isEditableTarget(target)) {
    return;
  }
  if (target.closest(".dv-tab") || target.closest(".dv-tabs-container")) {
    event.preventDefault();
    event.stopPropagation();
  }
}
