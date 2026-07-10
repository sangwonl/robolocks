import type { BattleReplay } from "../replay/replay";
import type { BattleFrame, BodyShapeFrame, FieldBoundsFrame, UnitFrame, UnitModulesFrame } from "../types/protocol";
import { createResearchDuelWithJsonBotFromWasmFactory, type JsonBotTick, type KernelBattleRunner } from "../sim/kernelAdapter.ts";
import { PYTHON_SDK_FILES } from "./pythonSdkFiles.generated.ts";
import type { ResearchProgress } from "./researchWorkerProtocol.ts";

export type ResearchBotLogicPreset = {
  id: string;
  label: string;
  description: string;
  source: string;
};

// Movement model note (drives every bot below):
//   * A unit moves FORWARD along its hull heading; MoveTo(target) makes the hull
//     steer toward that target, so to go somewhere you just MoveTo there.
//   * FaceArmorToward(x) overrides hull steering to face x, so it fights MoveTo.
//     Use it only while standing still (angling armor), never while maneuvering.
//   * AimAt drives the TURRET independently, so a unit can move any direction and
//     still keep its gun on target and fire.
// The tactics below therefore steer with MoveTo alone and let the turret fire,
// re-homing on the enemy's live position every tick for genuinely dynamic motion.

const CHARGER_BOT_SOURCE = `from robolocks import (
    AimAt,
    BattleState,
    FireIfSolution,
    MoveTo,
    OrderLike,
    ScanArc,
    run_bot,
)

# Charger: rush the closest enemy and brawl point-blank. Driving straight at them
# keeps our thick front armor pointed their way while the turret fires. We re-home
# on the enemy's live position every tick, so we chase a moving target.


def on_tick(state: BattleState) -> list[OrderLike]:
    own = state.own_unit
    enemy = state.contacts.closest_enemy()
    if not enemy:
        return [MoveTo(state.map.center), ScanArc(direction=own.turret_heading, width=160.0)]
    return [
        AimAt(enemy.position),
        FireIfSolution(min_hit_chance=0.0),
        MoveTo(enemy.position),
    ]


run_bot(on_tick)
`;

const SKIRMISHER_BOT_SOURCE = `from robolocks import (
    AimAt,
    BattleState,
    FireIfSolution,
    MoveTo,
    OrderLike,
    ScanArc,
    run_bot,
)
import math

# Skirmisher: keep the enemy inside a preferred range band. Too far -> close in;
# too close -> give ground; inside the band -> hold. Steers with MoveTo only so
# the hull follows the movement while the turret keeps the gun on target.
OPTIMAL_M = 18.0
BAND_M = 4.0


def on_tick(state: BattleState) -> list[OrderLike]:
    own = state.own_unit
    enemy = state.contacts.closest_enemy()
    if not enemy:
        return [MoveTo(state.map.center), ScanArc(direction=own.turret_heading, width=160.0)]

    dx = own.position.x - enemy.position.x
    dy = own.position.y - enemy.position.y
    dist = math.hypot(dx, dy) or 1.0
    orders: list[OrderLike] = [AimAt(enemy.position), FireIfSolution(min_hit_chance=0.4)]

    if abs(dist - OPTIMAL_M) > BAND_M:
        # Re-establish the standoff by moving to a point OPTIMAL_M from the enemy
        # along the line between us.
        ux, uy = dx / dist, dy / dist
        orders.append(MoveTo({"x": enemy.position.x + ux * OPTIMAL_M, "y": enemy.position.y + uy * OPTIMAL_M}))
    return orders


run_bot(on_tick)
`;

const ORBITER_BOT_SOURCE = `from robolocks import (
    AimAt,
    BattleState,
    FireIfSolution,
    MoveTo,
    OrderLike,
    ScanArc,
    run_bot,
)
import math

# Orbiter: circle the enemy at a fixed radius, sliding around the ring (strafe).
# Constant lateral motion makes us a hard target for slow shells while the turret
# keeps firing inward. Each tick we aim a step further around the circle.
RADIUS_M = 18.0
STEP_DEG = 26.0


def on_tick(state: BattleState) -> list[OrderLike]:
    own = state.own_unit
    enemy = state.contacts.closest_enemy()
    if not enemy:
        return [MoveTo(state.map.center), ScanArc(direction=own.turret_heading, width=160.0)]

    angle = math.atan2(own.position.y - enemy.position.y, own.position.x - enemy.position.x)
    angle += math.radians(STEP_DEG)  # advance counter-clockwise around the enemy
    target = {
        "x": enemy.position.x + math.cos(angle) * RADIUS_M,
        "y": enemy.position.y + math.sin(angle) * RADIUS_M,
    }
    return [AimAt(enemy.position), FireIfSolution(min_hit_chance=0.35), MoveTo(target)]


run_bot(on_tick)
`;

const FLANKER_BOT_SOURCE = `from robolocks import (
    AimAt,
    BattleState,
    FireIfSolution,
    MoveTo,
    OrderLike,
    ScanArc,
    run_bot,
)
import math

# Flanker: work around to the enemy's side, where armor is thin, instead of
# trading blows head-on. We aim for a point off the flank we are already nearer
# to; as the enemy turns to face us, that point moves, so it becomes a continuous
# chase around them while the turret keeps firing.
FLANK_M = 15.0


def on_tick(state: BattleState) -> list[OrderLike]:
    own = state.own_unit
    enemy = state.contacts.closest_enemy()
    if not enemy:
        return [MoveTo(state.map.center), ScanArc(direction=own.turret_heading, width=160.0)]

    hull = math.radians(enemy.hull_heading)
    # Perpendicular to the enemy's facing = their left/right side.
    px, py = -math.sin(hull), math.cos(hull)
    # Commit to whichever flank we are already on.
    if (own.position.x - enemy.position.x) * px + (own.position.y - enemy.position.y) * py < 0.0:
        px, py = -px, -py
    target = {"x": enemy.position.x + px * FLANK_M, "y": enemy.position.y + py * FLANK_M}
    return [AimAt(enemy.position), FireIfSolution(min_hit_chance=0.4), MoveTo(target)]


run_bot(on_tick)
`;

const EVADER_BOT_SOURCE = `from robolocks import (
    AimAt,
    BattleState,
    FireIfSolution,
    MoveTo,
    OrderLike,
    ScanArc,
    run_bot,
)
import math

# Evader: fight at long range and dance. If a shell is inbound, sidestep across
# its path; otherwise hold distance and back off when the enemy closes. The turret
# stays on target, so we keep firing while dodging.
KEEP_M = 26.0
DODGE_M = 7.0


def on_tick(state: BattleState) -> list[OrderLike]:
    own = state.own_unit
    enemy = state.contacts.closest_enemy()

    # 1) Dodge the nearest inbound shell (step perpendicular to its travel).
    for shell in state.contacts.projectiles:
        if shell.owner_unit_id == state.self_id:
            continue
        vx = shell.position.x - shell.previous_position.x
        vy = shell.position.y - shell.previous_position.y
        speed = math.hypot(vx, vy)
        if speed < 1e-6:
            continue
        nx, ny = -vy / speed, vx / speed  # perpendicular to the shell's path
        if (own.position.x - shell.position.x) * nx + (own.position.y - shell.position.y) * ny < 0.0:
            nx, ny = -nx, -ny  # sidestep away from the shell
        dodge = {"x": own.position.x + nx * DODGE_M, "y": own.position.y + ny * DODGE_M}
        if enemy:
            return [AimAt(enemy.position), FireIfSolution(min_hit_chance=0.5), MoveTo(dodge)]
        return [MoveTo(dodge)]

    # 2) No incoming fire: hold long range, retreat if crowded.
    if not enemy:
        return [MoveTo(state.map.center), ScanArc(direction=own.turret_heading, width=160.0)]
    dx = own.position.x - enemy.position.x
    dy = own.position.y - enemy.position.y
    dist = math.hypot(dx, dy) or 1.0
    orders: list[OrderLike] = [AimAt(enemy.position), FireIfSolution(min_hit_chance=0.5)]
    if dist < KEEP_M:
        orders.append(MoveTo({"x": enemy.position.x + dx / dist * KEEP_M, "y": enemy.position.y + dy / dist * KEEP_M}))
    return orders


run_bot(on_tick)
`;

