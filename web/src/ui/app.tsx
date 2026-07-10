import { createRoot, type Root } from "react-dom/client";
import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FunctionComponent,
} from "react";
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";

import type { BattleFrame, FieldBoundsFrame, StaticObstacleFrame } from "../types/protocol";
import type { BattleReplay } from "../replay/replay";
import { parseBattleReplay } from "../replay/replay.ts";
import { CUSTOM_BATTLE_ID, MAX_RESEARCH_TICKS, RESEARCH_BOT_LOGIC_PRESETS, RESEARCH_BATTLE_PRESETS, RESEARCH_RULE_PRESETS, RESEARCH_UNIT_PRESETS } from "../research/research.ts";
import type { ResearchProgress } from "../research/researchWorkerProtocol.ts";
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
import { shortcutAction, useReplayPlayback } from "./hooks/useReplayPlayback.ts";
import { useResearchRun } from "./hooks/useResearchRun.ts";

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

// Team colors are sourced once from teamPalette.ts and applied at the app
// root as CSS custom properties, so styles.css never hardcodes a team hex.
const TEAM_CSS_VARIABLES = teamCssVariables();

type PlaybackState = ReturnType<typeof useReplayPlayback>;
type ResearchState = ReturnType<typeof useResearchRun>;

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
  research: ResearchState;
  statusIsError: boolean;
  statusText: string;
};

const WorkbenchPanelContext = createContext<WorkbenchPanelContextValue | null>(null);

