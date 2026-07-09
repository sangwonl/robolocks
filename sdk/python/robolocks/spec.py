from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from .geometry import Vec2


@dataclass(frozen=True)
class Vec3:
    """3D vector. Units: meters."""
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
    """Mobility module specification.

    Units: max_speed (meters/sec), max_hull_turn (degrees/sec)
    """
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
    """Turret module specification.

    Units: heading (degrees), max_turn (degrees/sec)
    """
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
    """Weapon module specification.

    Units: damage (hit points), penetration (millimeters), range (meters),
           muzzle_velocity (meters/sec), muzzle_offset (meters Vec3),
           launch_angle (degrees), gravity (meters/sec²),
           blast_radius (meters), projectile_radius (meters),
           aim_tolerance (degrees), reload_ticks (simulation ticks)
    """
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
    """Armor module specification.

    Units: integrity (hit points), front/side/rear (millimeters)
    """
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
    """Body shape specification.

    Units: radius (meters), length (meters), width (meters)
    """
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
    """Body module specification.

    Units: mass (kilograms)
    """
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
    """Sensor module specification.

    Units: range (meters), fov (degrees), refresh_ticks (simulation ticks)
    """
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