export const RESEARCH_BOT_LOGIC_PRESETS: ResearchBotLogicPreset[] = [
  {
    id: "empty",
    label: "Empty",
    description: "Start with a blank editor.",
    source: "",
  },
  {
    id: "charger",
    label: "Charger — rush & brawl",
    description: "Charges the closest enemy and fights point-blank, chasing their live position.",
    source: CHARGER_BOT_SOURCE,
  },
  {
    id: "skirmisher",
    label: "Skirmisher — hold range",
    description: "Keeps the enemy in a preferred range band, closing or backing off to hold the standoff.",
    source: SKIRMISHER_BOT_SOURCE,
  },
  {
    id: "orbiter",
    label: "Orbiter — circle & strafe",
    description: "Circles the enemy at a set radius, strafing constantly while the turret fires inward.",
    source: ORBITER_BOT_SOURCE,
  },
  {
    id: "flanker",
    label: "Flanker — hit the weak side",
    description: "Swings around to the enemy's flank to attack their thinner side armor, chasing as they turn.",
    source: FLANKER_BOT_SOURCE,
  },
  {
    id: "evader",
    label: "Evader — kite & dodge",
    description: "Fights at long range and sidesteps incoming shells, backing off when the enemy closes.",
    source: EVADER_BOT_SOURCE,
  },
  {
    id: "custom",
    label: "Custom",
    description: "Use the current editor contents.",
    source: "",
  },
];

export const DEFAULT_RESEARCH_BOT_SOURCE = CHARGER_BOT_SOURCE;

export const NO_OP_BOT_SOURCE = `from robolocks import (
    BattleState,
    OrderLike,
    run_bot,
)


def on_tick(state: BattleState) -> list[OrderLike]:
    return []


run_bot(on_tick)
`;

export type ResearchRunOptions = {
  botSource: string;
  botSourcesByUnit?: Record<number, string>;
  battleConfigJson?: string;
  tickCount: number;
  createBotRuntime?: BrowserBotRuntimeFactory;
  createRunner?: ResearchRunnerFactory;
  onProgress?: (progress: ResearchProgress) => void;
};

// Emit a `simulating` progress event at most this often so a long run does not
// flood postMessage; the final tick is always reported.
const SIMULATION_PROGRESS_INTERVAL = 20;

export type BotLogEntry = {
  tick: number;
  unitId: number;
  stream: "stdout" | "stderr";
  message: string;
};

export type ResearchRunResult = {
  replay: BattleReplay;
  logs: BotLogEntry[];
};

export type BrowserBotRuntime = {
  onTick: JsonBotTick;
  drainLogs?(): Omit<BotLogEntry, "tick" | "unitId">[];
  destroy?(): void;
};

export type BrowserBotRuntimeFactory = (botSource: string, botId: number) => Promise<BrowserBotRuntime>;

export type ResearchRunnerFactory = (options: {
  botId: number;
  battleConfigJson: string;
  onTick: JsonBotTick;
}) => Promise<KernelBattleRunner>;

export type ResearchBattlePreset = {
  id: string;
  label: string;
  description: string;
  field: FieldBoundsFrame;
  obstacles: unknown[];
  flagPosition: { x: number; y: number };
  blueSpawn: { x: number; y: number; headingDeg: number };
  targetSpawn: { x: number; y: number; headingDeg: number };
  blueRespawnZone: ResearchRespawnZone;
  targetRespawnZone: ResearchRespawnZone;
};

type ResearchRespawnZone = {
  position: { x: number; y: number };
  radiusMeters: number;
  headingDeg: number;
};

export type ResearchUnitPreset = {
  id: string;
  label: string;
  description: string;
  modules: ResearchUnitModulesConfig;
};

export type ResearchRulePreset = {
  id: string;
  label: string;
  description: string;
  rule: ResearchRuleConfig;
};

type ResearchRuleConfig = Record<string, unknown>;

type ResearchUnitModulesConfig = {
  mobility: Record<string, unknown>;
  turret: Record<string, unknown>;
  weapon: Record<string, unknown>;
  armor: Record<string, unknown>;
  body: Record<string, unknown>;
  sensor: Record<string, unknown>;
};

export async function runResearchInBrowser(options: ResearchRunOptions): Promise<ResearchRunResult> {
  const tickCount = normalizeTickCount(options.tickCount);
  const battleConfigJson = options.battleConfigJson ?? DEFAULT_RESEARCH_BATTLE_CONFIG_JSON;
  const configuredFieldShape = fieldShapeFromBattleConfigJson(battleConfigJson);
  const onProgress = options.onProgress ?? (() => {});
  const createBotRuntime = options.createBotRuntime ?? ((botSource, botId) => createPyodideBotRuntime(botSource, botId, onProgress));
  const botSourcesByUnit = botSourcesByUnitFromConfig(battleConfigJson, options.botSource, options.botSourcesByUnit);
  const botRuntimes = new Map<number, BrowserBotRuntime>();
  for (const [unitId, botSource] of botSourcesByUnit) {
    botRuntimes.set(unitId, await createBotRuntime(botSource, unitId));
  }
  const createRunner = options.createRunner ?? ((runnerOptions) => createResearchDuelWithJsonBotFromWasmFactory(runnerOptions));
  const runner = await createRunner({
    botId: 1,
    battleConfigJson,
    onTick(observation) {
      const botId = isRecord(observation) && typeof observation.botId === "number" ? observation.botId : 1;
      return botRuntimes.get(botId)?.onTick(observation) ?? { orders: [] };
    },
  });

  try {
    const frames = [runner.snapshot()];
    const logs: BotLogEntry[] = [];
    onProgress({ stage: "simulating", tick: 0, totalTicks: tickCount });
    for (let i = 0; i < tickCount; i += 1) {
      const frame = runner.step();
      frames.push(frame);
      for (const [unitId, botRuntime] of botRuntimes) {
        for (const log of botRuntime.drainLogs?.() ?? []) {
          logs.push({ ...log, tick: frame.tick, unitId });
        }
      }
      const completed = i + 1;
      // Stop as soon as the rule decides the battle (or the engine settles it on
      // score at the tick-limit deadline). tickCount is the max, not a fixed run
      // length — the rule governs when the battle actually ends.
      if (frame.ruleState?.outcome?.finished) {
        onProgress({ stage: "simulating", tick: completed, totalTicks: tickCount });
        break;
      }
      if (completed === tickCount || completed % SIMULATION_PROGRESS_INTERVAL === 0) {
        onProgress({ stage: "simulating", tick: completed, totalTicks: tickCount });
      }
    }

    return {
      replay: {
        type: "robolocks.replay.v1",
        tickRate: 60,
        obstacles: runner.staticObstacles(),
        frames: applyConfiguredFieldShape(frames, configuredFieldShape),
      },
      logs,
    };
  } finally {
    runner.destroy();
    for (const [, botRuntime] of botRuntimes) {
      botRuntime.destroy?.();
    }
  }
}

