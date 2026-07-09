import { createRoot, type Root } from "react-dom/client";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

import type { BattleFrame, StaticObstacleFrame } from "../types/protocol";
import type { BattleReplay } from "../replay/replay";
import { parseBattleReplay } from "../replay/replay.ts";
import { RESEARCH_BATTLE_PRESETS, RESEARCH_UNIT_PRESETS } from "../research/research.ts";
import type { ResearchProgress } from "../research/researchWorkerProtocol.ts";
import { deriveStatusText } from "./statusText.ts";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../components/ui/accordion.tsx";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Label } from "../components/ui/label.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs.tsx";
import { BattleSceneThreeView } from "./BattleSceneThreeView.tsx";
import { BotConsole } from "./BotConsole.tsx";
import { Inspector, Stat } from "./Inspector.tsx";
import { PlaybackControls } from "./PlaybackControls.tsx";
import { RuleSummary } from "./RuleSummary.tsx";
import { teamCssVariables } from "./teamPalette.ts";
import { PANEL_WIDTH_KEYBOARD_STEP, PANEL_WIDTH_MAX, PANEL_WIDTH_MIN, usePanelResize } from "./hooks/usePanelResize.ts";
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
  const [workbenchMode, setWorkbenchMode] = useState<"replay" | "research">("research");
  const playback = useReplayPlayback(loadedReplay);
  const research = useResearchRun({
    applyReplay,
    setStatus,
    pause: playback.pause,
  });
  const { leftPanelWidth, rightPanelWidth, beginPanelResize, stepPanelWidth } = usePanelResize();

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

  return (
    <section
      className="workbench"
      style={{
        ...TEAM_CSS_VARIABLES,
        "--left-panel-width": `${leftPanelWidth}px`,
        "--right-panel-width": `${rightPanelWidth}px`,
      } as CSSProperties}
    >
      <aside className="panel panel-left">
        <div className="panel-title">
          <h1>Robolocks</h1>
          <span className="u-label">{workbenchMode === "research" ? "Unit Research" : "Replay Workbench"}</span>
        </div>
        <Tabs
          value={workbenchMode}
          onValueChange={(value) => setWorkbenchMode(value as "replay" | "research")}
          className="workbench-tabs"
        >
          <TabsList className="mode-switch" aria-label="Workbench mode">
            <TabsTrigger value="research">Research</TabsTrigger>
            <TabsTrigger value="replay">Replay</TabsTrigger>
          </TabsList>
          <TabsContent value="replay" className="tab-content">
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
          </TabsContent>
          <TabsContent value="research" className="tab-content research-tab">
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
          </TabsContent>
        </Tabs>
        <div className="status" role="status" data-variant={statusIsError ? "error" : "info"}>
          {statusText}
        </div>
      </aside>
      <PanelResizeHandle
        side="left"
        width={leftPanelWidth}
        onResizeStart={(pointerX) => beginPanelResize("left", pointerX)}
        onStep={(deltaPx) => stepPanelWidth("left", deltaPx)}
      />
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
      <PanelResizeHandle
        side="right"
        width={rightPanelWidth}
        onResizeStart={(pointerX) => beginPanelResize("right", pointerX)}
        onStep={(deltaPx) => stepPanelWidth("right", deltaPx)}
      />
      <aside className="panel panel-right">
        <div className="panel-title">
          <h1>Bot State</h1>
          <span className="u-label">{frame ? `tick ${frame.tick}` : "No Frame"}</span>
        </div>
        <Accordion type="multiple" defaultValue={["rules", "units"]} className="state-panel-sections">
          <AccordionItem value="rules" className="state-section state-section-rules">
            <AccordionTrigger className="state-section-trigger">Rules</AccordionTrigger>
            <AccordionContent className="state-section-content">
              <RuleSummary frame={frame} />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="units" className="state-section state-section-units">
            <AccordionTrigger className="state-section-trigger">Units</AccordionTrigger>
            <AccordionContent className="state-section-content">
              <Inspector frame={frame} />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="console" className="state-section state-section-console">
            <AccordionTrigger className="state-section-trigger">Console</AccordionTrigger>
            <AccordionContent className="state-section-content">
              <BotConsole logs={research.botLogs} currentTick={frame?.tick ?? 0} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </aside>
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

function PanelResizeHandle({
  onResizeStart,
  onStep,
  side,
  width,
}: {
  onResizeStart: (pointerX: number) => void;
  onStep: (deltaPx: number) => void;
  side: "left" | "right";
  width: number;
}) {
  return (
    <div
      className={`panel-resize-handle panel-resize-handle-${side}`}
      role="separator"
      aria-label={`${side} panel resize handle`}
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={PANEL_WIDTH_MIN}
      aria-valuemax={PANEL_WIDTH_MAX}
      tabIndex={0}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onResizeStart(event.clientX);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          event.stopPropagation();
          onStep(PANEL_WIDTH_KEYBOARD_STEP);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          event.stopPropagation();
          onStep(-PANEL_WIDTH_KEYBOARD_STEP);
        }
      }}
    />
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
