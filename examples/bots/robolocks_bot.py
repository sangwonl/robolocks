import json
import sys


class Vec2:
    def __init__(self, data):
        self.x = float(data["x"])
        self.y = float(data["y"])

    def to_json(self):
        return {"x": self.x, "y": self.y}


class Unit:
    def __init__(self, data):
        self.unit_id = int(data["unitId"])
        self.position = Vec2(data["position"])
        self.hull_heading = float(data["hullHeadingDeg"])
        self.turret_heading = float(data["turretHeadingDeg"])
        self.armor_integrity = float(data["armorIntegrity"])
        self.weapon_cooldown_ticks = int(data.get("weaponCooldownTicks", 0))
        self.intents = Intents(data.get("intents", {}))


class AxisIntent:
    def __init__(self, data):
        self.active = bool(data.get("active", False))
        self.target = Vec2(data.get("target", {"x": 0.0, "y": 0.0}))
        self.remaining_m = float(data.get("remainingM", 0.0))
        self.error_deg = float(data.get("errorDeg", 0.0))
        self.age_ticks = int(data.get("ageTicks", 0))


class Intents:
    def __init__(self, data):
        self.mobility = AxisIntent(data.get("mobility", {}))
        self.turret = AxisIntent(data.get("turret", {}))
        self.hull = AxisIntent(data.get("hull", {}))
        self.weapon = WeaponIntent(data.get("weapon", {}))


class WeaponIntent:
    def __init__(self, data):
        self.active = bool(data.get("active", False))
        self.min_hit_chance = float(data.get("minHitChance", 0.0))
        self.age_ticks = int(data.get("ageTicks", 0))


class Contacts:
    def __init__(self, contacts):
        self._contacts = [Unit(contact) for contact in contacts]

    def __iter__(self):
        return iter(self._contacts)

    def __len__(self):
        return len(self._contacts)

    def closest_enemy(self):
        if not self._contacts:
            return None
        return self._contacts[0]


class Obstacle:
    def __init__(self, data):
        self.id = str(data.get("id", ""))
        self.position = Vec2(data["position"])
        self.radius_m = float(data.get("radiusM", 1.0))
        self.blocks_movement = bool(data.get("blocksMovement", True))
        self.blocks_line_of_sight = bool(data.get("blocksLineOfSight", True))


class Map:
    def __init__(self, data=None):
        data = data or {}
        self.obstacles = [Obstacle(obstacle) for obstacle in data.get("obstacles", [])]

    def center(self):
        return Vec2({"x": 20.0, "y": 12.0})


class State:
    def __init__(self, observation):
        self.tick = int(observation["tick"])
        self.self_id = int(observation["selfId"])
        self.self = Unit(observation["self"])
        self.contacts = Contacts(observation.get("contacts", []))
        self.map = Map(observation.get("map", {}))


class MoveTo:
    def __init__(self, position):
        self.position = position

    def to_json(self):
        return {"type": "moveTo", "position": _vec_to_json(self.position)}


class AimAt:
    def __init__(self, target):
        self.target = target

    def to_json(self):
        return {"type": "aimAt", "target": _vec_to_json(self.target)}


class FaceArmorToward:
    def __init__(self, target):
        self.target = target

    def to_json(self):
        return {"type": "faceArmorToward", "target": _vec_to_json(self.target)}


class FireIfSolution:
    def __init__(self, min_hit_chance):
        self.min_hit_chance = float(min_hit_chance)

    def to_json(self):
        return {"type": "fireIfSolution", "minHitChance": self.min_hit_chance}


class ScanArc:
    def __init__(self, center, width_deg):
        self.center = center
        self.width_deg = float(width_deg)

    def to_json(self):
        return {
            "type": "scanArc",
            "centerDeg": float(self.center),
            "widthDeg": self.width_deg,
        }


def run_bot(on_tick, on_start=None, on_end=None):
    if on_start is not None:
        on_start(None)
    for line in sys.stdin:
        state = State(json.loads(line))
        commands = on_tick(state)
        print(json.dumps({"commands": [_command_to_json(command) for command in commands]}), flush=True)
    if on_end is not None:
        on_end(None)


def _command_to_json(command):
    if hasattr(command, "to_json"):
        return command.to_json()
    return command


def _vec_to_json(value):
    if hasattr(value, "to_json"):
        return value.to_json()
    return {"x": float(value["x"]), "y": float(value["y"])}