export const DEFAULT_RESEARCH_BATTLE_CONFIG_JSON = JSON.stringify({
  battleId: "research_duel_v0",
  seed: 1,
  tickRate: 60,
  tickLimit: 18000,
  obstacles: [
    {
      id: "research_cover",
      position: { x: 20, y: 6 },
      radiusMeters: 1.5,
      blocksMovement: true,
      blocksLineOfSight: true,
    },
  ],
  units: [
    {
      unitId: 1,
      teamId: 1,
      name: "Blue",
      spawn: { x: 4, y: 5, headingDeg: 35 },
      modules: {
        mobility: { id: "tracked_chassis_mk1", maxSpeedMetersPerSecond: 6.0, maxHullTurnDegreesPerSecond: 120.0 },
        turret: { id: "light_turret_mk1", maxTurnDegreesPerSecond: 180.0 },
        weapon: { id: "slow_cannon_test", damage: 25.0, penetrationMillimeters: 120.0, rangeMeters: 80.0, muzzleVelocityMetersPerSecond: 20.0, muzzleOffsetMeters: { x: 3.6, y: 0.0, z: 1.65 }, projectileRadiusMeters: 0.08, reloadTicks: 180 },
        armor: { id: "rolled_armor_mk1", integrity: 100.0, frontMillimeters: 100.0, sideMillimeters: 70.0, rearMillimeters: 45.0 },
        body: { id: "medium_hull_mk1", massKilograms: 30000.0, shape: { type: "box", radiusMeters: 1.2, lengthMeters: 5.6, widthMeters: 2.8 } },
        sensor: { id: "visual_optic_mk1", rangeMeters: 60.0, fovDegrees: 120.0, refreshTicks: 1 },
      },
    },
    {
      unitId: 2,
      teamId: 2,
      name: "Red",
      spawn: { x: 34, y: 18, headingDeg: 215 },
      modules: {
        mobility: { id: "fixed_target_chassis", maxSpeedMetersPerSecond: 0.0, maxHullTurnDegreesPerSecond: 60.0 },
        turret: { id: "light_turret_mk1", maxTurnDegreesPerSecond: 180.0 },
        weapon: { id: "slow_cannon_test", damage: 25.0, penetrationMillimeters: 120.0, rangeMeters: 80.0, muzzleVelocityMetersPerSecond: 20.0, muzzleOffsetMeters: { x: 3.6, y: 0.0, z: 1.65 }, projectileRadiusMeters: 0.08, reloadTicks: 180 },
        armor: { id: "rolled_armor_mk1", integrity: 100.0, frontMillimeters: 100.0, sideMillimeters: 70.0, rearMillimeters: 45.0 },
        body: { id: "medium_hull_mk1", massKilograms: 30000.0, shape: { type: "box", radiusMeters: 1.2, lengthMeters: 5.6, widthMeters: 2.8 } },
        sensor: { id: "visual_optic_mk1", rangeMeters: 60.0, fovDegrees: 120.0, refreshTicks: 1 },
      },
    },
  ],
  controllers: [
    { unitId: 1, type: "json_callback" },
  ],
  rule: {
    mode: "kill_limit_deathmatch",
    teamMode: "team",
    killLimit: 3,
    timeLimitTicks: 18000,
    respawn: {
      enabled: true,
      cooldownTicks: 180,
      invulnerableTicks: 60,
      spawnPoints: [
        { id: "blue_research_spawn", teamId: 1, position: { x: 4, y: 5 }, radiusMeters: 2.5, headingDegrees: 35 },
        { id: "target_research_spawn", teamId: 2, position: { x: 34, y: 18 }, radiusMeters: 2.5, headingDegrees: 215 },
      ],
    },
  },
});

const STANDARD_MODULES: ResearchUnitModulesConfig = {
  mobility: { id: "tracked_chassis_mk1", maxSpeedMetersPerSecond: 6.0, maxHullTurnDegreesPerSecond: 120.0 },
  turret: { id: "light_turret_mk1", maxTurnDegreesPerSecond: 180.0 },
  weapon: { id: "slow_cannon_test", damage: 25.0, penetrationMillimeters: 120.0, rangeMeters: 80.0, muzzleVelocityMetersPerSecond: 20.0, muzzleOffsetMeters: { x: 3.6, y: 0.0, z: 1.65 }, projectileRadiusMeters: 0.08, reloadTicks: 180 },
  armor: { id: "rolled_armor_mk1", integrity: 100.0, frontMillimeters: 100.0, sideMillimeters: 70.0, rearMillimeters: 45.0 },
  body: { id: "medium_hull_mk1", massKilograms: 30000.0, shape: { type: "box", radiusMeters: 1.2, lengthMeters: 5.6, widthMeters: 2.8 } },
  sensor: { id: "visual_optic_mk1", rangeMeters: 60.0, fovDegrees: 120.0, refreshTicks: 1 },
};

const LARGE_RECT_RESEARCH_FIELD: FieldBoundsFrame = {
  min: { x: -108, y: -68 },
  max: { x: 148, y: 92 },
};

const CIRCLE_ARENA_FIELD: FieldBoundsFrame = {
  min: { x: -52, y: -60 },
  max: { x: 92, y: 84 },
  shape: { type: "circle", center: { x: 20, y: 12 }, radiusMeters: 72 },
};

const HEX_ARENA_FIELD: FieldBoundsFrame = {
  min: { x: -52, y: -39.25 },
  max: { x: 92, y: 66.75 },
  shape: {
    type: "polygon",
    vertices: [
      { x: 20, y: -39.25 },
      { x: 92, y: -11.25 },
      { x: 92, y: 38.75 },
      { x: 20, y: 66.75 },
      { x: -52, y: 38.75 },
      { x: -52, y: -11.25 },
    ],
  },
};

type ScatterAvoid = { x: number; y: number; radiusMeters: number };

function pointInPolygon(px: number, py: number, verts: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const intersects =
      verts[i].y > py !== verts[j].y > py &&
      px < ((verts[j].x - verts[i].x) * (py - verts[i].y)) / (verts[j].y - verts[i].y) + verts[i].x;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function insideFieldShape(field: FieldBoundsFrame, x: number, y: number, inset: number): boolean {
  const shape = field.shape;
  if (shape?.type === "circle") {
    return Math.hypot(x - shape.center.x, y - shape.center.y) <= shape.radiusMeters - inset;
  }
  if (shape?.type === "polygon") {
    if (!pointInPolygon(x, y, shape.vertices)) {
      return false;
    }
    for (let i = 0; i < shape.vertices.length; i += 1) {
      const a = shape.vertices[i];
      const b = shape.vertices[(i + 1) % shape.vertices.length];
      if (distanceToSegment(x, y, a.x, a.y, b.x, b.y) < inset) {
        return false;
      }
    }
    return true;
  }
  return (
    x >= field.min.x + inset && x <= field.max.x - inset && y >= field.min.y + inset && y <= field.max.y - inset
  );
}

// Scatters cover across the whole play field on a jittered grid, skipping the
// flag (capture zone) and the spawn/respawn zones so nothing spawns on top of an
// objective or a unit. Deterministic (index-based jitter) so replays are stable.
function spreadObstacles(params: {
  idPrefix: string;
  field: FieldBoundsFrame;
  flag: { x: number; y: number };
  avoid: ScatterAvoid[];
  spacingM: number;
  insetM: number;
  flagClearM: number;
  radii: number[];
}): unknown[] {
  const { idPrefix, field, flag, avoid, spacingM, insetM, flagClearM, radii } = params;
  const out: unknown[] = [];
  let index = 0;
  for (let gx = field.min.x + spacingM; gx < field.max.x; gx += spacingM) {
    for (let gy = field.min.y + spacingM; gy < field.max.y; gy += spacingM) {
      const jitterX = ((index * 41) % 17) - 8;
      const jitterY = ((index * 29) % 15) - 7;
      index += 1;
      const x = gx + jitterX;
      const y = gy + jitterY;
      if (!insideFieldShape(field, x, y, insetM)) {
        continue;
      }
      if (Math.hypot(x - flag.x, y - flag.y) < flagClearM) {
        continue;
      }
      if (avoid.some((zone) => Math.hypot(x - zone.x, y - zone.y) < zone.radiusMeters + 8)) {
        continue;
      }
      out.push({
        id: `${idPrefix}_${out.length}`,
        position: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 },
        radiusMeters: radii[out.length % radii.length],
        blocksMovement: true,
        blocksLineOfSight: true,
      });
    }
  }
  return out;
}

