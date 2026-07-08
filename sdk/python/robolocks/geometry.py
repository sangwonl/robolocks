from __future__ import annotations

from dataclasses import dataclass
from math import hypot
from typing import Mapping, Protocol, Union


class HasXY(Protocol):
    x: float
    y: float


VecLike = Union["Vec2", HasXY, Mapping[str, float]]


@dataclass(frozen=True)
class Vec2:
    x: float
    y: float

    @classmethod
    def from_json(cls, data: Mapping[str, float]) -> "Vec2":
        return cls(x=float(data["x"]), y=float(data["y"]))

    def to_json(self) -> dict:
        return {"x": self.x, "y": self.y}

    def offset(self, x: float = 0.0, y: float = 0.0) -> "Vec2":
        return Vec2(self.x + x, self.y + y)

    def distance_to(self, other: VecLike) -> float:
        return distance(self, other)


def vec2_from(value: VecLike) -> Vec2:
    if isinstance(value, Vec2):
        return value
    if isinstance(value, Mapping):
        return Vec2.from_json(value)
    return Vec2(float(value.x), float(value.y))


def distance(a: VecLike, b: VecLike) -> float:
    av = vec2_from(a)
    bv = vec2_from(b)
    return hypot(av.x - bv.x, av.y - bv.y)
