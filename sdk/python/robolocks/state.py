from __future__ import annotations

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
            remaining_m=float(data.get("remainingMeters", 0.0)),
            error_deg=float(data.get("errorDegrees", 0.0)),
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
            hull_heading_deg=float(data["hullHeadingDegrees"]),
            turret_heading_deg=float(data["turretHeadingDegrees"]),
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
            radius_m=float(data.get("radiusMeters", 1.0)),
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
