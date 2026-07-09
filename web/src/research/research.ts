import type { BattleReplay } from "../replay/replay";
import { createResearchDuelWithJsonBotFromWasmFactory, type JsonBotTick, type KernelBattleRunner } from "../sim/kernelAdapter.ts";

export const DEFAULT_RESEARCH_BOT_SOURCE = `from robolocks import (
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

export type ResearchRunOptions = {
  botSource: string;
  battleConfigJson?: string;
  tickCount: number;
  createBotRuntime?: BrowserBotRuntimeFactory;
  createRunner?: ResearchRunnerFactory;
};

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

export type BrowserBotRuntimeFactory = (botSource: string) => Promise<BrowserBotRuntime>;

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
  const botRuntime = await (options.createBotRuntime ?? createPyodideBotRuntime)(options.botSource);
  const createRunner = options.createRunner ?? ((runnerOptions) => createResearchDuelWithJsonBotFromWasmFactory(runnerOptions));
  const runner = await createRunner({
    botId: 1,
    battleConfigJson,
    onTick: botRuntime.onTick,
  });

  try {
    const frames = [runner.snapshot()];
    const logs: BotLogEntry[] = [];
    for (let i = 0; i < tickCount; i += 1) {
      const frame = runner.step();
      frames.push(frame);
      for (const log of botRuntime.drainLogs?.() ?? []) {
        logs.push({ ...log, tick: frame.tick, unitId: 1 });
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
    botRuntime.destroy?.();
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
        weapon: { id: "slow_cannon_test", damage: 25.0, penetrationMillimeters: 80.0, rangeMeters: 80.0, muzzleVelocityMetersPerSecond: 20.0, muzzleOffsetMeters: { x: 3.6, y: 0.0, z: 1.65 }, projectileRadiusMeters: 0.08, reloadTicks: 90 },
        armor: { id: "rolled_armor_mk1", integrity: 100.0, frontMillimeters: 100.0, sideMillimeters: 70.0, rearMillimeters: 45.0 },
        body: { id: "medium_hull_mk1", massKilograms: 30000.0, shape: { type: "box", radiusMeters: 1.2, lengthMeters: 5.6, widthMeters: 2.8 } },
        sensor: { id: "visual_optic_mk1", rangeMeters: 60.0, fovDegrees: 120.0, refreshTicks: 1 },
      },
    },
    {
      unitId: 2,
      teamId: 2,
      name: "Target",
      spawn: { x: 34, y: 18, headingDeg: 215 },
      modules: {
        mobility: { id: "fixed_target_chassis", maxSpeedMetersPerSecond: 0.0, maxHullTurnDegreesPerSecond: 60.0 },
        turret: { id: "light_turret_mk1", maxTurnDegreesPerSecond: 180.0 },
        weapon: { id: "slow_cannon_test", damage: 25.0, penetrationMillimeters: 80.0, rangeMeters: 80.0, muzzleVelocityMetersPerSecond: 20.0, muzzleOffsetMeters: { x: 3.6, y: 0.0, z: 1.65 }, projectileRadiusMeters: 0.08, reloadTicks: 90 },
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
  weapon: { id: "slow_cannon_test", damage: 25.0, penetrationMillimeters: 80.0, rangeMeters: 80.0, muzzleVelocityMetersPerSecond: 20.0, muzzleOffsetMeters: { x: 3.6, y: 0.0, z: 1.65 }, projectileRadiusMeters: 0.08, reloadTicks: 90 },
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

export function createResearchBattleConfigJson(options: {
  battlePresetId: string;
  unitPresetId: string;
}): string {
  const battlePreset = RESEARCH_BATTLE_PRESETS.find((preset) => preset.id === options.battlePresetId) ?? RESEARCH_BATTLE_PRESETS[0];
  const unitPreset = RESEARCH_UNIT_PRESETS.find((preset) => preset.id === options.unitPresetId) ?? RESEARCH_UNIT_PRESETS[0];

  return JSON.stringify({
    battleId: `research_${battlePreset.id}_${unitPreset.id}`,
    seed: 1,
    tickRate: 30,
    tickLimit: 9000,
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
        name: "Target",
        spawn: battlePreset.targetSpawn,
        modules: cloneJson(FIXED_TARGET_MODULES),
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
        ],
      },
    },
  });
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeTickCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 180;
  }
  return Math.max(1, Math.min(900, Math.floor(value)));
}

async function createPyodideBotRuntime(botSource: string): Promise<BrowserBotRuntime> {
  const pyodide = await loadPyodideRuntime();
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
__robolocks_bot_globals = {"__name__": "__robolocks_user_bot__"}
exec(__robolocks_bot_source, __robolocks_bot_globals)
from robolocks.runtime import call_registered_bot as __robolocks_call_registered_bot
`);

  return {
    onTick(observation: unknown): unknown {
      pyodide.globals.set("__robolocks_observation_json", JSON.stringify(observation));
      return JSON.parse(String(pyodide.runPython("__robolocks_call_registered_bot(__robolocks_observation_json)")));
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
clear_registered_bot()
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

type LoadPyodide = (options: { indexURL: string }) => Promise<PyodideRuntime>;

declare global {
  interface Window {
    loadPyodide?: LoadPyodide;
  }
}

const PYODIDE_VERSION = "0.26.4";
let pyodidePromise: Promise<PyodideRuntime> | null = null;
let sdkInstalled = false;

async function loadPyodideRuntime(): Promise<PyodideRuntime> {
  if (pyodidePromise) {
    return pyodidePromise;
  }

  pyodidePromise = (async () => {
    const indexURL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
    if (!window.loadPyodide) {
      await loadScript(`${indexURL}pyodide.js`);
    }
    if (!window.loadPyodide) {
      throw new Error("Pyodide loader did not initialize");
    }
    return window.loadPyodide({ indexURL });
  })();

  return pyodidePromise;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.append(script);
  });
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

const PYTHON_SDK_FILES: Record<string, string> = {
  "robolocks/__init__.py": `from .geometry import Vec2, distance
from .orders import AimAt, FaceArmorToward, FireIfSolution, MoveTo, Order, OrderLike, OrderList, ScanArc
from .runtime import LifecycleHook, OnTick, run_bot
from .spec import ArmorSpec, BodyShapeSpec, BodySpec, MobilitySpec, SensorSpec, TurretSpec, UnitModulesSpec, UnitSpec, Vec3, WeaponSpec
from .state import BattleMap, BattleState, ContactSet, IntentState, Obstacle, ProjectileContact, UnitState, WeaponIntentState

__all__ = [
    "AimAt", "BattleMap", "BattleState", "ContactSet", "FaceArmorToward",
    "FireIfSolution", "IntentState", "LifecycleHook", "MoveTo", "OnTick",
    "Order", "OrderLike", "OrderList", "Obstacle", "ProjectileContact", "ScanArc", "ArmorSpec", "BodyShapeSpec", "BodySpec",
    "MobilitySpec", "SensorSpec", "TurretSpec", "UnitModulesSpec", "UnitSpec",
    "UnitState", "Vec2", "Vec3", "WeaponSpec", "WeaponIntentState", "distance", "run_bot",
]
`,
  "robolocks/geometry.py": `from __future__ import annotations

from dataclasses import dataclass
from math import hypot
from typing import Mapping, Protocol, Union


class VecProtocol(Protocol):
    x: float
    y: float


VecLike = Union["Vec2", VecProtocol, Mapping[str, float]]


@dataclass(frozen=True)
class Vec2:
    x: float
    y: float

    @classmethod
    def from_json(cls, data: Mapping[str, float]) -> "Vec2":
        return cls(float(data["x"]), float(data["y"]))

    def to_json(self) -> dict:
        return {"x": self.x, "y": self.y}


def vec2_from(value: VecLike) -> Vec2:
    if isinstance(value, Vec2):
        return value
    if isinstance(value, Mapping):
        return Vec2(float(value["x"]), float(value["y"]))
    return Vec2(float(value.x), float(value.y))


def distance(a: VecLike, b: VecLike) -> float:
    av = vec2_from(a)
    bv = vec2_from(b)
    return hypot(av.x - bv.x, av.y - bv.y)
`,
  "robolocks/orders.py": `from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, Union

from .geometry import VecLike, vec2_from


class Order(Protocol):
    def to_json(self) -> dict:
        ...


@dataclass(frozen=True)
class MoveTo:
    position: VecLike

    def to_json(self) -> dict:
        return {"type": "moveTo", "position": vec2_from(self.position).to_json()}


@dataclass(frozen=True)
class AimAt:
    target: VecLike

    def to_json(self) -> dict:
        return {"type": "aimAt", "target": vec2_from(self.target).to_json()}


@dataclass(frozen=True)
class FaceArmorToward:
    target: VecLike

    def to_json(self) -> dict:
        return {"type": "faceArmorToward", "target": vec2_from(self.target).to_json()}


@dataclass(frozen=True)
class FireIfSolution:
    min_hit_chance: float

    def to_json(self) -> dict:
        return {"type": "fireIfSolution", "minHitChance": float(self.min_hit_chance)}


@dataclass(frozen=True)
class ScanArc:
    direction: float
    width: float
    range: float = 0.0

    def to_json(self) -> dict:
        result = {"type": "scanArc", "directionDegrees": float(self.direction), "widthDegrees": float(self.width)}
        if self.range > 0.0:
            result["rangeMeters"] = float(self.range)
        return result


OrderLike = Union[MoveTo, AimAt, FaceArmorToward, FireIfSolution, ScanArc, dict]
OrderList = list[OrderLike]
`,
  "robolocks/spec.py": `from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from .geometry import Vec2


@dataclass(frozen=True)
class Vec3:
    x: float
    y: float
    z: float

    @classmethod
    def from_json(cls, data: Mapping[str, Any] | None) -> "Vec3":
        data = data or {}
        return cls(
            x=float(data.get("x", 0.0)),
            y=float(data.get("y", 0.0)),
            z=float(data.get("z", 0.0)),
        )


@dataclass(frozen=True)
class MobilitySpec:
    id: str
    max_speed: float
    max_hull_turn: float

    @classmethod
    def from_json(cls, data: Mapping[str, Any] | None) -> "MobilitySpec":
        data = data or {}
        return cls(
            id=str(data.get("id", "")),
            max_speed=float(data.get("maxSpeedMetersPerSecond", 0.0)),
            max_hull_turn=float(data.get("maxHullTurnDegreesPerSecond", 0.0)),
        )


@dataclass(frozen=True)
class TurretSpec:
    id: str
    heading: float
    max_turn: float

    @classmethod
    def from_json(cls, data: Mapping[str, Any] | None) -> "TurretSpec":
        data = data or {}
        return cls(
            id=str(data.get("id", "")),
            heading=float(data.get("headingDegrees", 0.0)),
            max_turn=float(data.get("maxTurnDegreesPerSecond", 0.0)),
        )


@dataclass(frozen=True)
class WeaponSpec:
    id: str
    fire_mode: str
    damage: float
    penetration: float
    range: float
    muzzle_velocity: float
    muzzle_offset: Vec3
    launch_angle: float
    gravity: float
    blast_radius: float
    projectile_radius: float
    aim_tolerance: float
    reload_ticks: int

    @classmethod
    def from_json(cls, data: Mapping[str, Any] | None) -> "WeaponSpec":
        data = data or {}
        return cls(
            id=str(data.get("id", "")),
            fire_mode=str(data.get("fireMode", "direct")),
            damage=float(data.get("damage", 0.0)),
            penetration=float(data.get("penetrationMillimeters", 0.0)),
            range=float(data.get("rangeMeters", 0.0)),
            muzzle_velocity=float(data.get("muzzleVelocityMetersPerSecond", 0.0)),
            muzzle_offset=Vec3.from_json(data.get("muzzleOffsetMeters")),
            launch_angle=float(data.get("launchAngleDegrees", 0.0)),
            gravity=float(data.get("gravityMetersPerSecondSquared", 0.0)),
            blast_radius=float(data.get("blastRadiusMeters", 0.0)),
            projectile_radius=float(data.get("projectileRadiusMeters", 0.0)),
            aim_tolerance=float(data.get("aimToleranceDegrees", 0.0)),
            reload_ticks=int(data.get("reloadTicks", 0)),
        )


@dataclass(frozen=True)
class ArmorSpec:
    id: str
    integrity: float
    front: float
    side: float
    rear: float

    @classmethod
    def from_json(cls, data: Mapping[str, Any] | None) -> "ArmorSpec":
        data = data or {}
        return cls(
            id=str(data.get("id", "")),
            integrity=float(data.get("integrity", 0.0)),
            front=float(data.get("frontMillimeters", 0.0)),
            side=float(data.get("sideMillimeters", 0.0)),
            rear=float(data.get("rearMillimeters", 0.0)),
        )


@dataclass(frozen=True)
class BodyShapeSpec:
    type: str
    radius: float
    length: float
    width: float

    @classmethod
    def from_json(cls, data: Mapping[str, Any] | None) -> "BodyShapeSpec":
        data = data or {}
        return cls(
            type=str(data.get("type", "circle")),
            radius=float(data.get("radiusMeters", 0.0)),
            length=float(data.get("lengthMeters", 0.0)),
            width=float(data.get("widthMeters", 0.0)),
        )


@dataclass(frozen=True)
class BodySpec:
    id: str
    mass: float
    shape: BodyShapeSpec

    @classmethod
    def from_json(cls, data: Mapping[str, Any] | None) -> "BodySpec":
        data = data or {}
        return cls(
            id=str(data.get("id", "")),
            mass=float(data.get("massKilograms", 0.0)),
            shape=BodyShapeSpec.from_json(data.get("shape")),
        )


@dataclass(frozen=True)
class SensorSpec:
    id: str
    range: float
    fov: float
    refresh_ticks: int

    @classmethod
    def from_json(cls, data: Mapping[str, Any] | None) -> "SensorSpec":
        data = data or {}
        return cls(
            id=str(data.get("id", "")),
            range=float(data.get("rangeMeters", 0.0)),
            fov=float(data.get("fovDegrees", 0.0)),
            refresh_ticks=int(data.get("refreshTicks", 0)),
        )


@dataclass(frozen=True)
class UnitModulesSpec:
    mobility: MobilitySpec
    turret: TurretSpec
    weapon: WeaponSpec
    armor: ArmorSpec
    body: BodySpec
    sensor: SensorSpec

    @classmethod
    def from_json(cls, data: Mapping[str, Any] | None) -> "UnitModulesSpec":
        data = data or {}
        return cls(
            mobility=MobilitySpec.from_json(data.get("mobility")),
            turret=TurretSpec.from_json(data.get("turret")),
            weapon=WeaponSpec.from_json(data.get("weapon")),
            armor=ArmorSpec.from_json(data.get("armor")),
            body=BodySpec.from_json(data.get("body")),
            sensor=SensorSpec.from_json(data.get("sensor")),
        )


@dataclass(frozen=True)
class UnitSpec:
    unit_id: int
    team_id: int
    name: str
    position: Vec2
    hull_heading: float
    modules: UnitModulesSpec

    @classmethod
    def from_json(cls, data: Mapping[str, Any]) -> "UnitSpec":
        transform = data.get("transform", {})
        return cls(
            unit_id=int(data.get("unitId", 0)),
            team_id=int(data.get("teamId", 0)),
            name=str(data.get("name", "")),
            position=Vec2.from_json(transform.get("position", {"x": 0.0, "y": 0.0})),
            hull_heading=float(transform.get("hullHeadingDegrees", 0.0)),
            modules=UnitModulesSpec.from_json(data.get("modules")),
        )
`,
  "robolocks/state.py": `from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from .geometry import Vec2, VecLike, distance


@dataclass(frozen=True)
class IntentState:
    active: bool
    target: Vec2
    remaining: float
    error: float
    age: int

    @classmethod
    def from_json(cls, data: Mapping[str, Any] | None) -> "IntentState":
        data = data or {}
        return cls(
            active=bool(data.get("active", False)),
            target=Vec2.from_json(data.get("target", {"x": 0.0, "y": 0.0})),
            remaining=float(data.get("remainingMeters", 0.0)),
            error=float(data.get("errorDegrees", 0.0)),
            age=int(data.get("ageTicks", 0)),
        )

    def should_reissue(self, target: VecLike, threshold_m: float = 5.0, min_age: int = 20) -> bool:
        if not self.active:
            return True
        return self.age >= min_age and distance(self.target, target) > threshold_m


@dataclass(frozen=True)
class WeaponIntentState:
    active: bool
    min_hit_chance: float
    age: int

    @classmethod
    def from_json(cls, data: Mapping[str, Any] | None) -> "WeaponIntentState":
        data = data or {}
        return cls(
            active=bool(data.get("active", False)),
            min_hit_chance=float(data.get("minHitChance", 0.0)),
            age=int(data.get("ageTicks", 0)),
        )


@dataclass(frozen=True)
class UnitIntents:
    mobility: IntentState
    turret: IntentState
    hull: IntentState
    weapon: WeaponIntentState

    @classmethod
    def from_json(cls, data: Mapping[str, Any] | None) -> "UnitIntents":
        data = data or {}
        return cls(
            mobility=IntentState.from_json(data.get("mobility")),
            turret=IntentState.from_json(data.get("turret")),
            hull=IntentState.from_json(data.get("hull")),
            weapon=WeaponIntentState.from_json(data.get("weapon")),
        )


@dataclass(frozen=True)
class UnitState:
    unit_id: int
    team_id: int
    is_enemy: bool
    name: str
    position: Vec2
    hull_heading: float
    turret_heading: float
    armor_integrity: float
    weapon_cooldown: int
    intent: UnitIntents

    @classmethod
    def from_json(cls, data: Mapping[str, Any]) -> "UnitState":
        return cls(
            unit_id=int(data["unitId"]),
            team_id=int(data.get("teamId", 0)),
            is_enemy=bool(data.get("isEnemy", False)),
            name=str(data.get("name", "")),
            position=Vec2.from_json(data["position"]),
            hull_heading=float(data["hullHeadingDegrees"]),
            turret_heading=float(data["turretHeadingDegrees"]),
            armor_integrity=float(data["armorIntegrity"]),
            weapon_cooldown=int(data.get("weaponCooldownTicks", 0)),
            intent=UnitIntents.from_json(data.get("intents")),
        )

    @property
    def can_fire(self) -> bool:
        return self.weapon_cooldown == 0 and not self.intent.weapon.active

    def distance_to(self, other: "UnitState | VecLike") -> float:
        if isinstance(other, UnitState):
            return distance(self.position, other.position)
        return distance(self.position, other)


@dataclass(frozen=True)
class ContactSet:
    units: tuple[UnitState, ...]
    obstacles: tuple[Obstacle, ...]
    projectiles: tuple[ProjectileContact, ...]

    @classmethod
    def from_json(cls, data: Mapping[str, Any] | None) -> "ContactSet":
        data = data or {}
        return cls(
            units=tuple(UnitState.from_json(item) for item in data.get("units", [])),
            obstacles=tuple(Obstacle.from_json(item) for item in data.get("obstacles", [])),
            projectiles=tuple(ProjectileContact.from_json(item) for item in data.get("projectiles", [])),
        )

    def __iter__(self):
        return iter(self.units)

    def __len__(self) -> int:
        return len(self.units)

    def closest_enemy(self) -> UnitState | None:
        for unit in self.units:
            if unit.is_enemy:
                return unit
        return None


@dataclass(frozen=True)
class Obstacle:
    id: str
    position: Vec2
    radius: float
    blocks_movement: bool
    blocks_line_of_sight: bool

    @classmethod
    def from_json(cls, data: Mapping[str, Any]) -> "Obstacle":
        return cls(
            id=str(data.get("id", "")),
            position=Vec2.from_json(data["position"]),
            radius=float(data.get("radiusMeters", 1.0)),
            blocks_movement=bool(data.get("blocksMovement", True)),
            blocks_line_of_sight=bool(data.get("blocksLineOfSight", True)),
        )


@dataclass(frozen=True)
class ProjectileContact:
    projectile_id: int
    owner_unit_id: int
    previous_position: Vec2
    position: Vec2
    radius: float
    previous_height: float
    height: float

    @classmethod
    def from_json(cls, data: Mapping[str, Any]) -> "ProjectileContact":
        return cls(
            projectile_id=int(data["projectileId"]),
            owner_unit_id=int(data["ownerUnitId"]),
            previous_position=Vec2.from_json(data["previousPosition"]),
            position=Vec2.from_json(data["position"]),
            radius=float(data.get("radiusMeters", 0.0)),
            previous_height=float(data.get("previousHeightMeters", 0.0)),
            height=float(data.get("heightMeters", 0.0)),
        )


@dataclass(frozen=True)
class BattleMap:
    obstacles: tuple[Obstacle, ...]

    @classmethod
    def from_json(cls, data: Mapping[str, Any] | None) -> "BattleMap":
        data = data or {}
        return cls(tuple(Obstacle.from_json(item) for item in data.get("obstacles", [])))

    @property
    def center(self) -> Vec2:
        return Vec2(20.0, 12.0)


@dataclass(frozen=True)
class BattleState:
    tick: int
    self_id: int
    own_unit: UnitState
    contacts: ContactSet
    map: BattleMap

    @classmethod
    def from_json(cls, data: Mapping[str, Any]) -> "BattleState":
        return cls(
            tick=int(data["tick"]),
            self_id=int(data["selfId"]),
            own_unit=UnitState.from_json(data["self"]),
            contacts=ContactSet.from_json(data.get("contacts")),
            map=BattleMap.from_json(data.get("map")),
        )

    @property
    def self(self) -> UnitState:
        return self.own_unit
`,
  "robolocks/runtime.py": `from __future__ import annotations

import json
from collections.abc import Callable, Iterable
from typing import Any

from .orders import OrderLike
from .spec import UnitSpec
from .state import BattleState

OnTick = Callable[[BattleState], Iterable[OrderLike]]
LifecycleHook = Callable[[Any], None]

_registered_on_tick: OnTick | None = None
_registered_on_start: LifecycleHook | None = None
_registered_on_end: LifecycleHook | None = None
_started = False


def run_bot(on_tick: OnTick, on_start: LifecycleHook | None = None, on_end: LifecycleHook | None = None) -> None:
    global _registered_on_tick, _registered_on_start, _registered_on_end, _started
    _registered_on_tick = on_tick
    _registered_on_start = on_start
    _registered_on_end = on_end
    _started = False


def clear_registered_bot() -> None:
    global _registered_on_tick, _registered_on_start, _registered_on_end, _started
    if _registered_on_end is not None:
        _registered_on_end(None)
    _registered_on_tick = None
    _registered_on_start = None
    _registered_on_end = None
    _started = False


def call_registered_bot(observation_json: str) -> str:
    global _started
    if _registered_on_tick is None:
        raise RuntimeError("bot did not call run_bot")
    payload = json.loads(observation_json)
    if payload.get("type") == "start":
        if _registered_on_start is not None:
            _registered_on_start(UnitSpec.from_json(payload["spec"]))
        _started = True
        return json.dumps({"orders": []})
    if _registered_on_start is not None and not _started:
        _registered_on_start(None)
        _started = True
    state = BattleState.from_json(payload)
    orders = list(_registered_on_tick(state))
    return json.dumps({"orders": [_order_to_json(order) for order in orders]})


def _order_to_json(order: OrderLike) -> dict:
    if hasattr(order, "to_json"):
        return order.to_json()
    return dict(order)
`,
};
