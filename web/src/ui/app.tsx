import { createRoot, type Root } from "react-dom/client";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import type { BattleFrame } from "../types/protocol";
import type { BattleReplay } from "../replay/replay";
import { parseBattleReplay } from "../replay/replay.ts";
import {
  DEFAULT_RESEARCH_BOT_SOURCE,
  RESEARCH_BATTLE_PRESETS,
  RESEARCH_UNIT_PRESETS,
  createResearchBattleConfigJson,
  runResearchInBrowser,
  type BotLogEntry,
} from "../research/research.ts";
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

const CodeEditor = lazy(() => import("./CodeEditor.tsx").then((module) => ({ default: module.CodeEditor })));
const MIN_PANEL_WIDTH = 240;
const MAX_PANEL_WIDTH = 640;

export type RenderAppOptions = {
  defaultReplayUrl?: string | null;
  autoplayDefaultReplay?: boolean;
  fetchText?: (url: string) => Promise<string>;
};

const reactRoots = new WeakMap<HTMLElement, Root>();

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
  const [replayIndex, setReplayIndex] = useState(0);
  const [status, setStatus] = useState("Ready");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [workbenchMode, setWorkbenchMode] = useState<"replay" | "research">("research");
  const [researchBattlePresetId, setResearchBattlePresetId] = useState(RESEARCH_BATTLE_PRESETS[0]?.id ?? "");
  const [researchUnitPresetId, setResearchUnitPresetId] = useState(RESEARCH_UNIT_PRESETS[0]?.id ?? "");
  const [researchBotSource, setResearchBotSource] = useState(DEFAULT_RESEARCH_BOT_SOURCE);
  const [researchTickCount, setResearchTickCount] = useState(180);
  const [botLogs, setBotLogs] = useState<BotLogEntry[]>([]);
  const [leftPanelWidth, setLeftPanelWidth] = useState(MAX_PANEL_WIDTH);
  const [rightPanelWidth, setRightPanelWidth] = useState(320);
  const timerRef = useRef<number | null>(null);

  const fetchText = options.fetchText ?? fetchTextFromUrl;
  const defaultReplayUrl = options.defaultReplayUrl === undefined ? null : options.defaultReplayUrl;
  const autoplayDefaultReplay = options.autoplayDefaultReplay ?? false;

  const frame = loadedReplay?.frames[replayIndex] ?? null;
  const canStepBackward = Boolean(loadedReplay && replayIndex > 0);
  const canStepForward = Boolean(loadedReplay && replayIndex < loadedReplay.frames.length - 1);
  const canPlay = Boolean(loadedReplay && loadedReplay.frames.length > 1);
  const frameCount = loadedReplay?.frames.length ?? 0;
  const researchBattlePreset = RESEARCH_BATTLE_PRESETS.find((preset) => preset.id === researchBattlePresetId) ?? RESEARCH_BATTLE_PRESETS[0];
  const researchUnitPreset = RESEARCH_UNIT_PRESETS.find((preset) => preset.id === researchUnitPresetId) ?? RESEARCH_UNIT_PRESETS[0];
  const researchBattleConfigJson = useMemo(
    () => createResearchBattleConfigJson({
      battlePresetId: researchBattlePresetId,
      unitPresetId: researchUnitPresetId,
    }),
    [researchBattlePresetId, researchUnitPresetId],
  );

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

  useEffect(() => {
    if (!isPlaying || !loadedReplay) {
      return;
    }
    const delayMs = Math.max(1, 1000 / loadedReplay.tickRate);
    timerRef.current = window.setInterval(() => {
      setReplayIndex((current) => {
        if (current >= loadedReplay.frames.length - 1) {
          setIsPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, delayMs);
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isPlaying, loadedReplay]);

  async function loadReplayUrl(url: string, autoplay: boolean): Promise<void> {
    setIsPlaying(false);
    setIsLoading(true);
    setStatus("Loading replay");
    try {
      applyReplayText(await fetchText(url), autoplay);
    } catch (error: unknown) {
      setLoadedReplay(null);
      setReplayIndex(0);
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
    setReplayIndex(0);
    setStatus("Replay loaded");
    setIsPlaying(autoplay && replay.frames.length > 1);
  }

  async function loadReplayFile(file: File): Promise<void> {
    setIsPlaying(false);
    setIsLoading(true);
    setStatus("Loading replay");
    try {
      setBotLogs([]);
      applyReplayText(await file.text(), false);
    } catch (error: unknown) {
      setLoadedReplay(null);
      setReplayIndex(0);
      setStatus(`Replay load failed: ${errorMessage(error)}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function runResearch(): Promise<void> {
    setIsPlaying(false);
    setIsLoading(true);
    setStatus("Running research");
    try {
      const result = await runResearchInBrowser({
        battleConfigJson: researchBattleConfigJson,
        botSource: researchBotSource,
        tickCount: researchTickCount,
      });
      setBotLogs(result.logs);
      applyReplay(result.replay, true);
      setStatus(`Research run loaded - ${result.replay.frames.length} frames`);
    } catch (error: unknown) {
      setStatus(`Research run failed: ${errorMessage(error)}`);
    } finally {
      setIsLoading(false);
    }
  }

  function beginPanelResize(panel: "left" | "right", pointerStartX: number): void {
    const startWidth = panel === "left" ? leftPanelWidth : rightPanelWidth;
    const applyWidth = panel === "left" ? setLeftPanelWidth : setRightPanelWidth;

    function handlePointerMove(event: PointerEvent): void {
      const delta = event.clientX - pointerStartX;
      const nextWidth = panel === "left" ? startWidth + delta : startWidth - delta;
      applyWidth(clamp(nextWidth, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH));
    }

    function handlePointerUp(): void {
      document.body.classList.remove("is-resizing-panel");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    document.body.classList.add("is-resizing-panel");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
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
                      value={researchBattlePresetId}
                      disabled={isLoading}
                      onChange={(event) => setResearchBattlePresetId(event.currentTarget.value)}
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
                      value={researchUnitPresetId}
                      disabled={isLoading}
                      onChange={(event) => setResearchUnitPresetId(event.currentTarget.value)}
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
                      value={researchTickCount}
                      disabled={isLoading}
                      onChange={(event) => setResearchTickCount(Number(event.currentTarget.value))}
                    />
                  </div>
                  <Button type="button" disabled={isLoading} onClick={() => void runResearch()}>
                    Run
                  </Button>
                  <div className="preset-description">
                    <span>{researchBattlePreset?.description ?? ""}</span>
                    <span>{researchUnitPreset?.description ?? ""}</span>
                  </div>
                </div>
              </div>
              <Suspense fallback={<div className="code-editor-loading">Loading editor</div>}>
                <CodeEditor
                  disabled={isLoading}
                  onRun={() => void runResearch()}
                  onValueChange={setResearchBotSource}
                  value={researchBotSource}
                />
              </Suspense>
            </div>
          </TabsContent>
        </Tabs>
        <div className="status">{statusText}</div>
      </aside>
      <PanelResizeHandle side="left" onResizeStart={(pointerX) => beginPanelResize("left", pointerX)} />
      <section className="battle-scene">
        <BattleSceneThreeView frame={frame} obstacles={loadedReplay?.obstacles ?? []} />
        <PlaybackControls
          canPlay={canPlay}
          canStepBackward={canStepBackward}
          canStepForward={canStepForward}
          currentIndex={replayIndex}
          frameCount={frameCount}
          isPlaying={isPlaying}
          onNext={() => setReplayIndex((value) => Math.min(frameCount - 1, value + 1))}
          onPlayPause={() => setIsPlaying((value) => !value)}
          onPrev={() => setReplayIndex((value) => Math.max(0, value - 1))}
          onReset={() => {
            setIsPlaying(false);
            setReplayIndex(0);
          }}
          onSeek={(index) => {
            setIsPlaying(false);
            setReplayIndex(index);
          }}
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
              <BotConsole logs={botLogs} currentTick={frame?.tick ?? 0} />
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
