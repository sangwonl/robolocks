#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <robolocks/c_api.h>

#include <nlohmann/json.hpp>

#include <string>

namespace {

std::uint32_t g_called_bot_id = 0;
nlohmann::json g_received_observation;
std::string g_callback_response;
int g_release_call_count = 0;
const char* g_released_response = nullptr;

const char* test_json_bot_callback(uint32_t bot_id, const char* observation_json, void* user_data) {
  auto* response = static_cast<std::string*>(user_data);
  g_called_bot_id = bot_id;
  g_received_observation = nlohmann::json::parse(observation_json);
  return response->c_str();
}

void test_json_bot_release_callback(const char* response_json, void*) {
  g_release_call_count += 1;
  g_released_response = response_json;
}

}  // namespace

TEST_CASE("C API drives the battle runner and exposes snapshots") {
  RobolocksBattleRunnerHandle runtime = robolocks_battle_runner_create_from_json(R"json({
    "battleId": "c_api_snapshot_test",
    "seed": 1,
    "tickRate": 30,
    "tickLimit": 9000,
    "obstacles": [
      {"id": "north_cover", "position": {"x": 20, "y": 6}, "radiusMeters": 1.5, "blocksMovement": true, "blocksLineOfSight": true}
    ],
    "units": [
      {
        "unitId": 1, "name": "Blue",
        "spawn": {"x": 6, "y": 12, "headingDeg": 0},
        "modules": {
          "mobility": {"id": "tracked_chassis_mk1", "maxSpeedMetersPerSecond": 6.0, "maxHullTurnDegreesPerSecond": 120.0},
          "turret": {"id": "light_turret_mk1", "maxTurnDegreesPerSecond": 180.0},
          "weapon": {"id": "cannon_75mm_mk1", "damage": 25.0, "penetrationMillimeters": 120.0, "rangeMeters": 80.0, "muzzleVelocityMetersPerSecond": 620.0, "muzzleOffsetMeters": {"x": 3.6, "y": 0.0, "z": 1.65}, "projectileRadiusMeters": 0.08, "aimToleranceDegrees": 5.0, "reloadTicks": 30},
          "armor": {"id": "rolled_armor_mk1", "integrity": 100.0, "frontMillimeters": 100.0, "sideMillimeters": 70.0, "rearMillimeters": 45.0},
          "body": {"id": "medium_hull_mk1", "massKilograms": 30000.0, "shape": {"type": "box", "radiusMeters": 1.2, "lengthMeters": 5.6, "widthMeters": 2.8}},
          "sensor": {"id": "visual_optic_mk1", "rangeMeters": 60.0, "fovDegrees": 120.0, "refreshTicks": 1}
        }
      },
      {
        "unitId": 2, "name": "Red",
        "spawn": {"x": 34, "y": 12, "headingDeg": 180},
        "modules": {
          "mobility": {"id": "tracked_chassis_mk1", "maxSpeedMetersPerSecond": 6.0, "maxHullTurnDegreesPerSecond": 120.0},
          "turret": {"id": "light_turret_mk1", "maxTurnDegreesPerSecond": 180.0},
          "weapon": {"id": "cannon_75mm_mk1", "damage": 25.0, "penetrationMillimeters": 120.0, "rangeMeters": 80.0, "muzzleVelocityMetersPerSecond": 620.0, "muzzleOffsetMeters": {"x": 3.6, "y": 0.0, "z": 1.65}, "projectileRadiusMeters": 0.08, "aimToleranceDegrees": 5.0, "reloadTicks": 30},
          "armor": {"id": "rolled_armor_mk1", "integrity": 100.0, "frontMillimeters": 100.0, "sideMillimeters": 70.0, "rearMillimeters": 45.0},
          "body": {"id": "medium_hull_mk1", "massKilograms": 30000.0, "shape": {"type": "box", "radiusMeters": 1.2, "lengthMeters": 5.6, "widthMeters": 2.8}},
          "sensor": {"id": "visual_optic_mk1", "rangeMeters": 60.0, "fovDegrees": 120.0, "refreshTicks": 1}
        }
      }
    ],
    "controllers": []
  })json");
  REQUIRE(runtime != nullptr);

  REQUIRE(robolocks_battle_runner_tick(runtime) == 0);
  REQUIRE(robolocks_battle_runner_unit_count(runtime) == 2);
  REQUIRE(robolocks_battle_runner_obstacle_count(runtime) == 1);
  REQUIRE(std::string(robolocks_battle_runner_obstacle_id(runtime, 0)) == "north_cover");
  REQUIRE(robolocks_battle_runner_obstacle_x(runtime, 0) == Catch::Approx(20.0));
  REQUIRE(robolocks_battle_runner_obstacle_y(runtime, 0) == Catch::Approx(6.0));
  REQUIRE(robolocks_battle_runner_obstacle_radius(runtime, 0) == Catch::Approx(1.5));
  REQUIRE(robolocks_battle_runner_obstacle_blocks_movement(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runner_obstacle_blocks_line_of_sight(runtime, 0) == 1);

  robolocks_battle_runner_step(runtime);
  robolocks_battle_runner_step(runtime);

  REQUIRE(robolocks_battle_runner_tick(runtime) == 2);
  REQUIRE(robolocks_battle_runner_unit_id(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runner_unit_x(runtime, 0) == Catch::Approx(6.0));
  REQUIRE(robolocks_battle_runner_unit_y(runtime, 0) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runner_unit_turret_heading(runtime, 0) == Catch::Approx(0.0));
  REQUIRE(robolocks_battle_runner_unit_hull_heading(runtime, 0) == Catch::Approx(0.0));
  REQUIRE(robolocks_battle_runner_unit_weapon_cooldown(runtime, 0) == 0);
  REQUIRE(robolocks_battle_runner_unit_body_shape_type(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runner_unit_body_radius(runtime, 0) == Catch::Approx(1.2));
  const auto unit_modules = nlohmann::json::parse(robolocks_battle_runner_unit_modules_json(runtime, 0));
  REQUIRE(unit_modules.at("mobility").at("id") == "tracked_chassis_mk1");
  REQUIRE(unit_modules.at("weapon").at("muzzleOffsetMeters").at("x") == Catch::Approx(3.6));
  REQUIRE(unit_modules.at("sensor").at("rangeMeters") == Catch::Approx(60.0));
  REQUIRE(robolocks_battle_runner_unit_mobility_intent_active(runtime, 0) == 0);
  REQUIRE(robolocks_battle_runner_unit_mobility_intent_target_x(runtime, 0) == Catch::Approx(6.0));
  REQUIRE(robolocks_battle_runner_unit_mobility_intent_target_y(runtime, 0) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runner_unit_mobility_intent_remaining(runtime, 0) == Catch::Approx(0.0));
  REQUIRE(robolocks_battle_runner_unit_mobility_intent_age(runtime, 0) == 2);
  REQUIRE(robolocks_battle_runner_unit_turret_intent_active(runtime, 0) == 0);
  REQUIRE(robolocks_battle_runner_unit_turret_intent_target_x(runtime, 0) == Catch::Approx(6.0));
  REQUIRE(robolocks_battle_runner_unit_turret_intent_target_y(runtime, 0) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runner_unit_turret_intent_error(runtime, 0) == Catch::Approx(0.0));
  REQUIRE(robolocks_battle_runner_unit_turret_intent_age(runtime, 0) == 2);
  REQUIRE(robolocks_battle_runner_unit_hull_intent_active(runtime, 0) == 0);
  REQUIRE(robolocks_battle_runner_unit_hull_intent_target_x(runtime, 0) == Catch::Approx(6.0));
  REQUIRE(robolocks_battle_runner_unit_hull_intent_target_y(runtime, 0) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runner_unit_hull_intent_error(runtime, 0) == Catch::Approx(0.0));
  REQUIRE(robolocks_battle_runner_unit_hull_intent_age(runtime, 0) == 2);
  REQUIRE(robolocks_battle_runner_unit_weapon_intent_active(runtime, 0) == 0);
  REQUIRE(robolocks_battle_runner_unit_weapon_intent_min_hit_chance(runtime, 0) == Catch::Approx(0.0));
  REQUIRE(robolocks_battle_runner_unit_weapon_intent_age(runtime, 0) == 2);
  REQUIRE(robolocks_battle_runner_unit_id(runtime, 1) == 2);
  REQUIRE(robolocks_battle_runner_unit_x(runtime, 1) == Catch::Approx(34.0));
  REQUIRE(robolocks_battle_runner_unit_y(runtime, 1) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runner_event_count(runtime) == 0);
  REQUIRE(robolocks_battle_runner_projectile_count(runtime) == 0);
  REQUIRE(robolocks_battle_runner_action_count(runtime) == 0);

  robolocks_battle_runner_run(runtime, 118);

  REQUIRE(robolocks_battle_runner_tick(runtime) == 120);
  REQUIRE(robolocks_battle_runner_unit_x(runtime, 0) == Catch::Approx(6.0));
  REQUIRE(robolocks_battle_runner_unit_x(runtime, 1) == Catch::Approx(34.0));
  REQUIRE(robolocks_battle_runner_unit_turret_heading(runtime, 1) == Catch::Approx(180.0));
  REQUIRE(robolocks_battle_runner_unit_hull_heading(runtime, 1) == Catch::Approx(180.0));

  robolocks_battle_runner_destroy(runtime);
}

TEST_CASE("C API JSON config runner calls a registered JSON bot callback during step") {
  g_called_bot_id = 0;
  g_received_observation = {};
  g_release_call_count = 0;
  g_released_response = nullptr;
  g_callback_response = R"json({
    "orders": [
      {"type": "moveTo", "position": {"x": 17.0, "y": 12.0}},
      {"type": "aimAt", "target": {"x": 34.0, "y": 18.0}}
    ]
  })json";
  robolocks_battle_runner_set_json_bot_callback(
    test_json_bot_callback,
    test_json_bot_release_callback,
    &g_callback_response
  );

  RobolocksBattleRunnerHandle runtime = robolocks_battle_runner_create_from_json(R"json({
    "battleId": "json_callback_test",
    "seed": 1,
    "tickRate": 30,
    "tickLimit": 120,
    "units": [
      {
        "unitId": 1,
        "name": "Blue",
        "spawn": {"x": 4, "y": 5, "headingDeg": 35},
        "modules": {
          "mobility": {"id": "tracked_chassis_mk1", "maxSpeedMetersPerSecond": 6.0, "maxHullTurnDegreesPerSecond": 120.0},
          "turret": {"id": "light_turret_mk1", "maxTurnDegreesPerSecond": 180.0},
          "weapon": {"id": "slow_cannon_test", "damage": 25.0, "penetrationMillimeters": 80.0, "rangeMeters": 80.0, "muzzleVelocityMetersPerSecond": 20.0, "muzzleOffsetMeters": {"x": 3.6, "y": 0.0, "z": 1.65}, "projectileRadiusMeters": 0.08, "reloadTicks": 90},
          "armor": {"id": "rolled_armor_mk1", "integrity": 100.0, "frontMillimeters": 100.0, "sideMillimeters": 70.0, "rearMillimeters": 45.0},
          "body": {"id": "medium_hull_mk1", "massKilograms": 30000.0, "shape": {"type": "box", "radiusMeters": 1.2, "lengthMeters": 5.6, "widthMeters": 2.8}},
          "sensor": {"id": "visual_optic_mk1", "rangeMeters": 60.0, "fovDegrees": 120.0, "refreshTicks": 1}
        }
      },
      {
        "unitId": 2,
        "name": "Target",
        "spawn": {"x": 34, "y": 18, "headingDeg": 215},
        "modules": {
          "mobility": {"id": "fixed_target_chassis", "maxSpeedMetersPerSecond": 0.0, "maxHullTurnDegreesPerSecond": 60.0},
          "turret": {"id": "light_turret_mk1", "maxTurnDegreesPerSecond": 180.0},
          "weapon": {"id": "slow_cannon_test", "damage": 25.0, "penetrationMillimeters": 80.0, "rangeMeters": 80.0, "muzzleVelocityMetersPerSecond": 20.0, "muzzleOffsetMeters": {"x": 3.6, "y": 0.0, "z": 1.65}, "projectileRadiusMeters": 0.08, "reloadTicks": 90},
          "armor": {"id": "rolled_armor_mk1", "integrity": 100.0, "frontMillimeters": 100.0, "sideMillimeters": 70.0, "rearMillimeters": 45.0},
          "body": {"id": "medium_hull_mk1", "massKilograms": 30000.0, "shape": {"type": "box", "radiusMeters": 1.2, "lengthMeters": 5.6, "widthMeters": 2.8}},
          "sensor": {"id": "visual_optic_mk1", "rangeMeters": 60.0, "fovDegrees": 120.0, "refreshTicks": 1}
        }
      }
    ],
    "controllers": [
      {"unitId": 1, "type": "json_callback"}
    ]
  })json");
  REQUIRE(runtime != nullptr);
  REQUIRE(g_called_bot_id == 1);
  REQUIRE(g_received_observation.at("type") == "start");
  REQUIRE(g_received_observation.at("spec").at("modules").at("sensor").at("rangeMeters") == Catch::Approx(60.0));
  REQUIRE(g_release_call_count == 1);

  robolocks_battle_runner_step(runtime);

  REQUIRE(g_called_bot_id == 1);
  REQUIRE(g_received_observation.at("selfId") == 1);
  REQUIRE(g_received_observation.at("contacts").at("units").size() == 0);
  REQUIRE(robolocks_battle_runner_tick(runtime) == 1);
  REQUIRE(robolocks_battle_runner_action_count(runtime) == 2);
  REQUIRE(std::string(robolocks_battle_runner_action_type(runtime, 0)) == "moveTo");
  REQUIRE(robolocks_battle_runner_action_position_x(runtime, 0) == Catch::Approx(17.0));
  REQUIRE(std::string(robolocks_battle_runner_action_type(runtime, 1)) == "aimAt");
  REQUIRE(robolocks_battle_runner_action_target_x(runtime, 1) == Catch::Approx(34.0));
  REQUIRE(g_release_call_count == 2);
  REQUIRE(g_released_response == g_callback_response.c_str());

  robolocks_battle_runner_destroy(runtime);
  robolocks_battle_runner_set_json_bot_callback(nullptr, nullptr, nullptr);
}

