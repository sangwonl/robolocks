import { createRoot, type Root } from "react-dom/client";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";

import type { BattleAction, BattleEvent, BattleFrame, UnitFrame } from "../types/protocol";
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

function RuleSummary({ frame }: { frame: BattleFrame | null }) {
  if (!frame) {
    return <div className="rule-summary rule-summary-empty">No rule state.</div>;
  }
  const { outcome, scores } = frame.ruleState;
  return (
    <div className="rule-summary">
      <div className="rule-outcome" data-finished={outcome.finished}>
        <span>{outcome.finished ? "Finished" : "Running"}</span>
        <strong>{outcome.reason || "active"}</strong>
        {(outcome.winnerTeamId > 0 || outcome.winnerUnitId > 0) && (
          <em>
            {outcome.winnerTeamId > 0 ? `team ${outcome.winnerTeamId}` : ""}
            {outcome.winnerUnitId > 0 ? ` unit ${outcome.winnerUnitId}` : ""}
          </em>
        )}
      </div>
      {scores.length === 0 ? (
        <div className="rule-summary-empty">No scores.</div>
      ) : (
        <div className="score-table" role="table" aria-label="Battle scores">
          <div className="score-row score-row-head" role="row">
            <span>Unit</span>
            <span>Team</span>
            <span>K</span>
            <span>D</span>
            <span>Dmg</span>
          </div>
          {scores.map((score) => (
            <div key={`${score.unitId}-${score.teamId}`} className="score-row" role="row">
              <span>{score.unitId}</span>
              <span>{score.teamId}</span>
              <span>{score.kills}</span>
              <span>{score.deaths}</span>
              <span>{score.damageDealt.toFixed(0)}</span>
            </div>
          ))}
        </div>
      )}
      {frame.ruleState.captureZones.length > 0 && (
        <div className="capture-zone-list">
          {frame.ruleState.captureZones.map((zone) => (
            <div key={zone.id} className="capture-zone-row" data-contested={zone.contested}>
              <span>{zone.id}</span>
              <strong>
                {zone.heldTicks}/{zone.holdTicksRequired}
              </strong>
              <em>
                {zone.contested
                  ? "contested"
                  : zone.ownerTeamId > 0
                    ? `team ${zone.ownerTeamId}`
                    : "neutral"}
              </em>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

async function fetchTextFromUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`.trim());
  }
  return response.text();
}

function Inspector({ frame }: { frame: BattleFrame | null }) {
  if (!frame) {
    return <div className="inspector inspector-empty">Load a replay to inspect unit state.</div>;
  }
  return (
    <div className="inspector">
      <div className="unit-stack">
        {frame.units.map((unit) => (
          <UnitCard
            key={unit.unitId}
            unit={unit}
            actions={frame.actions.filter((action) => action.unitId === unit.unitId)}
            events={frame.events.filter((event) => event.unitId === unit.unitId)}
          />
        ))}
      </div>
    </div>
  );
}

function BotConsole({ currentTick, logs }: { currentTick: number; logs: BotLogEntry[] }) {
  const visibleLogs = logs.filter((entry) => entry.tick <= currentTick).slice(-80);
  return (
    <div className="console-panel">
      {visibleLogs.length === 0 ? (
        <div className="console-empty">No bot logs.</div>
      ) : (
        <ol className="console-log">
          {visibleLogs.map((entry, index) => (
            <li key={`${entry.tick}-${entry.unitId}-${index}`} data-stream={entry.stream}>
              <span className="console-meta">t{entry.tick} u{entry.unitId}</span>
              <span className="console-message">{entry.message}</span>
            </li>
          ))}
        </ol>
      )}
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

function PlaybackControls({
  canPlay,
  canStepBackward,
  canStepForward,
  currentIndex,
  frameCount,
  isPlaying,
  onNext,
  onPlayPause,
  onPrev,
  onReset,
  onSeek,
}: {
  canPlay: boolean;
  canStepBackward: boolean;
  canStepForward: boolean;
  currentIndex: number;
  frameCount: number;
  isPlaying: boolean;
  onNext: () => void;
  onPlayPause: () => void;
  onPrev: () => void;
  onReset: () => void;
  onSeek: (index: number) => void;
}) {
  const maxIndex = Math.max(0, frameCount - 1);
  return (
    <div className="playback" aria-label="Replay playback controls">
      <div className="playback-buttons">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          disabled={frameCount === 0 || currentIndex === 0}
          aria-label="Reset replay"
          title="Reset"
          onClick={onReset}
        >
          <RotateCcw aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          disabled={!canStepBackward}
          aria-label="Previous frame"
          title="Previous frame"
          onClick={onPrev}
        >
          <SkipBack aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="default"
          size="icon"
          disabled={!canPlay}
          aria-label={isPlaying ? "Pause replay" : "Play replay"}
          title={isPlaying ? "Pause" : "Play"}
          onClick={onPlayPause}
        >
          {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          disabled={!canStepForward}
          aria-label="Next frame"
          title="Next frame"
          onClick={onNext}
        >
          <SkipForward aria-hidden="true" />
        </Button>
      </div>
      <label className="playback-progress">
        <span>{frameCount > 0 ? `${currentIndex + 1}/${frameCount}` : "0/0"}</span>
        <input
          type="range"
          min={0}
          max={maxIndex}
          value={Math.min(currentIndex, maxIndex)}
          disabled={frameCount <= 1}
          onChange={(event) => onSeek(Number(event.currentTarget.value))}
        />
      </label>
    </div>
  );
}

function UnitCard({ unit, actions, events }: { unit: UnitFrame; actions: BattleAction[]; events: BattleEvent[] }) {
  return (
    <Accordion type="single" collapsible className="unit-card" data-team={unit.teamId}>
      <AccordionItem value="unit" className="unit-card-item">
        <AccordionTrigger className="unit-card-head">
          <span className="unit-card-title">
            <strong>{unit.name}</strong>
            <span>unit {unit.unitId}</span>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="unit-card-body">
            <dl className="unit-stats">
              <Stat label="Position" value={`${unit.position.x.toFixed(2)}, ${unit.position.y.toFixed(2)}`} />
              <Stat label="Hull" value={`${unit.hullHeadingDegrees.toFixed(1)} deg`} />
              <Stat label="Turret" value={`${unit.turretHeadingDegrees.toFixed(1)} deg`} />
              <Stat label="Shape" value={shapeLabel(unit.bodyShape)} />
              <Stat label="Armor" value={unit.armorIntegrity.toFixed(0)} />
              <Stat label="Reload" value={`${unit.weaponCooldownTicks} ticks`} />
            </dl>
            <UnitSection title="Modules" items={moduleItems(unit)} />
            <UnitSection title="Intents" items={intentItems(unit)} />
            <UnitSection title="Actions" items={actionItems(actions)} />
            <UnitSection title="Events" items={eventItems(events)} />
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function UnitSection({ title, items }: { title: string; items: { label: string; value: string }[] }) {
  return (
    <>
      <div className="unit-subtitle">{title}</div>
      <ul className="action-list">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            <span>{item.label}</span> {item.value}
          </li>
        ))}
      </ul>
    </>
  );
}

function moduleItems(unit: UnitFrame): { label: string; value: string }[] {
  const muzzle = unit.modules.weapon.muzzleOffsetMeters;
  const muzzleLabel = `${muzzle.x.toFixed(1)},${muzzle.y.toFixed(1)},${muzzle.z.toFixed(1)}m`;
  return [
    { label: "move", value: `${unit.modules.mobility.id} ${unit.modules.mobility.maxSpeedMetersPerSecond.toFixed(1)}m/s ${unit.modules.mobility.maxHullTurnDegreesPerSecond.toFixed(0)}deg/s` },
    { label: "turret", value: `${unit.modules.turret.id} ${unit.modules.turret.maxTurnDegreesPerSecond.toFixed(0)}deg/s` },
    { label: "weapon", value: `${unit.modules.weapon.id} ${unit.modules.weapon.fireMode} dmg=${unit.modules.weapon.damage.toFixed(0)} pen=${unit.modules.weapon.penetrationMillimeters.toFixed(0)}mm v=${unit.modules.weapon.muzzleVelocityMetersPerSecond.toFixed(0)}m/s muzzle=${muzzleLabel} angle=${unit.modules.weapon.launchAngleDegrees.toFixed(0)}deg blast=${unit.modules.weapon.blastRadiusMeters.toFixed(1)}m reload=${unit.modules.weapon.reloadTicks}` },
    { label: "armor", value: `${unit.modules.armor.id} hp=${unit.modules.armor.integrity.toFixed(0)} ${unit.modules.armor.frontMillimeters.toFixed(0)}/${unit.modules.armor.sideMillimeters.toFixed(0)}/${unit.modules.armor.rearMillimeters.toFixed(0)}mm` },
    { label: "body", value: `${unit.modules.body.id} mass=${unit.modules.body.massKilograms.toFixed(0)}kg` },
    { label: "sensor", value: `${unit.modules.sensor.id} ${unit.modules.sensor.rangeMeters.toFixed(0)}m/${unit.modules.sensor.fovDegrees.toFixed(0)}deg` },
  ];
}

function intentItems(unit: UnitFrame): { label: string; value: string }[] {
  return [
    { label: "move", value: unit.intents.mobility.active ? `move (${unit.intents.mobility.target.x.toFixed(1)}, ${unit.intents.mobility.target.y.toFixed(1)}) rem=${unit.intents.mobility.remainingMeters.toFixed(1)}m age=${unit.intents.mobility.ageTicks}` : "idle" },
    { label: "turret", value: unit.intents.turret.active ? `aim (${unit.intents.turret.target.x.toFixed(1)}, ${unit.intents.turret.target.y.toFixed(1)}) err=${unit.intents.turret.errorDegrees.toFixed(1)}deg age=${unit.intents.turret.ageTicks}` : "idle" },
    { label: "hull", value: unit.intents.hull.active ? `face (${unit.intents.hull.target.x.toFixed(1)}, ${unit.intents.hull.target.y.toFixed(1)}) err=${unit.intents.hull.errorDegrees.toFixed(1)}deg age=${unit.intents.hull.ageTicks}` : "idle" },
    { label: "weapon", value: unit.intents.weapon.active ? `fire p>=${unit.intents.weapon.minHitChance.toFixed(2)} age=${unit.intents.weapon.ageTicks}` : "idle" },
  ];
}

function actionItems(actions: BattleAction[]): { label: string; value: string }[] {
  if (actions.length === 0) {
    return [{ label: "-", value: "no actions" }];
  }
  return actions.map((action) => ({
    label: action.channel,
    value: `${action.type}${actionTarget(action)}`,
  }));
}

function eventItems(events: BattleEvent[]): { label: string; value: string }[] {
  if (events.length === 0) {
    return [{ label: "-", value: "no events" }];
  }
  return events.map((event) => ({
    label: String(event.tick),
    value: `${event.code}${eventPayloadSummary(event)}`,
  }));
}

function shapeLabel(shape: UnitFrame["bodyShape"]): string {
  if (shape.type === "box") {
    return `box ${shape.lengthMeters.toFixed(1)}x${shape.widthMeters.toFixed(1)}m`;
  }
  return `circle r=${shape.radiusMeters.toFixed(1)}m`;
}

function eventPayloadSummary(event: BattleEvent): string {
  const payload = event.payload;
  if (!payload || payload.damage <= 0) {
    return payload?.armorFacing ? ` ${payload.armorFacing}` : "";
  }
  const parts = [`-${payload.damage.toFixed(1)}`, `hp=${payload.remainingArmor.toFixed(1)}`];
  if (payload.damageType) {
    parts.push(payload.damageType);
  }
  if (payload.armorFacing) {
    parts.push(payload.armorFacing);
  }
  if (payload.blastRadiusMeters > 0) {
    parts.push(`d=${payload.impactDistanceMeters.toFixed(1)}/${payload.blastRadiusMeters.toFixed(1)}m`);
  }
  return ` ${parts.join(" ")}`;
}

function actionTarget(action: BattleAction): string {
  if (action.position) {
    return ` (${action.position.x.toFixed(1)}, ${action.position.y.toFixed(1)})`;
  }
  if (action.target) {
    return ` (${action.target.x.toFixed(1)}, ${action.target.y.toFixed(1)})`;
  }
  if (typeof action.minHitChance === "number") {
    return ` p>=${action.minHitChance.toFixed(2)}`;
  }
  if (typeof action.directionDegrees === "number" && typeof action.widthDegrees === "number") {
    return ` ${action.directionDegrees.toFixed(0)}deg/${action.widthDegrees.toFixed(0)}deg`;
  }
  return "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
