import { createRoot, type Root } from "react-dom/client";
import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties } from "react";

import type { BattleFrame, StaticObstacleFrame } from "../types/protocol";
import type { BattleReplay } from "../replay/replay";
import { parseBattleReplay } from "../replay/replay.ts";
import { RESEARCH_BATTLE_PRESETS, RESEARCH_UNIT_PRESETS } from "../research/research.ts";
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
import { usePanelResize } from "./hooks/usePanelResize.ts";
import { useReplayPlayback } from "./hooks/useReplayPlayback.ts";
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
  const [status, setStatus] = useState("Ready");
  const [isLoading, setIsLoading] = useState(false);
  const [workbenchMode, setWorkbenchMode] = useState<"replay" | "research">("research");
  const playback = useReplayPlayback(loadedReplay);
  const research = useResearchRun({
    applyReplay,
    setStatus,
    setIsLoading,
    pause: playback.pause,
  });
  const { leftPanelWidth, rightPanelWidth, beginPanelResize } = usePanelResize();

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
    if (!loadedReplay || !frame) {
      return status;
    }
    return `Replay ${replayIndex + 1}/${loadedReplay.frames.length} - tick ${frame.tick}`;
  }, [frame, loadedReplay, replayIndex, status]);

  useEffect(() => {
    if (!defaultReplayUrl) {
      return;
    }
    void loadReplayUrl(defaultReplayUrl, autoplayDefaultReplay);
  }, [defaultReplayUrl, autoplayDefaultReplay]);

  async function loadReplayUrl(url: string, autoplay: boolean): Promise<void> {
    playback.pause();
    setIsLoading(true);
    setStatus("Loading replay");
    try {
      applyReplayText(await fetchText(url), autoplay);
    } catch (error: unknown) {
      setLoadedReplay(null);
      setStatus(`Replay load failed: ${errorMessage(error)}`);
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
      setStatus(`Replay load failed: ${errorMessage(error)}`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section
      className="workbench"
      style={{
        "--left-panel-width": `${leftPanelWidth}px`,
        "--right-panel-width": `${rightPanelWidth}px`,
      } as CSSProperties}
    >
      <aside className="panel panel-left">
        <div className="panel-title">
          <h1>Robolocks</h1>
          <span>{workbenchMode === "research" ? "Unit Research" : "Replay Workbench"}</span>
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
                        const nextTickCount = Number(event.currentTarget.value);
                        if (!Number.isNaN(nextTickCount)) {
                          research.setResearchTickCount(nextTickCount);
                        }
                      }}
                    />
                  </div>
                  <Button type="button" disabled={isLoading} onClick={() => void research.runResearch()}>
                    Run
                  </Button>
                  <div className="preset-description">
                    <span>{research.researchBattlePreset?.description ?? ""}</span>
                    <span>{research.researchUnitPreset?.description ?? ""}</span>
                  </div>
                </div>
              </div>
              <Suspense fallback={<div className="code-editor-loading">Loading editor</div>}>
                <CodeEditor
                  disabled={isLoading}
                  onRun={() => void research.runResearch()}
                  onValueChange={research.setResearchBotSource}
                  value={research.researchBotSource}
                />
              </Suspense>
            </div>
          </TabsContent>
        </Tabs>
        <div className="status">{statusText}</div>
      </aside>
      <PanelResizeHandle side="left" onResizeStart={(pointerX) => beginPanelResize("left", pointerX)} />
      <section className="battle-scene">
        <BattleSceneThreeView frame={frame} obstacles={loadedReplay?.obstacles ?? NO_OBSTACLES} />
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
      <PanelResizeHandle side="right" onResizeStart={(pointerX) => beginPanelResize("right", pointerX)} />
      <aside className="panel panel-right">
        <div className="panel-title">
          <h1>Bot State</h1>
          <span>{frame ? `tick ${frame.tick}` : "No Frame"}</span>
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
  side,
}: {
  onResizeStart: (pointerX: number) => void;
  side: "left" | "right";
}) {
  return (
    <div
      className={`panel-resize-handle panel-resize-handle-${side}`}
      role="separator"
      aria-label={`${side} panel resize handle`}
      aria-orientation="vertical"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onResizeStart(event.clientX);
      }}
    />
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
