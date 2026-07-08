from __future__ import annotations

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
        return {
            "type": "scanArc",
            "centerDeg": float(self.center),
            "widthDeg": float(self.width_deg),
        }


OrderLike = Union[MoveTo, AimAt, FaceArmorToward, FireIfSolution, ScanArc, dict]
OrderList = list[OrderLike]