export const RESEARCH_BATTLE_PRESETS: ResearchBattlePreset[] = [
  {
    id: "covered_duel",
    label: "Covered Duel",
    description: "One line-of-sight blocker between a mobile unit and a fixed target.",
    field: LARGE_RECT_RESEARCH_FIELD,
    obstacles: spreadObstacles({
      idPrefix: "covered",
      field: LARGE_RECT_RESEARCH_FIELD,
      flag: { x: 20, y: 12 },
      avoid: [{ x: -68, y: -28, radiusMeters: 10 }, { x: 108, y: 52, radiusMeters: 10 }],
      spacingM: 68,
      insetM: 16,
      flagClearM: 14,
      radii: [1.5, 1.3, 1.6],
    }),
    flagPosition: { x: 20, y: 12 },
    blueSpawn: { x: -68, y: -28, headingDeg: 35 },
    targetSpawn: { x: 108, y: 52, headingDeg: 215 },
    blueRespawnZone: { position: { x: -68, y: -28 }, radiusMeters: 10, headingDeg: 35 },
    targetRespawnZone: { position: { x: 108, y: 52 }, radiusMeters: 10, headingDeg: 215 },
  },
  {
    id: "open_range",
    label: "Open Range",
    description: "No cover, useful for weapon timing and sensor checks.",
    field: LARGE_RECT_RESEARCH_FIELD,
    obstacles: [],
    flagPosition: { x: 20, y: 12 },
    blueSpawn: { x: -70, y: 12, headingDeg: 0 },
    targetSpawn: { x: 110, y: 12, headingDeg: 180 },
    blueRespawnZone: { position: { x: -70, y: 12 }, radiusMeters: 12, headingDeg: 0 },
    targetRespawnZone: { position: { x: 110, y: 12 }, radiusMeters: 12, headingDeg: 180 },
  },
  {
    id: "close_cover",
    label: "Close Cover",
    description: "Shorter spawn distance with central cover pressure.",
    field: LARGE_RECT_RESEARCH_FIELD,
    obstacles: spreadObstacles({
      idPrefix: "close_cover",
      field: LARGE_RECT_RESEARCH_FIELD,
      flag: { x: 20, y: 12 },
      avoid: [{ x: -58, y: -22, radiusMeters: 10 }, { x: 98, y: 46, radiusMeters: 10 }],
      spacingM: 34,
      insetM: 14,
      flagClearM: 12,
      radii: [2.0, 1.6, 1.8, 1.4],
    }),
    flagPosition: { x: 20, y: 12 },
    blueSpawn: { x: -58, y: -22, headingDeg: 20 },
    targetSpawn: { x: 98, y: 46, headingDeg: 210 },
    blueRespawnZone: { position: { x: -58, y: -22 }, radiusMeters: 10, headingDeg: 20 },
    targetRespawnZone: { position: { x: 98, y: 46 }, radiusMeters: 10, headingDeg: 210 },
  },
  {
    id: "flag_run",
    label: "Flag Run",
    description: "Staggered cover creates lanes around blockers for capture-route practice.",
    field: LARGE_RECT_RESEARCH_FIELD,
    obstacles: spreadObstacles({
      idPrefix: "flag_run",
      field: LARGE_RECT_RESEARCH_FIELD,
      flag: { x: 20, y: 12 },
      avoid: [{ x: -76, y: -38, radiusMeters: 10 }, { x: 116, y: 62, radiusMeters: 10 }],
      spacingM: 42,
      insetM: 16,
      flagClearM: 13,
      radii: [1.35, 1.45, 1.25, 1.55],
    }),
    flagPosition: { x: 20, y: 12 },
    blueSpawn: { x: -76, y: -38, headingDeg: 20 },
    targetSpawn: { x: 116, y: 62, headingDeg: 200 },
    blueRespawnZone: { position: { x: -76, y: -38 }, radiusMeters: 10, headingDeg: 20 },
    targetRespawnZone: { position: { x: 116, y: 62 }, radiusMeters: 10, headingDeg: 200 },
  },
  {
    id: "brawl_ring",
    label: "Circular Arena",
    description: "A circular obstacle ring keeps both units rotating into close combat.",
    field: CIRCLE_ARENA_FIELD,
    obstacles: spreadObstacles({
      idPrefix: "ring",
      field: CIRCLE_ARENA_FIELD,
      flag: { x: 20, y: 13 },
      avoid: [{ x: -40, y: 12, radiusMeters: 9 }, { x: 80, y: 12, radiusMeters: 9 }],
      spacingM: 30,
      insetM: 8,
      flagClearM: 12,
      radii: [1.15, 1.1, 1.25, 1.0],
    }),
    flagPosition: { x: 20, y: 13 },
    blueSpawn: { x: -40, y: 12, headingDeg: 0 },
    targetSpawn: { x: 80, y: 12, headingDeg: 180 },
    blueRespawnZone: { position: { x: -40, y: 12 }, radiusMeters: 9, headingDeg: 0 },
    targetRespawnZone: { position: { x: 80, y: 12 }, radiusMeters: 9, headingDeg: 180 },
  },
  {
    id: "hex_bastion",
    label: "Polygon Arena",
    description: "Hexagonal strongpoints create polygonal lanes for crossfire and flanking.",
    field: HEX_ARENA_FIELD,
    obstacles: spreadObstacles({
      idPrefix: "hex",
      field: HEX_ARENA_FIELD,
      flag: { x: 20, y: 13.5 },
      avoid: [{ x: -32, y: -6, radiusMeters: 9 }, { x: 72, y: 34, radiusMeters: 9 }],
      spacingM: 30,
      insetM: 9,
      flagClearM: 12,
      radii: [1.55, 1.45, 1.25, 1.65],
    }),
    flagPosition: { x: 20, y: 13.5 },
    blueSpawn: { x: -32, y: -6, headingDeg: 35 },
    targetSpawn: { x: 72, y: 34, headingDeg: 215 },
    blueRespawnZone: { position: { x: -32, y: -6 }, radiusMeters: 9, headingDeg: 35 },
    targetRespawnZone: { position: { x: 72, y: 34 }, radiusMeters: 9, headingDeg: 215 },
  },
];

export const RESEARCH_UNIT_PRESETS: ResearchUnitPreset[] = [
  {
    id: "standard_tank",
    label: "Standard Tank",
    description: "Balanced speed, armor, and direct-fire cannon.",
    modules: STANDARD_MODULES,
  },
  {
    id: "heavy_gunner",
    label: "Heavy Gunner",
    description: "Slower hull with stronger armor and higher penetration.",
    modules: {
      ...STANDARD_MODULES,
      mobility: { id: "heavy_tracks_v0", maxSpeedMetersPerSecond: 3.2, maxHullTurnDegreesPerSecond: 70.0 },
      weapon: { ...STANDARD_MODULES.weapon, id: "heavy_cannon_v0", damage: 42.0, penetrationMillimeters: 150.0, muzzleVelocityMetersPerSecond: 28.0, reloadTicks: 240 },
      armor: { id: "heavy_armor_v0", integrity: 150.0, frontMillimeters: 160.0, sideMillimeters: 95.0, rearMillimeters: 60.0 },
      body: { id: "heavy_hull_v0", massKilograms: 47000.0, shape: { type: "box", radiusMeters: 1.45, lengthMeters: 6.4, widthMeters: 3.2 } },
    },
  },
  {
    id: "ballistic_test",
    label: "Ballistic Test",
    description: "Slow indirect projectile with blast radius and visible arc.",
    modules: {
      ...STANDARD_MODULES,
      mobility: { id: "slow_chassis_test", maxSpeedMetersPerSecond: 3.0, maxHullTurnDegreesPerSecond: 60.0 },
      weapon: { id: "howitzer_test", fireMode: "ballistic", damage: 30.0, penetrationMillimeters: 65.0, rangeMeters: 95.0, muzzleVelocityMetersPerSecond: 36.0, muzzleOffsetMeters: { x: 3.3, y: 0.0, z: 1.8 }, launchAngleDegrees: 45.0, gravityMetersPerSecondSquared: 9.81, blastRadiusMeters: 2.5, projectileRadiusMeters: 0.12, aimToleranceDegrees: 8.0, reloadTicks: 210 },
    },
  },
  {
    id: "scout_optics",
    label: "Scout Optics",
    description: "Fast chassis and wider sensor cone with lighter armor.",
    modules: {
      ...STANDARD_MODULES,
      mobility: { id: "scout_tracks_v0", maxSpeedMetersPerSecond: 8.5, maxHullTurnDegreesPerSecond: 165.0 },
      armor: { id: "light_armor_v0", integrity: 72.0, frontMillimeters: 60.0, sideMillimeters: 40.0, rearMillimeters: 30.0 },
      sensor: { id: "wide_optic_v0", rangeMeters: 75.0, fovDegrees: 170.0, refreshTicks: 1 },
      body: { id: "light_hull_v0", massKilograms: 18000.0, shape: { type: "box", radiusMeters: 1.0, lengthMeters: 4.8, widthMeters: 2.4 } },
    },
  },
];