const DOCKVIEW_COMPONENTS: Record<string, FunctionComponent<IDockviewPanelProps>> = {
  battle: BattleDockPanel,
  battleField: BattleFieldDockPanel,
  research: ResearchDockPanel,
  replay: ReplayDockPanel,
  rules: RulesDockPanel,
  units: UnitsDockPanel,
  console: ConsoleDockPanel,
};

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
  const research = useResearchRun({
    applyReplay,
    setStatus,
    pause: playback.pause,
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
      if (action === "toggle-play" && !canPlay) {
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
  }, [loadedReplay, canPlay, isPlaying, replayIndex, frameCount, playback, research]);

  function handlePlayPause(): void {
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
    setLoadedReplay(replay);
    setStatus("Replay loaded");
    if (autoplay && replay.frames.length > 1) {
      playback.play();
    } else {
      playback.pause();
    }
  }

  async function loadReplayFile(file: File): Promise<void> {
    playback.pause();
    setIsLoading(true);
    setStatus("Loading replay");
    try {
      research.setBotLogs([]);
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
    research,
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
    research,
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
      id: "research",
      component: "research",
      title: "Research",
      position: { referencePanel: "battle-scene", direction: "left" },
      initialWidth: 640,
    });
    event.api.addPanel({
      id: "replay",
      component: "replay",
      title: "Replay",
      inactive: true,
      position: { referencePanel: "research", direction: "within" },
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
        <DockviewReact
          className="dockview-workbench dockview-theme-dark min-h-0 flex-1 bg-[var(--surface-app)] text-[var(--text)]"
          components={DOCKVIEW_COMPONENTS}
          onReady={handleDockReady}
        />
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

const RESEARCH_STAGE_LABELS: Record<ResearchProgress["stage"], string> = {
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
    research,
  } = useWorkbenchPanel();
  return (
    <section className="battle-scene relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-[var(--surface-scene)]">
      <BattleSceneThreeView frame={frame} obstacles={loadedReplay?.obstacles ?? NO_OBSTACLES} field={loadedReplay?.frames[0]?.field ?? NO_FIELD} />
      {research.isResearchRunning ? (
        <ResearchRunOverlay progress={research.researchProgress} onCancel={research.cancelResearch} />
      ) : null}
      <PlaybackControls
        canPlay={canPlay}
        canStepBackward={canStepBackward}
        canStepForward={canStepForward}
        canRun={!isLoading && !research.isResearchRunning}
        isRunning={research.isResearchRunning}
        onRun={research.runResearch}
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
  const { research } = useWorkbenchPanel();
  const selId = research.researchBattlePresetId;
  const isCustom = research.isCustomBattleSelected;
  const isSaved = isCustom && selId !== CUSTOM_BATTLE_ID;
  const presetLabel = RESEARCH_BATTLE_PRESETS.find((preset) => preset.id === selId)?.label ?? "—";

  const [nameDraft, setNameDraft] = useState(research.activeCustomBattleName);
  // Reset the name field whenever the selected battle changes.
  useEffect(() => {
    setNameDraft(research.activeCustomBattleName);
  }, [selId, research.activeCustomBattleName]);

  const running = research.isResearchRunning;
  const nameChanged = isSaved && nameDraft.trim() !== research.activeCustomBattleName;
  const canSave = isCustom && !running && (research.isCustomBattleDirty || nameChanged);

  return (
    <section className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 bg-[var(--surface-raised)] p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-dim)]">
        {isCustom ? (
          <>
            <span className="u-label text-[10px]">Name</span>
            <input
              className="min-w-0 flex-[1_1_140px] rounded-md border border-[var(--line-control)] bg-[var(--surface-well)] px-2 py-1 text-[11px] font-semibold text-[var(--text-soft)] disabled:opacity-55"
              value={nameDraft}
              placeholder={isSaved ? research.activeCustomBattleName : "Name this battle"}
              disabled={running}
              onChange={(event) => setNameDraft(event.currentTarget.value)}
            />
            {research.isCustomBattleDirty && (
              <span className="text-[10px] text-[var(--brand)]" title="Unsaved changes">
                ●
              </span>
            )}
            <button
              type="button"
              className="rounded-md border border-[var(--line-control)] bg-[var(--surface-well)] px-2 py-1 text-[10px] font-bold text-[var(--text-soft)] disabled:opacity-40"
              disabled={!canSave}
              onClick={() => research.saveCustomBattle(nameDraft)}
            >
              {isSaved ? "Save" : "Save as…"}
            </button>
            {isSaved && (
              <button
                type="button"
                className="rounded-md border border-[var(--status-contested-border)] bg-[var(--surface-well)] px-2 py-1 text-[10px] font-bold text-[var(--text-soft)] disabled:opacity-40"
                disabled={running}
                onClick={() => research.deleteCustomBattle(selId)}
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
          layout={research.editorLayout}
          dispatch={research.dispatchLayoutAction}
          disabled={running}
        />
      </div>
    </section>
  );
}

function ResearchDockPanel() {
  const { isLoading, research } = useWorkbenchPanel();
  return (
    <section className="h-full min-h-0 overflow-hidden bg-[var(--surface-raised)] p-2.5">
      <div className="grid h-full min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex min-w-0 flex-wrap items-end gap-x-1.5 gap-y-1.5" aria-label="Research presets">
            <div className={cn(FIELD_CLASS, "min-w-0 flex-[1_1_116px]")}>
              <Label htmlFor="research-battle-preset">Battlefield</Label>
              <select
                id="research-battle-preset"
                className={SELECT_CLASS}
                value={research.researchBattlePresetId}
                disabled={isLoading}
                onChange={(event) => research.selectResearchBattle(event.currentTarget.value)}
              >
                {RESEARCH_BATTLE_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
                {research.savedCustomBattles.length > 0 && (
                  <optgroup label="Saved">
                    {research.savedCustomBattles.map((battle) => (
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
              <Label htmlFor="research-rule-preset">Rule</Label>
              <select
                id="research-rule-preset"
                className={SELECT_CLASS}
                value={research.researchRulePresetId}
                disabled={isLoading}
                onChange={(event) => research.setResearchRulePresetId(event.currentTarget.value)}
              >
                {RESEARCH_RULE_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
            {(() => {
              const mode = (research.researchRulePreset?.rule as { mode?: string } | undefined)?.mode;
              const field =
                mode === "kill_limit_deathmatch" ? { key: "killLimit" as const, label: "Kill limit", max: 999 }
                : mode === "timed_deathmatch" ? { key: "timeLimitTicks" as const, label: "Time (ticks)", max: MAX_RESEARCH_TICKS }
                : mode === "capture_point" ? { key: "captureHoldTicks" as const, label: "Hold ticks", max: MAX_RESEARCH_TICKS }
                : null;
              if (!field) {
                return null;
              }
              return (
                <div className={cn(FIELD_CLASS, "flex-[0_0_92px]")}>
                  <Label htmlFor="research-rule-param">{field.label}</Label>
                  <Input
                    id="research-rule-param"
                    type="number"
                    min={1}
                    max={field.max}
                    value={research.researchRuleParams[field.key]}
                    disabled={isLoading}
                    onChange={(event) => {
                      const next = event.currentTarget.valueAsNumber;
                      if (!Number.isNaN(next)) {
                        research.setResearchRuleParam(field.key, next);
                      }
                    }}
                  />
                </div>
              );
            })()}
            <div className={cn(FIELD_CLASS, "flex-[0_0_92px]")}>
              <Label htmlFor="research-ticks">Ticks</Label>
              <Input
                id="research-ticks"
                type="number"
                min={1}
                max={MAX_RESEARCH_TICKS}
                value={research.researchTickCount}
                disabled={isLoading}
                onChange={(event) => {
                  const nextTickCount = event.currentTarget.valueAsNumber;
                  if (!Number.isNaN(nextTickCount)) {
                    research.setResearchTickCount(nextTickCount);
                  }
                }}
              />
            </div>
          </div>
          <div className="grid gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="u-label text-[10px]">Bot logic</span>
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
            <div className="grid gap-1">
              {Object.entries(research.botLogicByUnit)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([unitIdStr, botLogic]) => {
                  const unitId = Number(unitIdStr);
                  const unitName = unitId === 1 ? "Blue" : unitId === 2 ? "Red" : `Unit ${unitId}`;
                  const dirty = botLogic.editorSource !== botLogic.appliedSource;
                  return (
                    <div
                      key={unitId}
                      className="grid grid-cols-[minmax(0,60px)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-1.5"
                    >
                      <button
                        type="button"
                        className={cn(
                          "min-w-0 truncate rounded-md border border-[var(--line-control)] bg-[var(--surface-well)] px-1.5 py-1 text-left text-[10px] font-bold text-[var(--text-soft)]",
                          research.activeResearchBotUnitId === unitId && "border-[var(--brand)] text-[var(--brand)]",
                        )}
                        disabled={isLoading || research.isResearchRunning}
                        onClick={() => research.setActiveResearchBotUnitId(unitId)}
                        title={`Edit ${unitName} logic`}
                      >
                        {unitName}
                      </button>
                      <select
                        className={SELECT_CLASS}
                        value={research.unitPresetByUnit[unitId] ?? RESEARCH_UNIT_PRESETS[0]?.id}
                        disabled={isLoading || research.isResearchRunning}
                        onChange={(event) => research.setResearchUnitPresetId(unitId, event.currentTarget.value)}
                        title={`${unitName} unit`}
                      >
                        {RESEARCH_UNIT_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                      <select
                        className={SELECT_CLASS}
                        value={botLogic.presetId}
                        disabled={isLoading || research.isResearchRunning}
                        onChange={(event) => research.setResearchBotLogicPresetId(unitId, event.currentTarget.value)}
                        title={`${unitName} logic`}
                      >
                        {RESEARCH_BOT_LOGIC_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                        {research.savedBotLogics.length > 0 && (
                          <optgroup label="Saved">
                            {research.savedBotLogics.map((logic) => (
                              <option key={logic.id} value={logic.id}>
                                {logic.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      <span className="u-label w-12 text-right text-[9px]">
                        {dirty ? "edited" : "applied"}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-1.5">
          <BotLogicSaveBar />
          <Suspense
            fallback={
              <div className="u-label grid min-h-60 place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface-inset)] text-[10px]">
                Loading editor
              </div>
            }
          >
            <CodeEditor
              disabled={isLoading}
              onApply={research.applyBotSource}
              onValueChange={research.setResearchBotSource}
              value={research.researchBotSource}
            />
          </Suspense>
        </div>
      </div>
    </section>
  );
}

function BotLogicSaveBar() {
  const { research } = useWorkbenchPanel();
  const activeUnit = research.activeResearchBotUnitId;
  const unitName = activeUnit === 1 ? "Blue" : activeUnit === 2 ? "Red" : `Unit ${activeUnit}`;
  const isSaved = research.isActiveBotLogicSaved;
  const running = research.isResearchRunning;

  const [nameDraft, setNameDraft] = useState(research.activeBotLogicName);
  // Reset the name field when the active unit or its logic changes.
  useEffect(() => {
    setNameDraft(research.activeBotLogicName);
  }, [activeUnit, research.researchBotLogicPresetId, research.activeBotLogicName]);

  const nameChanged = isSaved && nameDraft.trim() !== research.activeBotLogicName;
  const canSave = !running && (!isSaved || research.isActiveBotLogicDirty || nameChanged);

  return (
    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-dim)]">
      <span className="u-label text-[10px]">{unitName} logic</span>
      <input
        className="min-w-0 flex-[1_1_140px] rounded-md border border-[var(--line-control)] bg-[var(--surface-well)] px-2 py-1 text-[11px] font-semibold text-[var(--text-soft)] disabled:opacity-55"
        value={nameDraft}
        placeholder={isSaved ? research.activeBotLogicName : "Name this logic"}
        disabled={running}
        onChange={(event) => setNameDraft(event.currentTarget.value)}
      />
      {research.isActiveBotLogicDirty && (
        <span className="text-[10px] text-[var(--brand)]" title="Unsaved changes">
          ●
        </span>
      )}
      <button
        type="button"
        className="rounded-md border border-[var(--line-control)] bg-[var(--surface-well)] px-2 py-1 text-[10px] font-bold text-[var(--text-soft)] disabled:opacity-40"
        disabled={!canSave}
        onClick={() => research.saveBotLogic(nameDraft)}
      >
        {isSaved ? "Save" : "Save as…"}
      </button>
      {isSaved && (
        <button
          type="button"
          className="rounded-md border border-[var(--status-contested-border)] bg-[var(--surface-well)] px-2 py-1 text-[10px] font-bold text-[var(--text-soft)] disabled:opacity-40"
          disabled={running}
          onClick={() => research.deleteBotLogic(research.researchBotLogicPresetId)}
        >
          Delete
        </button>
      )}
    </div>
  );
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
  const { frame, research } = useWorkbenchPanel();
  return (
    <section className={STATE_DOCK_PANEL_CLASS}>
      <BotConsole logs={research.botLogs} currentTick={frame?.tick ?? 0} />
    </section>
  );
}

// Lightweight overlay shown over the battle viewport while a research run is in
// flight. It covers only the scene (the Monaco editor and side panels stay
// interactive) and offers a cancel affordance that terminates the worker.
function ResearchRunOverlay({
  progress,
  onCancel,
}: {
  progress: ResearchProgress | null;
  onCancel: () => void;
}) {
  const stage = progress?.stage ?? "loading-python";
  const stageLabel = RESEARCH_STAGE_LABELS[stage];
  const showTicks = stage === "simulating" && typeof progress?.totalTicks === "number";
  return (
    <div
      className="absolute inset-0 z-[4] flex items-center justify-center bg-[var(--overlay)] backdrop-blur-md"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 border border-[var(--brand-border)] bg-[var(--overlay-strong)] px-7 py-5 text-center shadow-[0_14px_42px_var(--shadow)]">
        <span className="research-overlay-spinner" aria-hidden="true" />
        <span className="text-[13px] font-semibold text-[var(--text)]">{stageLabel}</span>
        {showTicks ? (
          <span className="u-label text-[var(--text-muted)]">
            tick {progress?.tick ?? 0} / {progress?.totalTicks}
          </span>
        ) : null}
        <Button type="button" variant="secondary" onClick={onCancel} className="mt-1">
          Cancel
        </Button>
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
