from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, Union

from .geometry import VecLike, vec2_from


class Order(Protocol):
    def to_json(self) -> dict:
        ...


@dataclass(frozen=True)
class MoveTo:
    """Move unit to a target position. Position in meters."""
    position: VecLike

    def to_json(self) -> dict:
        return {"type": "moveTo", "position": vec2_from(self.position).to_json()}


@dataclass(frozen=True)
class AimAt:
    """Aim turret at a target position."""
    target: VecLike

    def to_json(self) -> dict:
        return {"type": "aimAt", "target": vec2_from(self.target).to_json()}


@dataclass(frozen=True)
class FaceArmorToward:
    """Turn hull to face armor toward a target position."""
    target: VecLike

    def to_json(self) -> dict:
        return {"type": "faceArmorToward", "target": vec2_from(self.target).to_json()}


@dataclass(frozen=True)
class FireIfSolution:
    """Request weapon fire if a firing solution with the given minimum hit chance exists."""
    min_hit_chance: float

    def to_json(self) -> dict:
        return {"type": "fireIfSolution", "minHitChance": float(self.min_hit_chance)}


@dataclass(frozen=True)
class ScanArc:
    """Direct the sensor to scan an arc.

    Units: direction (degrees), width (degrees), range (meters, 0 = sensor max)
    """
    direction: float
    width: float
    range: float = 0.0

    def to_json(self) -> dict:
        result = {
            "type": "scanArc",
            "directionDegrees": float(self.direction),
            "widthDegrees": float(self.width),
        }
        if self.range > 0.0:
            result["rangeMeters"] = float(self.range)
        return result


OrderLike = Union[MoveTo, AimAt, FaceArmorToward, FireIfSolution, ScanArc, dict]
OrderList = list[OrderLike]
