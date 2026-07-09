import type { BattleReplay } from "../replay/replay";
import { createResearchDuelWithJsonBotFromWasmFactory, type JsonBotTick, type KernelBattleRunner } from "../sim/kernelAdapter.ts";
import { PYTHON_SDK_FILES } from "./pythonSdkFiles.generated.ts";

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
