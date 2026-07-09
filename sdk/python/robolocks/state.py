from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from .geometry import Vec2, VecLike, distance


@dataclass(frozen=True)
class IntentState:
    """Active intent state for a control channel.

    Units: remaining (meters), error (degrees), age (simulation ticks)
    """
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

    def should_reissue(self, target: VecLike, threshold_m: float = 5.0, min_age_ticks: int = 20) -> bool:
        if not self.active:
            return True
        return self.age >= min_age_ticks and distance(self.target, target) > threshold_m


@dataclass(frozen=True)
class WeaponIntentState:
    """Weapon intent state.

    Units: age (simulation ticks)
    """
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
    """Observed unit state.

    Units: position (meters), hull_heading/turret_heading (degrees),
           weapon_cooldown (simulation ticks)
    """
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
    def alive(self) -> bool:
        """True while the unit still has armor. Destroyed units linger in the
        world as wrecks and keep showing up as contacts, so target selection
        should gate on this."""
        return self.armor_integrity > 0.0

    @property
    def can_fire(self) -> bool:
        return self.weapon_cooldown == 0 and not self.intent.weapon.active

    def distance_to(self, other: "UnitState | VecLike") -> float:
        if isinstance(other, UnitState):
            return distance(self.position, other.position)
        return distance(self.position, other)


@dataclass(frozen=True)
class ContactSet:
    """Contact list sorted by distance from self (closest first)."""
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

    def closest_enemy(self, include_wrecks: bool = False) -> UnitState | None:
        """Closest enemy contact (units are sorted nearest-first). Destroyed
        enemies linger as wrecks and stay in contact; they are skipped by
        default so a fire loop does not lock onto a corpse. Pass
        include_wrecks=True to get the nearest enemy regardless of armor."""
        for unit in self.units:
            if unit.is_enemy and (include_wrecks or unit.alive):
                return unit
        return None


@dataclass(frozen=True)
class Obstacle:
    """Static obstacle.

    Units: position (meters), radius (meters)
    """
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
    """Observed projectile contact.

    Units: position/previous_position (meters), radius/height (meters)
    """
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
    """Full per-tick observation delivered to bot.

    Units: see UnitState, ContactSet, BattleMap.
    """
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
