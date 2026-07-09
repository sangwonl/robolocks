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

import type { BattleFrame, StaticObstacleFrame } from "../types/protocol";
import type { BattleReplay } from "../replay/replay";
import { parseBattleReplay } from "../replay/replay.ts";
import { RESEARCH_BATTLE_PRESETS, RESEARCH_UNIT_PRESETS } from "../research/research.ts";
import type { ResearchProgress } from "../research/researchWorkerProtocol.ts";
import { deriveStatusText } from "./statusText.ts";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Label } from "../components/ui/label.tsx";
import { BattleSceneThreeView } from "./BattleSceneThreeView.tsx";
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
  playback: PlaybackState;
  replayIndex: number;
  research: ResearchState;
  statusIsError: boolean;
  statusText: string;
};

const WorkbenchPanelContext = createContext<WorkbenchPanelContextValue | null>(null);

const DOCKVIEW_COMPONENTS: Record<string, FunctionComponent<IDockviewPanelProps>> = {
  battle: BattleDockPanel,
  research: ResearchDockPanel,
  replay: ReplayDockPanel,
  rules: RulesDockPanel,
  units: UnitsDockPanel,
  console: ConsoleDockPanel,
};

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
          if (isPlaying) {
            playback.pause();
          } else {
            playback.play();
          }
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
  }, [loadedReplay, canPlay, isPlaying, replayIndex, frameCount, playback]);

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
      id: "research",
      component: "research",
      title: "Research",
      position: { referencePanel: "battle-scene", direction: "left" },
      initialWidth: 420,
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
      className="workbench"
      style={{
        ...TEAM_CSS_VARIABLES,
      } as CSSProperties}
    >
      <WorkbenchPanelContext.Provider value={panelContext}>
        <DockviewReact
          className="dockview-workbench dockview-theme-dark"
          components={DOCKVIEW_COMPONENTS}
          onReady={handleDockReady}
        />
      </WorkbenchPanelContext.Provider>
      <div className="workbench-statusbar" role="status" data-variant={statusIsError ? "error" : "info"}>
        <span>Robolocks</span>
        <strong>{statusText}</strong>
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
    isPlaying,
    loadedReplay,
    playback,
    replayIndex,
    research,
  } = useWorkbenchPanel();
  return (
    <section className="battle-scene">
      <BattleSceneThreeView frame={frame} obstacles={loadedReplay?.obstacles ?? NO_OBSTACLES} />
      {research.isResearchRunning ? (
        <ResearchRunOverlay progress={research.researchProgress} onCancel={research.cancelResearch} />
      ) : null}
      <PlaybackControls
        canPlay={canPlay}
        canStepBackward={canStepBackward}
        canStepForward={canStepForward}
        currentIndex={replayIndex}
        frameCount={frameCount}
        isPlaying={isPlaying}
        onNext={() => playback.stepTo(Math.min(frameCount - 1, replayIndex + 1))}
        onPlayPause={() => (isPlaying ? playback.pause() : playback.play())}
        onPrev={() => playback.stepTo(Math.max(0, replayIndex - 1))}
        onReset={() => playback.seek(0)}
        onSeek={(index) => playback.seek(index)}
        speed={playback.speed}
        onSpeedChange={playback.setSpeed}
      />
    </section>
  );
}

function ResearchDockPanel() {
  const { isLoading, research } = useWorkbenchPanel();
  return (
    <section className="dock-panel dock-panel-research">
      <div className="research-panel">
        <div className="research-toolbar">
          <div className="preset-controls" aria-label="Research presets">
            <div className="field-control">
              <Label htmlFor="research-battle-preset">Battle</Label>
              <select
                id="research-battle-preset"
                value={research.researchBattlePresetId}
                disabled={isLoading}
                onChange={(event) => research.setResearchBattlePresetId(event.currentTarget.value)}
              >
                {RESEARCH_BATTLE_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-control">
              <Label htmlFor="research-unit-preset">Unit</Label>
              <select
                id="research-unit-preset"
                value={research.researchUnitPresetId}
                disabled={isLoading}
                onChange={(event) => research.setResearchUnitPresetId(event.currentTarget.value)}
              >
                {RESEARCH_UNIT_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-control field-control-inline">
              <Label htmlFor="research-ticks">Ticks</Label>
              <Input
                id="research-ticks"
                type="number"
                min={1}
                max={900}
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
            <Button
              type="button"
              disabled={isLoading || research.isResearchRunning}
              onClick={() => research.runResearch()}
            >
              Run
            </Button>
            <div className="preset-description">
              <span>{research.researchBattlePreset?.description ?? ""}</span>
              <span>{research.researchUnitPreset?.description ?? ""}</span>
            </div>
          </div>
        </div>
        <Suspense fallback={<div className="code-editor-loading u-label">Loading editor</div>}>
          <CodeEditor
            disabled={isLoading}
            onRun={() => research.runResearch()}
            onValueChange={research.setResearchBotSource}
            value={research.researchBotSource}
          />
        </Suspense>
      </div>
    </section>
  );
}

function ReplayDockPanel() {
  const { frame, isLoading, loadReplayFile, loadedReplay, replayIndex } = useWorkbenchPanel();
  return (
    <section className="dock-panel">
      <div className="file-control">
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
    <section className="dock-panel dock-panel-state">
      <Inspector frame={frame} />
    </section>
  );
}

function RulesDockPanel() {
  const { frame } = useWorkbenchPanel();
  return (
    <section className="dock-panel dock-panel-state">
      <RuleSummary frame={frame} />
    </section>
  );
}

function ConsoleDockPanel() {
  const { frame, research } = useWorkbenchPanel();
  return (
    <section className="dock-panel dock-panel-state">
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
    <div className="research-overlay" role="status" aria-live="polite">
      <div className="research-overlay-card">
        <span className="research-overlay-spinner" aria-hidden="true" />
        <span className="research-overlay-stage">{stageLabel}</span>
        {showTicks ? (
          <span className="research-overlay-ticks u-label">
            tick {progress?.tick ?? 0} / {progress?.totalTicks}
          </span>
        ) : null}
        <Button type="button" variant="secondary" onClick={onCancel} className="research-overlay-cancel">
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
    return <div className="summary summary-empty">No replay loaded.</div>;
  }
  return (
    <dl className="summary">
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
