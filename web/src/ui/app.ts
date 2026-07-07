import type { BattleFrame } from "../types/protocol";
import type { BattleReplay } from "../replay/replay";
import { parseBattleReplay } from "../replay/replay.ts";
import { createBattlefieldRenderer } from "./battlefieldRenderer.ts";

export const DEFAULT_PRESET_REPLAY_URL = "/replays/preset_duel_python_v0.replay.json";

export type RenderAppOptions = {
  defaultReplayUrl?: string | null;
  autoplayDefaultReplay?: boolean;
  fetchText?: (url: string) => Promise<string>;
};

export function renderApp(root: HTMLElement, options: RenderAppOptions = {}): void {
  root.innerHTML = `
    <section class="workbench">
      <aside class="panel">
        <h1>Robolocks</h1>
        <label class="file-control">
          Replay JSON
          <input id="replay" type="file" accept="application/json,.json" />
        </label>
        <div class="transport">
          <button id="prev" disabled>Prev</button>
          <button id="play" disabled>Play</button>
          <button id="next" disabled>Next</button>
        </div>
        <div class="status" id="status">Ready</div>
        <div class="inspector" id="inspector"></div>
      </aside>
      <section class="battlefield" id="battlefield"></section>
    </section>
  `;

  const status = root.querySelector<HTMLElement>("#status")!;
  const inspector = root.querySelector<HTMLElement>("#inspector")!;
  const battlefield = root.querySelector<HTMLElement>("#battlefield")!;
  const replay = root.querySelector<HTMLInputElement>("#replay")!;
  const prev = root.querySelector<HTMLButtonElement>("#prev")!;
  const play = root.querySelector<HTMLButtonElement>("#play")!;
  const next = root.querySelector<HTMLButtonElement>("#next")!;

  if (!status || !inspector || !battlefield || !replay || !prev || !play || !next) {
    throw new Error("Workbench elements were not created");
  }

  const battlefieldRenderer = createBattlefieldRenderer(battlefield);
  const defaultReplayUrl = options.defaultReplayUrl === undefined
    ? DEFAULT_PRESET_REPLAY_URL
    : options.defaultReplayUrl;
  const autoplayDefaultReplay = options.autoplayDefaultReplay ?? true;
  const fetchText = options.fetchText ?? fetchTextFromUrl;
  let loadedReplay: BattleReplay | null = null;
  let replayIndex = 0;
  let replayTimer: ReturnType<typeof setInterval> | null = null;

  replay.addEventListener("change", () => {
    const file = replay.files?.[0];
    if (!file) {
      return;
    }

    stopReplayPlayback();
    replay.disabled = true;
    status.textContent = "Loading replay";
    inspector.innerHTML = "";
    battlefieldRenderer.clear();

    void file.text()
      .then((text) => {
        loadReplayText(text);
      })
      .catch((error: unknown) => {
        loadedReplay = null;
        const message = error instanceof Error ? error.message : String(error);
        status.textContent = `Replay load failed: ${message}`;
      })
      .finally(() => {
        replay.disabled = false;
        replay.value = "";
        updateTransport();
      });
  });

  prev.addEventListener("click", () => {
    stopReplayPlayback();
    showReplayFrame(replayIndex - 1);
  });

  next.addEventListener("click", () => {
    stopReplayPlayback();
    showReplayFrame(replayIndex + 1);
  });

  play.addEventListener("click", () => {
    if (replayTimer) {
      stopReplayPlayback();
      return;
    }
    startReplayPlayback();
  });

  if (defaultReplayUrl !== null) {
    void loadReplayUrl(defaultReplayUrl);
  }

  async function loadReplayUrl(url: string): Promise<void> {
    stopReplayPlayback();
    status.textContent = "Loading preset replay";
    inspector.innerHTML = "";
    battlefieldRenderer.clear();
    try {
      loadReplayText(await fetchText(url));
      if (autoplayDefaultReplay) {
        startReplayPlayback();
      }
    } catch (error: unknown) {
      loadedReplay = null;
      const message = error instanceof Error ? error.message : String(error);
      status.textContent = `Preset replay load failed: ${message}`;
      updateTransport();
    }
  }

  function loadReplayText(text: string): void {
    loadedReplay = parseBattleReplay(text);
    replayIndex = 0;
    battlefieldRenderer.drawStaticObstacles(loadedReplay.obstacles);
    showReplayFrame(0);
  }

  function showReplayFrame(index: number): void {
    if (!loadedReplay || loadedReplay.frames.length === 0) {
      return;
    }
    replayIndex = Math.max(0, Math.min(index, loadedReplay.frames.length - 1));
    const frame = loadedReplay.frames[replayIndex];
    renderFrame(frame, `Replay ${replayIndex + 1}/${loadedReplay.frames.length} - tick ${frame.tick}`);
    updateTransport();
  }

  function startReplayPlayback(): void {
    if (!loadedReplay || replayTimer || loadedReplay.frames.length <= 1) {
      return;
    }
    const delayMs = Math.max(1, 1000 / loadedReplay.tickRate);
    play.textContent = "Pause";
    replayTimer = setInterval(() => {
      if (!loadedReplay || replayIndex >= loadedReplay.frames.length - 1) {
        stopReplayPlayback();
        return;
      }
      showReplayFrame(replayIndex + 1);
    }, delayMs);
  }

  function stopReplayPlayback(): void {
    if (replayTimer) {
      clearInterval(replayTimer);
      replayTimer = null;
    }
    play.textContent = "Play";
  }

  function updateTransport(): void {
    const hasReplay = loadedReplay !== null && loadedReplay.frames.length > 0;
    prev.disabled = !hasReplay || replayIndex <= 0;
    next.disabled = !hasReplay || replayIndex >= (loadedReplay?.frames.length ?? 0) - 1;
    play.disabled = !hasReplay || (loadedReplay?.frames.length ?? 0) <= 1;
    if (!replayTimer) {
      play.textContent = "Play";
    }
  }


  function renderFrame(frame: BattleFrame, statusText: string): void {
    battlefieldRenderer.drawFrame(frame);
    status.textContent = statusText;
    inspector.innerHTML = formatInspector(frame);
  }
}