export const RESEARCH_RULE_PRESETS: ResearchRulePreset[] = [
  {
    id: "kill_limit_team",
    label: "Kill Limit",
    description: "Team deathmatch. First team to 3 kills wins; respawn keeps the fight moving.",
    rule: {
      mode: "kill_limit_deathmatch",
      teamMode: "team",
      killLimit: 3,
      timeLimitTicks: 18000,
      respawn: {
        enabled: true,
        cooldownTicks: 180,
        invulnerableTicks: 60,
      },
    },
  },
  {
    id: "timed_team",
    label: "Timed Score",
    description: "Team deathmatch by score when the clock expires; respawn is enabled.",
    rule: {
      mode: "timed_deathmatch",
      teamMode: "team",
      timeLimitTicks: 600,
      respawn: {
        enabled: true,
        cooldownTicks: 120,
        invulnerableTicks: 60,
      },
    },
  },
  {
    id: "capture_alpha",
    label: "Capture Flag",
    description: "Hold the battlefield flag for 90 ticks to win.",
    rule: {
      mode: "capture_point",
      teamMode: "team",
      timeLimitTicks: 18000,
      captureZones: [
        {
          id: "alpha",
          position: { x: 20, y: 12 },
          radiusMeters: 3.5,
          holdTicks: 180,
        },
      ],
      respawn: {
        enabled: true,
        cooldownTicks: 180,
        invulnerableTicks: 60,
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Custom battle field (Bundle B): an editable layout the 2D field editor mutates.
// The sim is 2D (x/y only), so the layout carries no heights — the 3D scene
// assigns per-element heights. `layoutToBattlePreset` maps it onto the same
// ResearchBattlePreset shape the presets use, so the config path is unchanged.
// ---------------------------------------------------------------------------

export const CUSTOM_BATTLE_ID = "custom";
const CUSTOM_SPAWN_RADIUS_M = 8;
const DEFAULT_OBSTACLE_RADIUS_M = 1.3;
const MIN_OBSTACLE_RADIUS_M = 0.4;
const MIN_FIELD_HALF_M = 6;

export type EditableObstacle = { id: string; x: number; y: number; radius: number };

export type CustomBattleLayout = {
  // circle: rx === ry === radius; rect: rx/ry are half-width/half-height.
  field: { shape: "rect" | "circle"; cx: number; cy: number; rx: number; ry: number };
  obstacles: EditableObstacle[];
  flag: { x: number; y: number };
  blueSpawn: { x: number; y: number; headingDeg: number };
  targetSpawn: { x: number; y: number; headingDeg: number };
};

// A named custom battle saved to local storage, selectable like a built-in preset.
export type SavedCustomBattle = { id: string; name: string; layout: CustomBattleLayout };

// Custom battle ids are prefixed so they never collide with built-in preset ids.
export const SAVED_CUSTOM_ID_PREFIX = "saved_";

export function isSavedCustomId(id: string): boolean {
  return id.startsWith(SAVED_CUSTOM_ID_PREFIX);
}

// A named bot logic (Python source) saved to local storage, selectable like a
// built-in logic preset and shared across both units.
export type SavedBotLogic = { id: string; name: string; source: string };

// Saved bot logic ids are prefixed so they never collide with built-in preset ids.
export const SAVED_BOT_LOGIC_ID_PREFIX = "botsaved_";

export function isSavedBotLogicId(id: string): boolean {
  return id.startsWith(SAVED_BOT_LOGIC_ID_PREFIX);
}

export function layoutFromPreset(preset: ResearchBattlePreset): CustomBattleLayout {
  const f = preset.field;
  let shape: "rect" | "circle" = "rect";
  let cx = (f.min.x + f.max.x) / 2;
  let cy = (f.min.y + f.max.y) / 2;
  let rx = (f.max.x - f.min.x) / 2;
  let ry = (f.max.y - f.min.y) / 2;
  if (f.shape?.type === "circle") {
    shape = "circle";
    cx = f.shape.center.x;
    cy = f.shape.center.y;
    rx = f.shape.radiusMeters;
    ry = f.shape.radiusMeters;
  }
  const obstacles: EditableObstacle[] = (Array.isArray(preset.obstacles) ? preset.obstacles : []).map((raw, index) => {
    const obstacle = isRecord(raw) ? raw : {};
    const position = isRecord(obstacle.position) ? obstacle.position : {};
    return {
      id: typeof obstacle.id === "string" ? obstacle.id : `obs_${index}`,
      x: typeof position.x === "number" ? position.x : 0,
      y: typeof position.y === "number" ? position.y : 0,
      radius: numberField(obstacle, "radiusMeters") || DEFAULT_OBSTACLE_RADIUS_M,
    };
  });
  return {
    field: { shape, cx, cy, rx, ry },
    obstacles,
    flag: { x: preset.flagPosition.x, y: preset.flagPosition.y },
    blueSpawn: { ...preset.blueSpawn },
    targetSpawn: { ...preset.targetSpawn },
  };
}

export function layoutToBattlePreset(layout: CustomBattleLayout): ResearchBattlePreset {
  const { field, obstacles, flag, blueSpawn, targetSpawn } = layout;
  const min = { x: field.cx - field.rx, y: field.cy - field.ry };
  const max = { x: field.cx + field.rx, y: field.cy + field.ry };
  const fieldFrame: FieldBoundsFrame = field.shape === "circle"
    ? { min, max, shape: { type: "circle", center: { x: field.cx, y: field.cy }, radiusMeters: field.rx } }
    : { min, max };
  return {
    id: CUSTOM_BATTLE_ID,
    label: "Custom",
    description: "Custom field from the Battle Field editor.",
    field: fieldFrame,
    obstacles: obstacles.map((obstacle) => ({
      id: obstacle.id,
      position: { x: obstacle.x, y: obstacle.y },
      radiusMeters: obstacle.radius,
      blocksMovement: true,
      blocksLineOfSight: true,
    })),
    flagPosition: { x: flag.x, y: flag.y },
    blueSpawn: { ...blueSpawn },
    targetSpawn: { ...targetSpawn },
    blueRespawnZone: { position: { x: blueSpawn.x, y: blueSpawn.y }, radiusMeters: CUSTOM_SPAWN_RADIUS_M, headingDeg: blueSpawn.headingDeg },
    targetRespawnZone: { position: { x: targetSpawn.x, y: targetSpawn.y }, radiusMeters: CUSTOM_SPAWN_RADIUS_M, headingDeg: targetSpawn.headingDeg },
  };
}

function clampPointToField(field: CustomBattleLayout["field"], x: number, y: number): { x: number; y: number } {
  if (field.shape === "circle") {
    const dx = x - field.cx;
    const dy = y - field.cy;
    const dist = Math.hypot(dx, dy);
    if (dist > field.rx && dist > 1e-6) {
      return { x: field.cx + (dx / dist) * field.rx, y: field.cy + (dy / dist) * field.rx };
    }
    return { x, y };
  }
  return {
    x: Math.max(field.cx - field.rx, Math.min(field.cx + field.rx, x)),
    y: Math.max(field.cy - field.ry, Math.min(field.cy + field.ry, y)),
  };
}

function nextObstacleId(obstacles: EditableObstacle[]): string {
  let max = -1;
  for (const obstacle of obstacles) {
    const match = /^obs_(\d+)$/.exec(obstacle.id);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return `obs_${max + 1}`;
}

export type LayoutAction =
  | { type: "addObstacle"; x: number; y: number }
  | { type: "moveObstacle"; id: string; x: number; y: number }
  | { type: "resizeObstacle"; id: string; radius: number }
  | { type: "removeObstacle"; id: string }
  | { type: "moveFlag"; x: number; y: number }
  | { type: "moveSpawn"; which: "blue" | "target"; x: number; y: number }
  | { type: "setShape"; shape: "rect" | "circle" }
  | { type: "resizeField"; rx: number; ry: number }
  | { type: "moveField"; cx: number; cy: number };

export function layoutReducer(layout: CustomBattleLayout, action: LayoutAction): CustomBattleLayout {
  switch (action.type) {
    case "addObstacle": {
      const { x, y } = clampPointToField(layout.field, action.x, action.y);
      return { ...layout, obstacles: [...layout.obstacles, { id: nextObstacleId(layout.obstacles), x, y, radius: DEFAULT_OBSTACLE_RADIUS_M }] };
    }
    case "moveObstacle": {
      const { x, y } = clampPointToField(layout.field, action.x, action.y);
      return { ...layout, obstacles: layout.obstacles.map((o) => (o.id === action.id ? { ...o, x, y } : o)) };
    }
    case "resizeObstacle":
      return { ...layout, obstacles: layout.obstacles.map((o) => (o.id === action.id ? { ...o, radius: Math.max(MIN_OBSTACLE_RADIUS_M, action.radius) } : o)) };
    case "removeObstacle":
      return { ...layout, obstacles: layout.obstacles.filter((o) => o.id !== action.id) };
    case "moveFlag":
      return { ...layout, flag: clampPointToField(layout.field, action.x, action.y) };
    case "moveSpawn": {
      const pos = clampPointToField(layout.field, action.x, action.y);
      const key = action.which === "blue" ? "blueSpawn" : "targetSpawn";
      return { ...layout, [key]: { ...layout[key], x: pos.x, y: pos.y } };
    }
    case "setShape": {
      if (action.shape === layout.field.shape) {
        return layout;
      }
      const radius = Math.min(layout.field.rx, layout.field.ry);
      const field = { ...layout.field, shape: action.shape, ...(action.shape === "circle" ? { rx: radius, ry: radius } : {}) };
      return clampContentsToField({ ...layout, field });
    }
    case "resizeField": {
      const rx = Math.max(MIN_FIELD_HALF_M, action.rx);
      const ry = Math.max(MIN_FIELD_HALF_M, action.ry);
      const field = { ...layout.field, rx, ry: layout.field.shape === "circle" ? rx : ry };
      return clampContentsToField({ ...layout, field });
    }
    case "moveField":
      return clampContentsToField({ ...layout, field: { ...layout.field, cx: action.cx, cy: action.cy } });
    default:
      return layout;
  }
}

// Keep obstacles, the flag, and both spawns inside the field. Applied after the
// field is reshaped/resized/moved so custom battles never place units or cover
// outside the boundary (the engine would otherwise clamp units in on tick 1,
// making them look like they started outside the wall).
function clampContentsToField(layout: CustomBattleLayout): CustomBattleLayout {
  const { field } = layout;
  const flag = clampPointToField(field, layout.flag.x, layout.flag.y);
  const blue = clampPointToField(field, layout.blueSpawn.x, layout.blueSpawn.y);
  const target = clampPointToField(field, layout.targetSpawn.x, layout.targetSpawn.y);
  return {
    ...layout,
    obstacles: layout.obstacles.map((o) => {
      const { x, y } = clampPointToField(field, o.x, o.y);
      return { ...o, x, y };
    }),
    flag,
    blueSpawn: { ...layout.blueSpawn, x: blue.x, y: blue.y },
    targetSpawn: { ...layout.targetSpawn, x: target.x, y: target.y },
  };
}

// Editable rule parameters. Only the field matching the active rule's mode is
// applied (kill limit for kill_limit_deathmatch, etc.).
export type ResearchRuleParams = {
  killLimit?: number;
  timeLimitTicks?: number;
  captureHoldTicks?: number;
};

export function createResearchBattleConfigJson(options: {
  battlePresetId: string;
  rulePresetId?: string;
  // When battlePresetId is CUSTOM_BATTLE_ID, this custom layout (as a preset) is
  // used instead of a built-in preset. Produced by layoutToBattlePreset.
  customBattle?: ResearchBattlePreset;
  // Per-bot unit preset id, keyed by unit id (1 = Blue, 2 = Red).
  unitPresetIdByUnit: Record<number, string>;
  // Editable rule parameters (kill limit / time limit / capture hold ticks).
  ruleParams?: ResearchRuleParams;
  // Deadline (safety cap) in ticks. When the rule does not resolve on its own by
  // this tick, the engine settles the battle on the current score. Defaults to a
  // large backstop; the research UI passes its tick count here so the run stops
  // as soon as the rule (or this deadline) decides, rather than always running a
  // fixed number of ticks.
  maxTicks?: number;
}): string {
  const battlePreset = options.battlePresetId === CUSTOM_BATTLE_ID && options.customBattle
    ? options.customBattle
    : RESEARCH_BATTLE_PRESETS.find((preset) => preset.id === options.battlePresetId) ?? RESEARCH_BATTLE_PRESETS[0];
  const rulePreset = RESEARCH_RULE_PRESETS.find((preset) => preset.id === options.rulePresetId) ?? RESEARCH_RULE_PRESETS[0];
  const unitPresetForUnit = (unitId: number) =>
    RESEARCH_UNIT_PRESETS.find((preset) => preset.id === options.unitPresetIdByUnit[unitId]) ?? RESEARCH_UNIT_PRESETS[0];
  const bluePreset = unitPresetForUnit(1);
  const redPreset = unitPresetForUnit(2);
  // Normalize with the same clamp the run loop uses so the engine's settle-on-
  // score deadline lands exactly on the loop's last tick (no early unresolved stop).
  const tickLimit = options.maxTicks !== undefined ? normalizeTickCount(options.maxTicks) : MAX_RESEARCH_TICKS;

  return JSON.stringify({
    battleId: `research_${battlePreset.id}_${bluePreset.id}_vs_${redPreset.id}_${rulePreset.id}`,
    seed: 1,
    tickRate: 60,
    tickLimit,
    field: cloneJson(battlePreset.field),
    obstacles: cloneJson(battlePreset.obstacles),
    units: [
      {
        unitId: 1,
        teamId: 1,
        name: "Blue",
        spawn: battlePreset.blueSpawn,
        modules: cloneJson(bluePreset.modules),
      },
      {
        unitId: 2,
        teamId: 2,
        name: "Red",
        spawn: battlePreset.targetSpawn,
        modules: cloneJson(redPreset.modules),
      },
    ],
    controllers: [
      { unitId: 1, type: "json_callback" },
      { unitId: 2, type: "json_callback" },
    ],
    rule: createRuleConfig(rulePreset, battlePreset, options.ruleParams),
  });
}

export function createResearchSetupReplay(battleConfigJson: string): BattleReplay {
  const config = JSON.parse(battleConfigJson) as {
    tickRate?: number;
    obstacles?: unknown[];
    units?: unknown[];
    rule?: unknown;
    field?: unknown;
  };
  const units = Array.isArray(config.units) ? config.units.map(setupUnitFromConfig) : [];
  const frame: BattleFrame = {
    tick: 0,
    field: setupFieldFromConfig(config.field),
    units,
    projectiles: [],
    events: [],
    actions: [],
    ruleState: {
      scores: units.map((unit) => ({
        unitId: unit.unitId,
        teamId: unit.teamId,
        kills: 0,
        deaths: 0,
        damageDealt: 0,
      })),
      captureZones: setupCaptureZonesFromRule(config.rule),
      outcome: {
        finished: false,
        reason: "",
        winnerUnitId: 0,
        winnerTeamId: 0,
      },
    },
  };
  return {
    type: "robolocks.replay.v1",
    tickRate: typeof config.tickRate === "number" ? config.tickRate : 60,
    obstacles: Array.isArray(config.obstacles) ? cloneJson(config.obstacles) as BattleReplay["obstacles"] : [],
    frames: [frame],
  };
}

function setupUnitFromConfig(payload: unknown): UnitFrame {
  const unit = isRecord(payload) ? payload : {};
  const modules = setupModulesFromConfig(unit.modules);
  const spawn = isRecord(unit.spawn) ? unit.spawn : {};
  const x = typeof spawn.x === "number" ? spawn.x : 0;
  const y = typeof spawn.y === "number" ? spawn.y : 0;
  const headingDeg = typeof spawn.headingDeg === "number" ? spawn.headingDeg : 0;
  const unitId = typeof unit.unitId === "number" ? unit.unitId : 0;
  return {
    unitId,
    teamId: typeof unit.teamId === "number" ? unit.teamId : 0,
    name: typeof unit.name === "string" && unit.name !== "" ? unit.name : `Unit ${unitId}`,
    position: { x, y },
    hullHeadingDegrees: headingDeg,
    turretHeadingDegrees: headingDeg,
    sensorHeadingDegrees: headingDeg,
    sensorScanActive: false,
    armorIntegrity: modules.armor.integrity,
    weaponCooldownTicks: 0,
    bodyShape: modules.body.shape ?? { type: "circle", radiusMeters: 1 },
    modules,
    intents: {
      mobility: { active: false, target: { x, y }, remainingMeters: 0, ageTicks: 0 },
      turret: { active: false, target: { x, y }, errorDegrees: 0, ageTicks: 0 },
      hull: { active: false, target: { x, y }, errorDegrees: 0, ageTicks: 0 },
      weapon: { active: false, minHitChance: 0, ageTicks: 0 },
    },
  };
}

function setupModulesFromConfig(payload: unknown): UnitModulesFrame {
  const modules = isRecord(payload) ? payload : {};
  const body = setupBodyModule(modules.body);
  return {
    mobility: {
      id: stringField(modules.mobility, "id"),
      maxSpeedMetersPerSecond: numberField(modules.mobility, "maxSpeedMetersPerSecond"),
      maxHullTurnDegreesPerSecond: numberField(modules.mobility, "maxHullTurnDegreesPerSecond"),
    },
    turret: {
      id: stringField(modules.turret, "id"),
      headingDegrees: numberField(modules.turret, "headingDegrees"),
      maxTurnDegreesPerSecond: numberField(modules.turret, "maxTurnDegreesPerSecond"),
    },
    weapon: {
      id: stringField(modules.weapon, "id"),
      fireMode: stringField(modules.weapon, "fireMode") || "direct",
      damage: numberField(modules.weapon, "damage"),
      penetrationMillimeters: numberField(modules.weapon, "penetrationMillimeters"),
      rangeMeters: numberField(modules.weapon, "rangeMeters"),
      muzzleVelocityMetersPerSecond: numberField(modules.weapon, "muzzleVelocityMetersPerSecond"),
      muzzleOffsetMeters: vec3Field(modules.weapon, "muzzleOffsetMeters"),
      launchAngleDegrees: numberField(modules.weapon, "launchAngleDegrees"),
      gravityMetersPerSecondSquared: numberField(modules.weapon, "gravityMetersPerSecondSquared") || 9.81,
      blastRadiusMeters: numberField(modules.weapon, "blastRadiusMeters"),
      projectileRadiusMeters: numberField(modules.weapon, "projectileRadiusMeters"),
      aimToleranceDegrees: numberField(modules.weapon, "aimToleranceDegrees"),
      reloadTicks: numberField(modules.weapon, "reloadTicks"),
    },
    armor: {
      id: stringField(modules.armor, "id"),
      integrity: numberField(modules.armor, "integrity"),
      frontMillimeters: numberField(modules.armor, "frontMillimeters"),
      sideMillimeters: numberField(modules.armor, "sideMillimeters"),
      rearMillimeters: numberField(modules.armor, "rearMillimeters"),
    },
    body,
    sensor: {
      id: stringField(modules.sensor, "id"),
      rangeMeters: numberField(modules.sensor, "rangeMeters"),
      fovDegrees: numberField(modules.sensor, "fovDegrees"),
      refreshTicks: numberField(modules.sensor, "refreshTicks"),
    },
  };
}

function setupBodyModule(payload: unknown): UnitModulesFrame["body"] {
  return {
    id: stringField(payload, "id"),
    massKilograms: numberField(payload, "massKilograms"),
    shape: bodyShapeField(payload, "shape"),
  };
}

function setupFieldFromConfig(payload: unknown): FieldBoundsFrame {
  const fallback: FieldBoundsFrame = { min: { x: 0, y: 0 }, max: { x: 40, y: 24 } };
  if (!isRecord(payload)) {
    return fallback;
  }
  const min = isRecord(payload.min) ? payload.min : {};
  const max = isRecord(payload.max) ? payload.max : {};
  const bounds: FieldBoundsFrame = {
    min: { x: numberField(min, "x"), y: numberField(min, "y") },
    max: { x: numberField(max, "x"), y: numberField(max, "y") },
  };
  if (bounds.max.x <= bounds.min.x || bounds.max.y <= bounds.min.y) {
    return fallback;
  }
  const shape = setupFieldShapeFromConfig(payload.shape);
  return shape ? { ...bounds, shape } : bounds;
}

function setupFieldShapeFromConfig(payload: unknown): FieldBoundsFrame["shape"] | undefined {
  const shape = isRecord(payload) ? payload : {};
  if (shape.type === "rect") {
    return { type: "rect" };
  }
  if (shape.type === "circle" && typeof shape.radiusMeters === "number" && shape.radiusMeters > 0) {
    const center = isRecord(shape.center) ? shape.center : {};
    return {
      type: "circle",
      center: {
        x: typeof center.x === "number" ? center.x : 0,
        y: typeof center.y === "number" ? center.y : 0,
      },
      radiusMeters: shape.radiusMeters,
    };
  }
  if (shape.type === "polygon" && Array.isArray(shape.vertices) && shape.vertices.length >= 3) {
    return {
      type: "polygon",
      vertices: shape.vertices.map((payload) => {
        const vertex = isRecord(payload) ? payload : {};
        return {
          x: typeof vertex.x === "number" ? vertex.x : 0,
          y: typeof vertex.y === "number" ? vertex.y : 0,
        };
      }),
    };
  }
  return undefined;
}

function fieldShapeFromBattleConfigJson(battleConfigJson: string): FieldBoundsFrame["shape"] | undefined {
  try {
    const config = JSON.parse(battleConfigJson) as { field?: unknown };
    return isRecord(config.field) ? setupFieldShapeFromConfig(config.field.shape) : undefined;
  } catch {
    return undefined;
  }
}

function applyConfiguredFieldShape(
  frames: BattleFrame[],
  shape: FieldBoundsFrame["shape"] | undefined,
): BattleFrame[] {
  if (!shape) {
    return frames;
  }
  return frames.map((frame) => ({
    ...frame,
    field: {
      ...(frame.field ?? { min: { x: 0, y: 0 }, max: { x: 40, y: 24 } }),
      shape: cloneJson(shape),
    },
  }));
}

function setupCaptureZonesFromRule(payload: unknown): BattleFrame["ruleState"]["captureZones"] {
  const rule = isRecord(payload) ? payload : {};
  const captureZones = Array.isArray(rule.captureZones) ? rule.captureZones : [];
  return captureZones.map((zonePayload) => {
    const zone = isRecord(zonePayload) ? zonePayload : {};
    const position = isRecord(zone.position) ? zone.position : {};
    return {
      id: typeof zone.id === "string" ? zone.id : "",
      position: {
        x: typeof position.x === "number" ? position.x : 0,
        y: typeof position.y === "number" ? position.y : 0,
      },
      radiusMeters: numberField(zone, "radiusMeters"),
      holdTicksRequired: numberField(zone, "holdTicks"),
      heldTicks: 0,
      ownerUnitId: 0,
      ownerTeamId: 0,
      contested: false,
    };
  });
}

function createRuleConfig(
  rulePreset: ResearchRulePreset,
  battlePreset: ResearchBattlePreset,
  ruleParams?: ResearchRuleParams,
): ResearchRuleConfig {
  const rule = cloneJson(rulePreset.rule);

  // Apply editable rule parameters for the active mode only.
  if (ruleParams) {
    if (rule.mode === "kill_limit_deathmatch" && typeof ruleParams.killLimit === "number" && ruleParams.killLimit > 0) {
      rule.killLimit = Math.floor(ruleParams.killLimit);
    }
    if (rule.mode === "timed_deathmatch" && typeof ruleParams.timeLimitTicks === "number" && ruleParams.timeLimitTicks > 0) {
      rule.timeLimitTicks = Math.floor(ruleParams.timeLimitTicks);
    }
  }

  const holdTicksOverride = rule.mode === "capture_point" && typeof ruleParams?.captureHoldTicks === "number" && ruleParams.captureHoldTicks > 0
    ? Math.floor(ruleParams.captureHoldTicks)
    : undefined;
  if (Array.isArray(rule.captureZones)) {
    rule.captureZones = rule.captureZones.map((zone) => ({
      ...(isRecord(zone) ? zone : {}),
      position: { x: battlePreset.flagPosition.x, y: battlePreset.flagPosition.y },
      ...(holdTicksOverride !== undefined ? { holdTicks: holdTicksOverride } : {}),
    }));
  }
  const respawn = rule.respawn;
  if (isRecord(respawn) && respawn.enabled === true) {
    respawn.spawnPoints = [
      {
        id: "blue_research_spawn",
        teamId: 1,
        position: { x: battlePreset.blueRespawnZone.position.x, y: battlePreset.blueRespawnZone.position.y },
        radiusMeters: battlePreset.blueRespawnZone.radiusMeters,
        headingDegrees: battlePreset.blueRespawnZone.headingDeg,
      },
      {
        id: "target_research_spawn",
        teamId: 2,
        position: { x: battlePreset.targetRespawnZone.position.x, y: battlePreset.targetRespawnZone.position.y },
        radiusMeters: battlePreset.targetRespawnZone.radiusMeters,
        headingDegrees: battlePreset.targetRespawnZone.headingDeg,
      },
    ];
  }
  return rule;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function botSourcesByUnitFromConfig(
  battleConfigJson: string,
  fallbackSource: string,
  configuredSources: Record<number, string> | undefined,
): Map<number, string> {
  const config = JSON.parse(battleConfigJson) as { controllers?: unknown };
  const controllers = Array.isArray(config.controllers) ? config.controllers : [];
  const sources = new Map<number, string>();
  for (const payload of controllers) {
    const controller = isRecord(payload) ? payload : {};
    if (typeof controller.unitId !== "number") {
      continue;
    }
    sources.set(controller.unitId, configuredSources?.[controller.unitId] ?? fallbackSource);
  }
  if (sources.size === 0) {
    sources.set(1, configuredSources?.[1] ?? fallbackSource);
  }
  return sources;
}

function stringField(payload: unknown, key: string): string {
  const object = isRecord(payload) ? payload : {};
  return typeof object[key] === "string" ? object[key] : "";
}

function numberField(payload: unknown, key: string): number {
  const object = isRecord(payload) ? payload : {};
  return typeof object[key] === "number" ? object[key] : 0;
}

function vec3Field(payload: unknown, key: string): { x: number; y: number; z: number } {
  const object = isRecord(payload) ? payload : {};
  const value = isRecord(object[key]) ? object[key] : {};
  return {
    x: typeof value.x === "number" ? value.x : 0,
    y: typeof value.y === "number" ? value.y : 0,
    z: typeof value.z === "number" ? value.z : 0,
  };
}

function bodyShapeField(payload: unknown, key: string): BodyShapeFrame {
  const object = isRecord(payload) ? payload : {};
  const shape = isRecord(object[key]) ? object[key] : {};
  if (shape.type === "box") {
    return {
      type: "box",
      radiusMeters: typeof shape.radiusMeters === "number" ? shape.radiusMeters : 0,
      lengthMeters: typeof shape.lengthMeters === "number" ? shape.lengthMeters : 0,
      widthMeters: typeof shape.widthMeters === "number" ? shape.widthMeters : 0,
    };
  }
  return {
    type: "circle",
    radiusMeters: typeof shape.radiusMeters === "number" ? shape.radiusMeters : 1,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Upper bound on a research run's tick deadline. This is the safety cap the
// battle settles on score at when the rule does not resolve first; it is not a
// fixed run length (matches stop as soon as the rule decides). Kept in one place
// so the loop bound, the engine deadline (config tickLimit), and the UI input
// max all agree — a mismatch makes the run stop before the deadline, unresolved.
export const MAX_RESEARCH_TICKS = 18000; // 18000 ticks = 5 minutes at 60Hz

function normalizeTickCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 360;
  }
  return Math.max(1, Math.min(MAX_RESEARCH_TICKS, Math.floor(value)));
}

async function createPyodideBotRuntime(
  botSource: string,
  botId: number,
  onProgress: (progress: ResearchProgress) => void = () => {},
): Promise<BrowserBotRuntime> {
  onProgress({ stage: "loading-python" });
  const pyodide = await loadPyodideRuntime();
  onProgress({ stage: "installing-sdk" });
  installPythonSdk(pyodide);
  pyodide.runPython(`
import sys
if "/robolocks_sdk" not in sys.path:
    sys.path.insert(0, "/robolocks_sdk")
class __RobolocksLogStream:
    def __init__(self, stream):
        self.stream = stream
        self.buffer = ""
    def write(self, text):
        self.buffer += str(text)
    def flush(self):
        pass
    def drain(self):
        text = self.buffer
        self.buffer = ""
        return text
__robolocks_stdout = __RobolocksLogStream("stdout")
__robolocks_stderr = __RobolocksLogStream("stderr")
sys.stdout = __robolocks_stdout
sys.stderr = __robolocks_stderr
`);
  pyodide.globals.set("__robolocks_bot_source", botSource);
  pyodide.runPython(`
import builtins
builtins.__robolocks_bot_id = ${botId}
`);
  pyodide.runPython(`
__robolocks_bot_globals = {"__name__": "__robolocks_user_bot__"}
exec(__robolocks_bot_source, __robolocks_bot_globals)
from robolocks.runtime import call_registered_bot as __robolocks_call_registered_bot
`);

  return {
    onTick(observation: unknown): unknown {
      pyodide.globals.set("__robolocks_observation_json", JSON.stringify(observation));
      return JSON.parse(String(pyodide.runPython(`__robolocks_call_registered_bot(${botId}, __robolocks_observation_json)`)));
    },
    drainLogs(): Omit<BotLogEntry, "tick" | "unitId">[] {
      const payload = String(pyodide.runPython(`
import json
json.dumps({
    "stdout": __robolocks_stdout.drain(),
    "stderr": __robolocks_stderr.drain(),
})
`));
      const drained = JSON.parse(payload) as { stdout?: string; stderr?: string };
      return [
        ...splitLogLines(drained.stdout ?? "").map((message) => ({ stream: "stdout" as const, message })),
        ...splitLogLines(drained.stderr ?? "").map((message) => ({ stream: "stderr" as const, message })),
      ];
    },
    destroy(): void {
      pyodide.runPython(`
from robolocks.runtime import clear_registered_bot
clear_registered_bot(${botId})
import sys
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
`);
    },
  };
}

function splitLogLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

type PyodideRuntime = {
  FS: {
    mkdirTree(path: string): void;
    writeFile(path: string, contents: string): void;
  };
  globals: {
    set(name: string, value: unknown): void;
  };
  runPython(code: string): unknown;
};

// Pyodide is vendored via the npm `pyodide` package (pinned to match
// PYODIDE_LOCATION below). The runtime assets (pyodide.asm.js/.wasm,
// python_stdlib.zip, pyodide-lock.json) are copied into /pyodide/ at
// dev/build time by scripts/copy-pyodide.mjs — mirroring how the WASM kernel
// is served from /wasm/. The dynamic import keeps the ~1.2 MB loader out of
// the main bundle: it only resolves inside the worker chunk on first run, so
// there are no CDN requests and the app works fully offline.
const PYODIDE_INDEX_URL = "/pyodide/";
let pyodidePromise: Promise<PyodideRuntime> | null = null;
let sdkInstalled = false;

async function loadPyodideRuntime(): Promise<PyodideRuntime> {
  if (pyodidePromise) {
    return pyodidePromise;
  }

  pyodidePromise = (async () => {
    const { loadPyodide } = await import("pyodide");
    return (await loadPyodide({ indexURL: PYODIDE_INDEX_URL })) as unknown as PyodideRuntime;
  })();

  return pyodidePromise;
}

function installPythonSdk(pyodide: PyodideRuntime): void {
  if (sdkInstalled) {
    return;
  }

  pyodide.FS.mkdirTree("/robolocks_sdk/robolocks");
  for (const [path, contents] of Object.entries(PYTHON_SDK_FILES)) {
    pyodide.FS.writeFile(`/robolocks_sdk/${path}`, contents);
  }
  sdkInstalled = true;
}
