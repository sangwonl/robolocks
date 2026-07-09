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

const ADVANCE_FIRE_BOT_SOURCE = `from robolocks import (
    AimAt,
    BattleState,
    FaceArmorToward,
    FireIfSolution,
    MoveTo,
    OrderLike,
    ScanArc,
    run_bot,
)

SENSOR_FOV_DEG = 160.0


def on_start(spec) -> None:
    global SENSOR_FOV_DEG
    if spec is not None:
        SENSOR_FOV_DEG = spec.modules.sensor.fov


def on_tick(state: BattleState) -> list[OrderLike]:
    own = state.own_unit
    enemy = state.contacts.closest_enemy()

    if enemy:
        return [
            FaceArmorToward(enemy.position),
            AimAt(enemy.position),
            FireIfSolution(min_hit_chance=0.6),
            MoveTo({"x": 17.0, "y": 12.0}),
        ]

    return [
        MoveTo(state.map.center),
        ScanArc(direction=own.hull_heading, width=SENSOR_FOV_DEG),
    ]


def on_end(result) -> None:
    pass


run_bot(on_tick, on_start=on_start, on_end=on_end)
`;

const HOLD_LINE_BOT_SOURCE = `from robolocks import (
    AimAt,
    BattleState,
    FaceArmorToward,
    FireIfSolution,
    MoveTo,
    OrderLike,
    ScanArc,
    run_bot,
)

# Hold a central firing line while aiming from cover pressure.
HOLD_POINT = {"x": 17.0, "y": 12.0}


def on_tick(state: BattleState) -> list[OrderLike]:
    enemy = state.contacts.closest_enemy()
    own = state.own_unit

    if enemy:
        return [
            FaceArmorToward(enemy.position),
            AimAt(enemy.position),
            FireIfSolution(min_hit_chance=0.55),
            MoveTo(HOLD_POINT),
        ]

    return [
        MoveTo(HOLD_POINT),
        ScanArc(direction=own.hull_heading, width=140.0),
    ]


run_bot(on_tick)
`;