async function fetchTextFromUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`.trim());
  }
  return response.text();
}

function formatInspector(frame: BattleFrame): string {
  const units = frame.units
    .map((unit) => {
      const actions = frame.actions.filter((action) => action.unitId === unit.unitId);
      const events = frame.events.filter((event) => event.unitId === unit.unitId);
      return `
      <section class="unit-card" data-side="${unit.name.toLowerCase()}">
        <div class="unit-card-head">
          <strong>${unit.name}</strong>
          <span>unit ${unit.unitId}</span>
        </div>
        <dl class="unit-stats">
          <div><dt>Position</dt><dd>${unit.position.x.toFixed(2)}, ${unit.position.y.toFixed(2)}</dd></div>
          <div><dt>Hull</dt><dd>${unit.hullHeadingDeg.toFixed(1)} deg</dd></div>
          <div><dt>Turret</dt><dd>${unit.turretHeadingDeg.toFixed(1)} deg</dd></div>
          <div><dt>Shape</dt><dd>${shapeLabel(unit.bodyShape)}</dd></div>
          <div><dt>Armor</dt><dd>${unit.armorIntegrity.toFixed(0)}</dd></div>
          <div><dt>Reload</dt><dd>${unit.weaponCooldownTicks} ticks</dd></div>
        </dl>
        <div class="unit-subtitle">Modules</div>
        <ul class="action-list">${formatModuleItems(unit)}</ul>
        <div class="unit-subtitle">Intents</div>
        <ul class="action-list">${formatIntentItems(unit)}</ul>
        <div class="unit-subtitle">Actions</div>
        <ul class="action-list">${formatActionItems(actions)}</ul>
        <div class="unit-subtitle">Events</div>
        <ul class="event-list">${formatEventItems(events)}</ul>
      </section>
    `;
    })
    .join("");

  return `
    <div class="debug-block">
      <div class="debug-title">Units</div>
      <div class="unit-stack">${units}</div>
    </div>
  `;
}

function formatModuleItems(unit: BattleFrame["units"][number]): string {
  return `
    <li><span>move</span> ${unit.modules.mobility.id} ${unit.modules.mobility.maxSpeedMps.toFixed(1)}m/s ${unit.modules.mobility.maxHullTurnDegps.toFixed(0)}deg/s</li>
    <li><span>turret</span> ${unit.modules.turret.id} ${unit.modules.turret.maxTurnDegps.toFixed(0)}deg/s</li>
    <li><span>weapon</span> ${unit.modules.weapon.id} dmg=${unit.modules.weapon.damage.toFixed(0)} v=${unit.modules.weapon.muzzleVelocityMps.toFixed(0)}m/s r=${unit.modules.weapon.projectileRadiusM.toFixed(2)}m reload=${unit.modules.weapon.reloadTicks}</li>
    <li><span>armor</span> ${unit.modules.armor.id} hp=${unit.modules.armor.integrity.toFixed(0)}</li>
    <li><span>body</span> ${unit.modules.body.id} mass=${unit.modules.body.massKg.toFixed(0)}kg</li>
    <li><span>sensor</span> ${unit.modules.sensor.id} ${unit.modules.sensor.rangeM.toFixed(0)}m/${unit.modules.sensor.fovDeg.toFixed(0)}deg</li>
  `;
}

function formatIntentItems(unit: BattleFrame["units"][number]): string {
  const mobility = unit.intents.mobility.active
    ? `move (${unit.intents.mobility.target.x.toFixed(1)}, ${unit.intents.mobility.target.y.toFixed(1)}) rem=${unit.intents.mobility.remainingM.toFixed(1)}m age=${unit.intents.mobility.ageTicks}`
    : "idle";
  const turret = unit.intents.turret.active
    ? `aim (${unit.intents.turret.target.x.toFixed(1)}, ${unit.intents.turret.target.y.toFixed(1)}) err=${unit.intents.turret.errorDeg.toFixed(1)}deg age=${unit.intents.turret.ageTicks}`
    : "idle";
  const hull = unit.intents.hull.active
    ? `face (${unit.intents.hull.target.x.toFixed(1)}, ${unit.intents.hull.target.y.toFixed(1)}) err=${unit.intents.hull.errorDeg.toFixed(1)}deg age=${unit.intents.hull.ageTicks}`
    : "idle";
  const weapon = unit.intents.weapon.active
    ? `fire p>=${unit.intents.weapon.minHitChance.toFixed(2)} age=${unit.intents.weapon.ageTicks}`
    : "idle";

  return `
    <li><span>move</span> ${mobility}</li>
    <li><span>turret</span> ${turret}</li>
    <li><span>hull</span> ${hull}</li>
    <li><span>weapon</span> ${weapon}</li>
  `;
}

function shapeLabel(shape: BattleFrame["units"][number]["bodyShape"]): string {
  if (shape.type === "box") {
    return `box ${shape.lengthM.toFixed(1)}x${shape.widthM.toFixed(1)}m`;
  }
  return `circle r=${shape.radiusM.toFixed(1)}m`;
}

function formatActionItems(actions: BattleFrame["actions"]): string {
  if (actions.length === 0) {
    return `<li><span>-</span> no actions</li>`;
  }
  return actions
    .map((action) => `<li><span>${action.channel}</span> ${action.type}${actionTarget(action)}</li>`)
    .join("");
}

function formatEventItems(events: BattleFrame["events"]): string {
  if (events.length === 0) {
    return `<li><span>-</span> no events</li>`;
  }
  return events
    .map((event) => `<li><span>${event.tick}</span> ${event.code}</li>`)
    .join("");
}

function actionTarget(action: BattleFrame["actions"][number]): string {
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
