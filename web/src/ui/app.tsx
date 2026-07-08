import { createRoot, type Root } from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";

import type { BattleAction, BattleEvent, BattleFrame, UnitFrame } from "../types/protocol";
import type { BattleReplay } from "../replay/replay";
import { parseBattleReplay } from "../replay/replay.ts";
import { BattleSceneThreeView } from "./BattleSceneThreeView.tsx";

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
  const timerRef = useRef<number | null>(null);

  const fetchText = options.fetchText ?? fetchTextFromUrl;
  const defaultReplayUrl = options.defaultReplayUrl === undefined ? null : options.defaultReplayUrl;
  const autoplayDefaultReplay = options.autoplayDefaultReplay ?? false;

  const frame = loadedReplay?.frames[replayIndex] ?? null;
  const canStepBackward = Boolean(loadedReplay && replayIndex > 0);
  const canStepForward = Boolean(loadedReplay && replayIndex < loadedReplay.frames.length - 1);
  const canPlay = Boolean(loadedReplay && loadedReplay.frames.length > 1);

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
    const parsed = parseBattleReplay(text);
    setLoadedReplay(parsed);
    setReplayIndex(0);
    setStatus("Replay loaded");
    setIsPlaying(autoplay && parsed.frames.length > 1);
  }

  async function loadReplayFile(file: File): Promise<void> {
    setIsPlaying(false);
    setIsLoading(true);
    setStatus("Loading replay");
    try {
      applyReplayText(await file.text(), false);
    } catch (error: unknown) {
      setLoadedReplay(null);
      setReplayIndex(0);
      setStatus(`Replay load failed: ${errorMessage(error)}`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="workbench">
      <aside className="panel">
        <div className="panel-title">
          <h1>Robolocks</h1>
          <span>Replay Workbench</span>
        </div>
        <label className="file-control">
          Replay JSON
          <input
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
        </label>
        <div className="transport">
          <button disabled={!canStepBackward} onClick={() => setReplayIndex((value) => Math.max(0, value - 1))}>Prev</button>
          <button disabled={!canPlay} onClick={() => setIsPlaying((value) => !value)}>{isPlaying ? "Pause" : "Play"}</button>
          <button disabled={!canStepForward} onClick={() => setReplayIndex((value) => Math.min((loadedReplay?.frames.length ?? 1) - 1, value + 1))}>Next</button>
        </div>
        <div className="status">{statusText}</div>
        <Inspector frame={frame} />
      </aside>
      <section className="battle-scene">
        <BattleSceneThreeView frame={frame} obstacles={loadedReplay?.obstacles ?? []} />
      </section>
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

function Inspector({ frame }: { frame: BattleFrame | null }) {
  if (!frame) {
    return <div className="inspector inspector-empty">Load a replay to inspect unit state.</div>;
  }
  return (
    <div className="inspector">
      <div className="debug-block">
        <div className="debug-title">Units</div>
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
    </div>
  );
}

function UnitCard({ unit, actions, events }: { unit: UnitFrame; actions: BattleAction[]; events: BattleEvent[] }) {
  return (
    <section className="unit-card" data-side={unit.name.toLowerCase()}>
      <div className="unit-card-head">
        <strong>{unit.name}</strong>
        <span>unit {unit.unitId}</span>
      </div>
      <dl className="unit-stats">
        <Stat label="Position" value={`${unit.position.x.toFixed(2)}, ${unit.position.y.toFixed(2)}`} />
        <Stat label="Hull" value={`${unit.hullHeadingDeg.toFixed(1)} deg`} />
        <Stat label="Turret" value={`${unit.turretHeadingDeg.toFixed(1)} deg`} />
        <Stat label="Shape" value={shapeLabel(unit.bodyShape)} />
        <Stat label="Armor" value={unit.armorIntegrity.toFixed(0)} />
        <Stat label="Reload" value={`${unit.weaponCooldownTicks} ticks`} />
      </dl>
      <UnitSection title="Modules" items={moduleItems(unit)} />
      <UnitSection title="Intents" items={intentItems(unit)} />
      <UnitSection title="Actions" items={actionItems(actions)} />
      <UnitSection title="Events" items={eventItems(events)} />
    </section>
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
  return [
    { label: "move", value: `${unit.modules.mobility.id} ${unit.modules.mobility.maxSpeedMps.toFixed(1)}m/s ${unit.modules.mobility.maxHullTurnDegps.toFixed(0)}deg/s` },
    { label: "turret", value: `${unit.modules.turret.id} ${unit.modules.turret.maxTurnDegps.toFixed(0)}deg/s` },
    { label: "weapon", value: `${unit.modules.weapon.id} ${unit.modules.weapon.fireMode} dmg=${unit.modules.weapon.damage.toFixed(0)} pen=${unit.modules.weapon.penetrationMm.toFixed(0)}mm v=${unit.modules.weapon.muzzleVelocityMps.toFixed(0)}m/s angle=${unit.modules.weapon.launchAngleDeg.toFixed(0)}deg blast=${unit.modules.weapon.blastRadiusM.toFixed(1)}m reload=${unit.modules.weapon.reloadTicks}` },
    { label: "armor", value: `${unit.modules.armor.id} hp=${unit.modules.armor.integrity.toFixed(0)} ${unit.modules.armor.frontMm.toFixed(0)}/${unit.modules.armor.sideMm.toFixed(0)}/${unit.modules.armor.rearMm.toFixed(0)}mm` },
    { label: "body", value: `${unit.modules.body.id} mass=${unit.modules.body.massKg.toFixed(0)}kg` },
    { label: "sensor", value: `${unit.modules.sensor.id} ${unit.modules.sensor.rangeM.toFixed(0)}m/${unit.modules.sensor.fovDeg.toFixed(0)}deg` },
  ];
}

function intentItems(unit: UnitFrame): { label: string; value: string }[] {
  return [
    { label: "move", value: unit.intents.mobility.active ? `move (${unit.intents.mobility.target.x.toFixed(1)}, ${unit.intents.mobility.target.y.toFixed(1)}) rem=${unit.intents.mobility.remainingM.toFixed(1)}m age=${unit.intents.mobility.ageTicks}` : "idle" },
    { label: "turret", value: unit.intents.turret.active ? `aim (${unit.intents.turret.target.x.toFixed(1)}, ${unit.intents.turret.target.y.toFixed(1)}) err=${unit.intents.turret.errorDeg.toFixed(1)}deg age=${unit.intents.turret.ageTicks}` : "idle" },
    { label: "hull", value: unit.intents.hull.active ? `face (${unit.intents.hull.target.x.toFixed(1)}, ${unit.intents.hull.target.y.toFixed(1)}) err=${unit.intents.hull.errorDeg.toFixed(1)}deg age=${unit.intents.hull.ageTicks}` : "idle" },
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
    return `box ${shape.lengthM.toFixed(1)}x${shape.widthM.toFixed(1)}m`;
  }
  return `circle r=${shape.radiusM.toFixed(1)}m`;
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
  if (payload.blastRadiusM > 0) {
    parts.push(`d=${payload.impactDistanceM.toFixed(1)}/${payload.blastRadiusM.toFixed(1)}m`);
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
  if (typeof action.centerDeg === "number" && typeof action.widthDeg === "number") {
    return ` ${action.centerDeg.toFixed(0)}deg/${action.widthDeg.toFixed(0)}deg`;
  }
  return "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
