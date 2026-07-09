"""Golden fixture contract test for the Python SDK.

Loads the canonical observation golden that the engine's serializer blessed
(engine/tests/contract_golden_test.cpp) and asserts BattleState.from_json turns
every field the golden carries into a fully-typed value. Each asserted field is
also checked against the dataclass default it would silently fall back to, so a
serializer/parser drift that swallows a field is caught rather than masked.

The golden is the single source of truth: this test reads the same
fixtures/contracts/observation.golden.json that the C++ and TS suites assert
against. Re-bless it by running the C++ test with WRITE_GOLDEN=1.
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from robolocks import BattleState

_GOLDEN_PATH = (
    Path(__file__).resolve().parents[3] / "fixtures" / "contracts" / "observation.golden.json"
)


class ObservationGoldenContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.raw = json.loads(_GOLDEN_PATH.read_text())
        cls.state = BattleState.from_json(cls.raw)

    def test_golden_file_exists_and_is_populated(self) -> None:
        self.assertTrue(_GOLDEN_PATH.exists(), f"missing golden: {_GOLDEN_PATH}")
        self.assertEqual(self.raw["tick"], 42)
        self.assertEqual(len(self.raw["contacts"]["units"]), 1)
        self.assertEqual(len(self.raw["contacts"]["obstacles"]), 1)
        self.assertEqual(len(self.raw["contacts"]["projectiles"]), 1)

    def test_top_level_fields(self) -> None:
        self.assertEqual(self.state.tick, self.raw["tick"])
        self.assertEqual(self.state.self_id, self.raw["selfId"])
        # Non-default sanity: a swallowed tick would not be 42.
        self.assertNotEqual(self.state.tick, 0)

    def test_own_unit_fields_round_trip_without_defaulting(self) -> None:
        own = self.state.own_unit
        self_json = self.raw["self"]

        self.assertEqual(own.unit_id, self_json["unitId"])
        self.assertEqual(own.team_id, self_json["teamId"])
        self.assertEqual(own.name, self_json["name"])
        self.assertEqual(own.position.x, self_json["position"]["x"])
        self.assertEqual(own.position.y, self_json["position"]["y"])
        self.assertEqual(own.hull_heading, self_json["hullHeadingDegrees"])
        self.assertEqual(own.turret_heading, self_json["turretHeadingDegrees"])
        self.assertEqual(own.armor_integrity, self_json["armorIntegrity"])
        self.assertEqual(own.weapon_cooldown, self_json["weaponCooldownTicks"])

        # Every optionally-defaulted field carries a value distinct from the
        # dataclass default, so a silent fallback would be observable.
        self.assertNotEqual(own.team_id, 0)
        self.assertNotEqual(own.name, "")
        self.assertNotEqual(own.weapon_cooldown, 0)
        self.assertNotEqual(own.position.x, 0.0)

    def test_own_unit_intents_round_trip(self) -> None:
        intents = self.state.own_unit.intent
        intents_json = self.raw["self"]["intents"]

        self.assertTrue(intents.mobility.active)
        self.assertEqual(intents.mobility.remaining, intents_json["mobility"]["remainingMeters"])
        self.assertEqual(intents.mobility.age, intents_json["mobility"]["ageTicks"])
        self.assertEqual(intents.mobility.target.x, intents_json["mobility"]["target"]["x"])
        self.assertNotEqual(intents.mobility.remaining, 0.0)
        self.assertNotEqual(intents.mobility.age, 0)

        self.assertTrue(intents.turret.active)
        self.assertEqual(intents.turret.error, intents_json["turret"]["errorDegrees"])
        self.assertNotEqual(intents.turret.error, 0.0)

        self.assertTrue(intents.hull.active)
        self.assertEqual(intents.hull.error, intents_json["hull"]["errorDegrees"])

        self.assertTrue(intents.weapon.active)
        self.assertEqual(intents.weapon.min_hit_chance, intents_json["weapon"]["minHitChance"])
        self.assertEqual(intents.weapon.age, intents_json["weapon"]["ageTicks"])
        self.assertNotEqual(intents.weapon.min_hit_chance, 0.0)

    def test_enemy_contact_fields_round_trip(self) -> None:
        self.assertEqual(len(self.state.contacts.units), 1)
        contact = self.state.contacts.units[0]
        contact_json = self.raw["contacts"]["units"][0]

        self.assertEqual(contact.unit_id, contact_json["unitId"])
        self.assertEqual(contact.team_id, contact_json["teamId"])
        self.assertEqual(contact.is_enemy, contact_json["isEnemy"])
        self.assertEqual(contact.position.x, contact_json["position"]["x"])
        self.assertEqual(contact.position.y, contact_json["position"]["y"])
        self.assertEqual(contact.hull_heading, contact_json["hullHeadingDegrees"])
        self.assertEqual(contact.turret_heading, contact_json["turretHeadingDegrees"])
        self.assertEqual(contact.armor_integrity, contact_json["armorIntegrity"])
        self.assertEqual(contact.weapon_cooldown, contact_json["weaponCooldownTicks"])

        # is_enemy defaults to False, team_id/weapon_cooldown to 0.
        self.assertTrue(contact.is_enemy)
        self.assertNotEqual(contact.team_id, 0)
        self.assertNotEqual(contact.weapon_cooldown, 0)

        # closest_enemy() must surface this contact.
        self.assertIs(self.state.contacts.closest_enemy(), contact)

    def test_obstacle_contacts_round_trip(self) -> None:
        self.assertEqual(len(self.state.contacts.obstacles), 1)
        obstacle = self.state.contacts.obstacles[0]
        obstacle_json = self.raw["contacts"]["obstacles"][0]

        self.assertEqual(obstacle.id, obstacle_json["id"])
        self.assertEqual(obstacle.position.x, obstacle_json["position"]["x"])
        self.assertEqual(obstacle.position.y, obstacle_json["position"]["y"])
        self.assertEqual(obstacle.radius, obstacle_json["radiusMeters"])
        self.assertEqual(obstacle.blocks_movement, obstacle_json["blocksMovement"])
        self.assertEqual(obstacle.blocks_line_of_sight, obstacle_json["blocksLineOfSight"])

        # id defaults to "", radius to 1.0, both blocks_* to True.
        self.assertNotEqual(obstacle.id, "")
        self.assertNotEqual(obstacle.radius, 1.0)
        self.assertFalse(obstacle.blocks_movement)
        self.assertFalse(obstacle.blocks_line_of_sight)

    def test_projectile_contacts_round_trip(self) -> None:
        self.assertEqual(len(self.state.contacts.projectiles), 1)
        projectile = self.state.contacts.projectiles[0]
        projectile_json = self.raw["contacts"]["projectiles"][0]

        self.assertEqual(projectile.projectile_id, projectile_json["projectileId"])
        self.assertEqual(projectile.owner_unit_id, projectile_json["ownerUnitId"])
        self.assertEqual(projectile.previous_position.x, projectile_json["previousPosition"]["x"])
        self.assertEqual(projectile.previous_position.y, projectile_json["previousPosition"]["y"])
        self.assertEqual(projectile.position.x, projectile_json["position"]["x"])
        self.assertEqual(projectile.position.y, projectile_json["position"]["y"])
        self.assertEqual(projectile.radius, projectile_json["radiusMeters"])
        self.assertEqual(projectile.previous_height, projectile_json["previousHeightMeters"])
        self.assertEqual(projectile.height, projectile_json["heightMeters"])

        # radius/heights all default to 0.0.
        self.assertNotEqual(projectile.radius, 0.0)
        self.assertNotEqual(projectile.previous_height, 0.0)
        self.assertNotEqual(projectile.height, 0.0)

    def test_map_obstacles_round_trip(self) -> None:
        map_obstacles = self.state.map.obstacles
        map_json = self.raw["map"]["obstacles"]
        self.assertEqual(len(map_obstacles), len(map_json))
        self.assertGreaterEqual(len(map_obstacles), 2)

        for obstacle, obstacle_json in zip(map_obstacles, map_json):
            self.assertEqual(obstacle.id, obstacle_json["id"])
            self.assertEqual(obstacle.position.x, obstacle_json["position"]["x"])
            self.assertEqual(obstacle.radius, obstacle_json["radiusMeters"])
            self.assertEqual(obstacle.blocks_movement, obstacle_json["blocksMovement"])
            self.assertEqual(obstacle.blocks_line_of_sight, obstacle_json["blocksLineOfSight"])
            self.assertNotEqual(obstacle.id, "")


if __name__ == "__main__":
    unittest.main()