TEST_CASE("C API exposes battle rule scores and outcome") {
  g_called_bot_id = 0;
  g_received_observation = {};
  g_release_call_count = 0;
  g_released_response = nullptr;
  g_callback_response = R"json({
    "orders": [
      {"type": "aimAt", "target": {"x": 10.0, "y": 0.0}},
      {"type": "fireIfSolution", "minHitChance": 0.6}
    ]
  })json";
  robolocks_battle_runner_set_json_bot_callback(
    test_json_bot_callback,
    test_json_bot_release_callback,
    &g_callback_response
  );

  RobolocksBattleRunnerHandle runtime = robolocks_battle_runner_create_from_json(R"json({
    "battleId": "c_api_rule_test",
    "seed": 1,
    "tickRate": 30,
    "tickLimit": 120,
    "rule": {
      "mode": "kill_limit_deathmatch",
      "teamMode": "team",
      "killLimit": 1
    },
    "units": [
      {
        "unitId": 1,
        "teamId": 1,
        "name": "Blue",
        "spawn": {"x": 0, "y": 0, "headingDeg": 0},
        "modules": {
          "mobility": {"id": "fixed", "maxSpeedMetersPerSecond": 0.0, "maxHullTurnDegreesPerSecond": 120.0},
          "turret": {"id": "fast", "maxTurnDegreesPerSecond": 180.0},
          "weapon": {"id": "test_gun", "damage": 25.0, "penetrationMillimeters": 120.0, "rangeMeters": 80.0, "muzzleVelocityMetersPerSecond": 620.0, "muzzleOffsetMeters": {"x": 0.0, "y": 0.0, "z": 1.0}, "projectileRadiusMeters": 0.08, "aimToleranceDegrees": 5.0, "reloadTicks": 30},
          "armor": {"id": "armor", "integrity": 100.0, "frontMillimeters": 100.0, "sideMillimeters": 70.0, "rearMillimeters": 45.0},
          "body": {"id": "body", "massKilograms": 30000.0, "shape": {"type": "box", "radiusMeters": 1.2, "lengthMeters": 5.6, "widthMeters": 2.8}},
          "sensor": {"id": "sensor", "rangeMeters": 60.0, "fovDegrees": 120.0, "refreshTicks": 1}
        }
      },
      {
        "unitId": 2,
        "teamId": 2,
        "name": "Red",
        "spawn": {"x": 10, "y": 0, "headingDeg": 180},
        "modules": {
          "mobility": {"id": "fixed", "maxSpeedMetersPerSecond": 0.0, "maxHullTurnDegreesPerSecond": 120.0},
          "turret": {"id": "fast", "maxTurnDegreesPerSecond": 180.0},
          "weapon": {"id": "test_gun", "damage": 25.0, "penetrationMillimeters": 120.0, "rangeMeters": 80.0, "muzzleVelocityMetersPerSecond": 620.0, "muzzleOffsetMeters": {"x": 0.0, "y": 0.0, "z": 1.0}, "projectileRadiusMeters": 0.08, "aimToleranceDegrees": 5.0, "reloadTicks": 30},
          "armor": {"id": "weak", "integrity": 20.0, "frontMillimeters": 100.0, "sideMillimeters": 70.0, "rearMillimeters": 45.0},
          "body": {"id": "body", "massKilograms": 30000.0, "shape": {"type": "box", "radiusMeters": 1.2, "lengthMeters": 5.6, "widthMeters": 2.8}},
          "sensor": {"id": "sensor", "rangeMeters": 60.0, "fovDegrees": 120.0, "refreshTicks": 1}
        }
      }
    ],
    "controllers": [
      {"unitId": 1, "type": "json_callback"}
    ]
  })json");
  REQUIRE(runtime != nullptr);

  robolocks_battle_runner_step(runtime);

  REQUIRE(robolocks_battle_runner_score_count(runtime) == 2);
  REQUIRE(robolocks_battle_runner_score_unit_id(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runner_score_team_id(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runner_score_kills(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runner_score_deaths(runtime, 1) == 1);
  std::size_t damage_event_index = robolocks_battle_runner_event_count(runtime);
  for (std::size_t i = 0; i < robolocks_battle_runner_event_count(runtime); i += 1) {
    if (std::string(robolocks_battle_runner_event_code(runtime, i)) == "armor_damage") {
      damage_event_index = i;
      break;
    }
  }
  REQUIRE(damage_event_index < robolocks_battle_runner_event_count(runtime));
  REQUIRE(robolocks_battle_runner_event_source_unit_id(runtime, damage_event_index) == 1);
  REQUIRE(robolocks_battle_runner_event_target_unit_id(runtime, damage_event_index) == 2);
  REQUIRE(robolocks_battle_runner_event_source_team_id(runtime, damage_event_index) == 1);
  REQUIRE(robolocks_battle_runner_event_target_team_id(runtime, damage_event_index) == 2);
  REQUIRE(std::string(robolocks_battle_runner_event_damage_type(runtime, damage_event_index)) == "direct");
  REQUIRE(robolocks_battle_runner_event_damage(runtime, damage_event_index) == Catch::Approx(30.0));
  REQUIRE(robolocks_battle_runner_event_remaining_armor(runtime, damage_event_index) == Catch::Approx(0.0));
  REQUIRE(robolocks_battle_runner_event_penetration_millimeters(runtime, damage_event_index) == Catch::Approx(120.0));
  REQUIRE(robolocks_battle_runner_event_armor_millimeters(runtime, damage_event_index) == Catch::Approx(100.0));
  REQUIRE(robolocks_battle_runner_outcome_finished(runtime) == 1);
  REQUIRE(std::string(robolocks_battle_runner_outcome_reason(runtime)) == "kill_limit");
  REQUIRE(robolocks_battle_runner_outcome_winner_team_id(runtime) == 1);

  robolocks_battle_runner_destroy(runtime);
  robolocks_battle_runner_set_json_bot_callback(nullptr, nullptr, nullptr);
}

TEST_CASE("C API exposes capture zone progress") {
  RobolocksBattleRunnerHandle runtime = robolocks_battle_runner_create_from_json(R"json({
    "battleId": "c_api_capture_test",
    "seed": 1,
    "tickRate": 30,
    "tickLimit": 120,
    "rule": {
      "mode": "capture_point",
      "teamMode": "team",
      "captureZones": [
        {"id": "alpha", "position": {"x": 5, "y": 5}, "radiusMeters": 2, "holdTicks": 2}
      ]
    },
    "units": [
      {
        "unitId": 1,
        "teamId": 1,
        "name": "Blue",
        "spawn": {"x": 5, "y": 5, "headingDeg": 0},
        "modules": {
          "mobility": {"id": "fixed", "maxSpeedMetersPerSecond": 0.0, "maxHullTurnDegreesPerSecond": 120.0},
          "turret": {"id": "fast", "maxTurnDegreesPerSecond": 180.0},
          "weapon": {"id": "test_gun", "damage": 25.0, "penetrationMillimeters": 120.0, "rangeMeters": 80.0, "muzzleVelocityMetersPerSecond": 620.0, "muzzleOffsetMeters": {"x": 0.0, "y": 0.0, "z": 1.0}, "projectileRadiusMeters": 0.08, "aimToleranceDegrees": 5.0, "reloadTicks": 30},
          "armor": {"id": "armor", "integrity": 100.0, "frontMillimeters": 100.0, "sideMillimeters": 70.0, "rearMillimeters": 45.0},
          "body": {"id": "body", "massKilograms": 30000.0, "shape": {"type": "box", "radiusMeters": 1.2, "lengthMeters": 5.6, "widthMeters": 2.8}},
          "sensor": {"id": "sensor", "rangeMeters": 60.0, "fovDegrees": 120.0, "refreshTicks": 1}
        }
      },
      {
        "unitId": 2,
        "teamId": 2,
        "name": "Red",
        "spawn": {"x": 20, "y": 20, "headingDeg": 180},
        "modules": {
          "mobility": {"id": "fixed", "maxSpeedMetersPerSecond": 0.0, "maxHullTurnDegreesPerSecond": 120.0},
          "turret": {"id": "fast", "maxTurnDegreesPerSecond": 180.0},
          "weapon": {"id": "test_gun", "damage": 25.0, "penetrationMillimeters": 120.0, "rangeMeters": 80.0, "muzzleVelocityMetersPerSecond": 620.0, "muzzleOffsetMeters": {"x": 0.0, "y": 0.0, "z": 1.0}, "projectileRadiusMeters": 0.08, "aimToleranceDegrees": 5.0, "reloadTicks": 30},
          "armor": {"id": "armor", "integrity": 100.0, "frontMillimeters": 100.0, "sideMillimeters": 70.0, "rearMillimeters": 45.0},
          "body": {"id": "body", "massKilograms": 30000.0, "shape": {"type": "box", "radiusMeters": 1.2, "lengthMeters": 5.6, "widthMeters": 2.8}},
          "sensor": {"id": "sensor", "rangeMeters": 60.0, "fovDegrees": 120.0, "refreshTicks": 1}
        }
      }
    ],
    "controllers": []
  })json");
  REQUIRE(runtime != nullptr);

  robolocks_battle_runner_step(runtime);
  REQUIRE(robolocks_battle_runner_capture_zone_count(runtime) == 1);
  REQUIRE(std::string(robolocks_battle_runner_capture_zone_id(runtime, 0)) == "alpha");
  REQUIRE(robolocks_battle_runner_capture_zone_x(runtime, 0) == Catch::Approx(5.0));
  REQUIRE(robolocks_battle_runner_capture_zone_y(runtime, 0) == Catch::Approx(5.0));
  REQUIRE(robolocks_battle_runner_capture_zone_radius(runtime, 0) == Catch::Approx(2.0));
  REQUIRE(robolocks_battle_runner_capture_zone_hold_ticks_required(runtime, 0) == 2);
  REQUIRE(robolocks_battle_runner_capture_zone_held_ticks(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runner_capture_zone_owner_unit_id(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runner_capture_zone_owner_team_id(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runner_capture_zone_contested(runtime, 0) == 0);
  REQUIRE(robolocks_battle_runner_outcome_finished(runtime) == 0);

  robolocks_battle_runner_step(runtime);
  REQUIRE(robolocks_battle_runner_capture_zone_held_ticks(runtime, 0) == 2);
  REQUIRE(robolocks_battle_runner_outcome_finished(runtime) == 1);
  REQUIRE(std::string(robolocks_battle_runner_outcome_reason(runtime)) == "capture_point");
  REQUIRE(robolocks_battle_runner_outcome_winner_team_id(runtime) == 1);

  robolocks_battle_runner_destroy(runtime);
}