const KITE_BOT_SOURCE = `from robolocks import (
    AimAt,
    BattleState,
    FaceArmorToward,
    FireIfSolution,
    MoveTo,
    OrderLike,
    ScanArc,
    run_bot,
)


def on_tick(state: BattleState) -> list[OrderLike]:
    own = state.own_unit
    enemy = state.contacts.closest_enemy()

    if not enemy:
        return [
            MoveTo(state.map.center),
            ScanArc(direction=own.hull_heading, width=170.0),
        ]

    retreat_x = 8.0 if enemy.position.x > own.position.x else 32.0
    retreat_y = max(4.0, min(20.0, own.position.y + (own.position.y - enemy.position.y) * 0.6))
    return [
        FaceArmorToward(enemy.position),
        AimAt(enemy.position),
        FireIfSolution(min_hit_chance=0.5),
        MoveTo({"x": retreat_x, "y": retreat_y}),
    ]


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
    id: "advance_fire",
    label: "Advance Fire",
    description: "Advance toward center, scan, face armor, aim, and fire when a target is available.",
    source: ADVANCE_FIRE_BOT_SOURCE,
  },
  {
    id: "hold_line",
    label: "Hold Line",
    description: "Hold a central firing line while keeping frontal armor toward the closest enemy.",
    source: HOLD_LINE_BOT_SOURCE,
  },
  {
    id: "kite",
    label: "Kite",
    description: "Back away from contact while aiming and firing when the solution is good enough.",
    source: KITE_BOT_SOURCE,
  },
  {
    id: "custom",
    label: "Custom",
    description: "Use the current editor contents.",
    source: "",
  },
];

export const DEFAULT_RESEARCH_BOT_SOURCE = ADVANCE_FIRE_BOT_SOURCE;

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
const SIMULATION_PROGRESS_INTERVAL = 10;

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
  obstacles: unknown[];
  blueSpawn: { x: number; y: number; headingDeg: number };
  targetSpawn: { x: number; y: number; headingDeg: number };
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
        tickRate: 30,
        obstacles: runner.staticObstacles(),
        frames,
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
  tickRate: 30,
  tickLimit: 9000,
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
        weapon: { id: "slow_cannon_test", damage: 25.0, penetrationMillimeters: 120.0, rangeMeters: 80.0, muzzleVelocityMetersPerSecond: 20.0, muzzleOffsetMeters: { x: 3.6, y: 0.0, z: 1.65 }, projectileRadiusMeters: 0.08, reloadTicks: 90 },
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
        weapon: { id: "slow_cannon_test", damage: 25.0, penetrationMillimeters: 120.0, rangeMeters: 80.0, muzzleVelocityMetersPerSecond: 20.0, muzzleOffsetMeters: { x: 3.6, y: 0.0, z: 1.65 }, projectileRadiusMeters: 0.08, reloadTicks: 90 },
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
    timeLimitTicks: 9000,
    respawn: {
      enabled: true,
      cooldownTicks: 90,
      invulnerableTicks: 30,
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
  weapon: { id: "slow_cannon_test", damage: 25.0, penetrationMillimeters: 120.0, rangeMeters: 80.0, muzzleVelocityMetersPerSecond: 20.0, muzzleOffsetMeters: { x: 3.6, y: 0.0, z: 1.65 }, projectileRadiusMeters: 0.08, reloadTicks: 90 },
  armor: { id: "rolled_armor_mk1", integrity: 100.0, frontMillimeters: 100.0, sideMillimeters: 70.0, rearMillimeters: 45.0 },
  body: { id: "medium_hull_mk1", massKilograms: 30000.0, shape: { type: "box", radiusMeters: 1.2, lengthMeters: 5.6, widthMeters: 2.8 } },
  sensor: { id: "visual_optic_mk1", rangeMeters: 60.0, fovDegrees: 120.0, refreshTicks: 1 },
};

const FIXED_TARGET_MODULES: ResearchUnitModulesConfig = {
  ...STANDARD_MODULES,
  mobility: { id: "fixed_target_chassis", maxSpeedMetersPerSecond: 0.0, maxHullTurnDegreesPerSecond: 60.0 },
};

export const RESEARCH_BATTLE_PRESETS: ResearchBattlePreset[] = [
  {
    id: "covered_duel",
    label: "Covered Duel",
    description: "One line-of-sight blocker between a mobile unit and a fixed target.",
    obstacles: [
      {
        id: "research_cover",
        position: { x: 20, y: 6 },
        radiusMeters: 1.5,
        blocksMovement: true,
        blocksLineOfSight: true,
      },
    ],
    blueSpawn: { x: 4, y: 5, headingDeg: 35 },
    targetSpawn: { x: 34, y: 18, headingDeg: 215 },
  },
  {
    id: "open_range",
    label: "Open Range",
    description: "No cover, useful for weapon timing and sensor checks.",
    obstacles: [],
    blueSpawn: { x: 5, y: 12, headingDeg: 0 },
    targetSpawn: { x: 34, y: 12, headingDeg: 180 },
  },
  {
    id: "close_cover",
    label: "Close Cover",
    description: "Shorter spawn distance with central cover pressure.",
    obstacles: [
      {
        id: "center_cover",
        position: { x: 19, y: 12 },
        radiusMeters: 2.0,
        blocksMovement: true,
        blocksLineOfSight: true,
      },
    ],
    blueSpawn: { x: 9, y: 9, headingDeg: 20 },
    targetSpawn: { x: 29, y: 16, headingDeg: 210 },
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
      weapon: { ...STANDARD_MODULES.weapon, id: "heavy_cannon_v0", damage: 42.0, penetrationMillimeters: 150.0, muzzleVelocityMetersPerSecond: 28.0, reloadTicks: 120 },
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
      weapon: { id: "howitzer_test", fireMode: "ballistic", damage: 30.0, penetrationMillimeters: 65.0, rangeMeters: 95.0, muzzleVelocityMetersPerSecond: 36.0, muzzleOffsetMeters: { x: 3.3, y: 0.0, z: 1.8 }, launchAngleDegrees: 45.0, gravityMetersPerSecondSquared: 9.81, blastRadiusMeters: 2.5, projectileRadiusMeters: 0.12, aimToleranceDegrees: 8.0, reloadTicks: 105 },
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
      timeLimitTicks: 9000,
      respawn: {
        enabled: true,
        cooldownTicks: 90,
        invulnerableTicks: 30,
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
      timeLimitTicks: 300,
      respawn: {
        enabled: true,
        cooldownTicks: 60,
        invulnerableTicks: 30,
      },
    },
  },
  {
    id: "capture_alpha",
    label: "Capture Alpha",
    description: "Hold the central capture zone for 90 ticks to win.",
    rule: {
      mode: "capture_point",
      teamMode: "team",
      timeLimitTicks: 9000,
      captureZones: [
        {
          id: "alpha",
          position: { x: 20, y: 12 },
          radiusMeters: 3.5,
          holdTicks: 90,
        },
      ],
      respawn: {
        enabled: true,
        cooldownTicks: 90,
        invulnerableTicks: 30,
      },
    },
  },
];

// Play field for research battles. Centered on (20, 12) — the map center the
// bots rally to (see the Python SDK's BattleMap.center) — and sized well beyond
// the spawn footprint (x in [4, 34], y in [5, 18]) so units have room to
// maneuver instead of pinning against the boundary. The engine clamps units to
// this box and the renderer draws the visible boundary from it.
const RESEARCH_FIELD = { min: { x: -12, y: -8 }, max: { x: 52, y: 32 } };

export function createResearchBattleConfigJson(options: {
  battlePresetId: string;
  rulePresetId?: string;
  unitPresetId: string;
  // Deadline (safety cap) in ticks. When the rule does not resolve on its own by
  // this tick, the engine settles the battle on the current score. Defaults to a
  // large backstop; the research UI passes its tick count here so the run stops
  // as soon as the rule (or this deadline) decides, rather than always running a
  // fixed number of ticks.
  maxTicks?: number;
}): string {
  const battlePreset = RESEARCH_BATTLE_PRESETS.find((preset) => preset.id === options.battlePresetId) ?? RESEARCH_BATTLE_PRESETS[0];
  const rulePreset = RESEARCH_RULE_PRESETS.find((preset) => preset.id === options.rulePresetId) ?? RESEARCH_RULE_PRESETS[0];
  const unitPreset = RESEARCH_UNIT_PRESETS.find((preset) => preset.id === options.unitPresetId) ?? RESEARCH_UNIT_PRESETS[0];
  // Normalize with the same clamp the run loop uses so the engine's settle-on-
  // score deadline lands exactly on the loop's last tick (no early unresolved stop).
  const tickLimit = options.maxTicks !== undefined ? normalizeTickCount(options.maxTicks) : MAX_RESEARCH_TICKS;

  return JSON.stringify({
    battleId: `research_${battlePreset.id}_${unitPreset.id}_${rulePreset.id}`,
    seed: 1,
    tickRate: 30,
    tickLimit,
    field: cloneJson(RESEARCH_FIELD),
    obstacles: cloneJson(battlePreset.obstacles),
    units: [
      {
        unitId: 1,
        teamId: 1,
        name: "Blue",
        spawn: battlePreset.blueSpawn,
        modules: cloneJson(unitPreset.modules),
      },
      {
        unitId: 2,
        teamId: 2,
        name: "Red",
        spawn: battlePreset.targetSpawn,
        modules: cloneJson(unitPreset.modules),
      },
    ],
    controllers: [
      { unitId: 1, type: "json_callback" },
      { unitId: 2, type: "json_callback" },
    ],
    rule: createRuleConfig(rulePreset, battlePreset),
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
    tickRate: typeof config.tickRate === "number" ? config.tickRate : 30,
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
  return bounds;
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

function createRuleConfig(rulePreset: ResearchRulePreset, battlePreset: ResearchBattlePreset): ResearchRuleConfig {
  const rule = cloneJson(rulePreset.rule);
  const respawn = rule.respawn;
  if (isRecord(respawn) && respawn.enabled === true) {
    respawn.spawnPoints = [
      {
        id: "blue_research_spawn",
        teamId: 1,
        position: { x: battlePreset.blueSpawn.x, y: battlePreset.blueSpawn.y },
        radiusMeters: 2.5,
        headingDegrees: battlePreset.blueSpawn.headingDeg,
      },
      {
        id: "target_research_spawn",
        teamId: 2,
        position: { x: battlePreset.targetSpawn.x, y: battlePreset.targetSpawn.y },
        radiusMeters: 2.5,
        headingDegrees: battlePreset.targetSpawn.headingDeg,
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
export const MAX_RESEARCH_TICKS = 9000;

function normalizeTickCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 180;
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
