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


def on_start(spec) -> None:
    pass


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
        ScanArc(center=own.hull_heading_deg, width_deg=160),
    ]


def on_end(result) -> None:
    pass


run_bot(on_tick, on_start=on_start, on_end=on_end)
`;

export type ResearchRunOptions = {
  botSource: string;
  tickCount: number;
  createBotRuntime?: BrowserBotRuntimeFactory;
  createRunner?: ResearchRunnerFactory;
};

export type BrowserBotRuntime = {
  onTick: JsonBotTick;
  destroy?(): void;
};

export type BrowserBotRuntimeFactory = (botSource: string) => Promise<BrowserBotRuntime>;

export type ResearchRunnerFactory = (options: {
  botId: number;
  onTick: JsonBotTick;
}) => Promise<KernelBattleRunner>;

export async function runResearchInBrowser(options: ResearchRunOptions): Promise<BattleReplay> {
  const tickCount = normalizeTickCount(options.tickCount);
  const botRuntime = await (options.createBotRuntime ?? createPyodideBotRuntime)(options.botSource);
  const createRunner = options.createRunner ?? ((runnerOptions) => createResearchDuelWithJsonBotFromWasmFactory(runnerOptions));
  const runner = await createRunner({
    botId: 1,
    onTick: botRuntime.onTick,
  });

  try {
    const frames = [runner.snapshot()];
    for (let i = 0; i < tickCount; i += 1) {
      frames.push(runner.step());
    }

    return {
      type: "robolocks.replay.v1",
      tickRate: 30,
      obstacles: runner.staticObstacles(),
      frames,
    };
  } finally {
    runner.destroy();
    botRuntime.destroy?.();
  }
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
    destroy(): void {
      pyodide.runPython(`
from robolocks.runtime import clear_registered_bot
clear_registered_bot()
`);
    },
  };
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
from .state import BattleMap, BattleState, ContactSet, IntentState, UnitState, WeaponIntentState

__all__ = [
    "AimAt", "BattleMap", "BattleState", "ContactSet", "FaceArmorToward",
    "FireIfSolution", "IntentState", "LifecycleHook", "MoveTo", "OnTick",
    "Order", "OrderLike", "OrderList", "ScanArc", "UnitState", "Vec2",
    "WeaponIntentState", "distance", "run_bot",
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
    center: float
    width_deg: float

    def to_json(self) -> dict:
        return {"type": "scanArc", "centerDeg": float(self.center), "widthDeg": float(self.width_deg)}


OrderLike = Union[MoveTo, AimAt, FaceArmorToward, FireIfSolution, ScanArc, dict]
OrderList = list[OrderLike]
`,
  "robolocks/state.py": `from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from .geometry import Vec2, VecLike, distance


@dataclass(frozen=True)
class IntentState:
    active: bool
    target: Vec2
    remaining_m: float
    error_deg: float
    age_ticks: int

    @classmethod
    def from_json(cls, data: Mapping[str, Any] | None) -> "IntentState":
        data = data or {}
        return cls(
            active=bool(data.get("active", False)),
            target=Vec2.from_json(data.get("target", {"x": 0.0, "y": 0.0})),
            remaining_m=float(data.get("remainingM", 0.0)),
            error_deg=float(data.get("errorDeg", 0.0)),
            age_ticks=int(data.get("ageTicks", 0)),
        )

    def should_reissue(self, target: VecLike, threshold_m: float = 5.0, min_age_ticks: int = 20) -> bool:
        if not self.active:
            return True
        return self.age_ticks >= min_age_ticks and distance(self.target, target) > threshold_m


@dataclass(frozen=True)
class WeaponIntentState:
    active: bool
    min_hit_chance: float
    age_ticks: int

    @classmethod
    def from_json(cls, data: Mapping[str, Any] | None) -> "WeaponIntentState":
        data = data or {}
        return cls(
            active=bool(data.get("active", False)),
            min_hit_chance=float(data.get("minHitChance", 0.0)),
            age_ticks=int(data.get("ageTicks", 0)),
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
    name: str
    position: Vec2
    hull_heading_deg: float
    turret_heading_deg: float
    armor_integrity: float
    weapon_cooldown_ticks: int
    intent: UnitIntents

    @classmethod
    def from_json(cls, data: Mapping[str, Any]) -> "UnitState":
        return cls(
            unit_id=int(data["unitId"]),
            name=str(data.get("name", "")),
            position=Vec2.from_json(data["position"]),
            hull_heading_deg=float(data["hullHeadingDeg"]),
            turret_heading_deg=float(data["turretHeadingDeg"]),
            armor_integrity=float(data["armorIntegrity"]),
            weapon_cooldown_ticks=int(data.get("weaponCooldownTicks", 0)),
            intent=UnitIntents.from_json(data.get("intents")),
        )

    @property
    def can_fire(self) -> bool:
        return self.weapon_cooldown_ticks == 0 and not self.intent.weapon.active

    def distance_to(self, other: "UnitState | VecLike") -> float:
        if isinstance(other, UnitState):
            return distance(self.position, other.position)
        return distance(self.position, other)


@dataclass(frozen=True)
class ContactSet:
    units: tuple[UnitState, ...]

    @classmethod
    def from_json(cls, data: list[Mapping[str, Any]] | None) -> "ContactSet":
        return cls(tuple(UnitState.from_json(item) for item in data or []))

    def __iter__(self):
        return iter(self.units)

    def __len__(self) -> int:
        return len(self.units)

    def closest_enemy(self) -> UnitState | None:
        return self.units[0] if self.units else None


@dataclass(frozen=True)
class Obstacle:
    id: str
    position: Vec2
    radius_m: float
    blocks_movement: bool
    blocks_line_of_sight: bool

    @classmethod
    def from_json(cls, data: Mapping[str, Any]) -> "Obstacle":
        return cls(
            id=str(data.get("id", "")),
            position=Vec2.from_json(data["position"]),
            radius_m=float(data.get("radiusM", 1.0)),
            blocks_movement=bool(data.get("blocksMovement", True)),
            blocks_line_of_sight=bool(data.get("blocksLineOfSight", True)),
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
from .state import BattleState

OnTick = Callable[[BattleState], Iterable[OrderLike]]
LifecycleHook = Callable[[Any], None]

_registered_on_tick: OnTick | None = None
_registered_on_end: LifecycleHook | None = None


def run_bot(on_tick: OnTick, on_start: LifecycleHook | None = None, on_end: LifecycleHook | None = None) -> None:
    global _registered_on_tick, _registered_on_end
    _registered_on_tick = on_tick
    _registered_on_end = on_end
    if on_start is not None:
        on_start(None)


def clear_registered_bot() -> None:
    global _registered_on_tick, _registered_on_end
    if _registered_on_end is not None:
        _registered_on_end(None)
    _registered_on_tick = None
    _registered_on_end = None


def call_registered_bot(observation_json: str) -> str:
    if _registered_on_tick is None:
        raise RuntimeError("bot did not call run_bot")
    state = BattleState.from_json(json.loads(observation_json))
    orders = list(_registered_on_tick(state))
    return json.dumps({"orders": [_order_to_json(order) for order in orders]})


def _order_to_json(order: OrderLike) -> dict:
    if hasattr(order, "to_json"):
        return order.to_json()
    return dict(order)
`,
};
