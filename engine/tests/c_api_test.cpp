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
  REQUIRE(nlohmann::json::parse(robolocks_battle_runner_frame_json(runtime)).at("units").size() == 2);
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
  const auto frame = nlohmann::json::parse(robolocks_battle_runner_frame_json(runtime));
  REQUIRE(frame.at("tick") == 2);
  const auto& unit0 = frame.at("units")[0];
  REQUIRE(unit0.at("unitId") == 1);
  REQUIRE(unit0.at("name") == "Blue");
  REQUIRE(unit0.at("position").at("x") == Catch::Approx(6.0));
  REQUIRE(unit0.at("position").at("y") == Catch::Approx(12.0));
  REQUIRE(unit0.at("turretHeadingDegrees") == Catch::Approx(0.0));
  REQUIRE(unit0.at("hullHeadingDegrees") == Catch::Approx(0.0));
  REQUIRE(unit0.at("weaponCooldownTicks") == 0);
  REQUIRE(unit0.at("bodyShape").at("type") == "box");
  REQUIRE(unit0.at("bodyShape").at("radiusMeters") == Catch::Approx(1.2));
  REQUIRE(unit0.at("modules").at("mobility").at("id") == "tracked_chassis_mk1");
  REQUIRE(unit0.at("modules").at("weapon").at("muzzleOffsetMeters").at("x") == Catch::Approx(3.6));
  REQUIRE(unit0.at("modules").at("sensor").at("rangeMeters") == Catch::Approx(60.0));
  const auto& intents0 = unit0.at("intents");
  REQUIRE(intents0.at("mobility").at("active") == false);
  REQUIRE(intents0.at("mobility").at("target").at("x") == Catch::Approx(6.0));
  REQUIRE(intents0.at("mobility").at("target").at("y") == Catch::Approx(12.0));
  REQUIRE(intents0.at("mobility").at("remainingMeters") == Catch::Approx(0.0));
  REQUIRE(intents0.at("mobility").at("ageTicks") == 2);
  REQUIRE(intents0.at("turret").at("active") == false);
  REQUIRE(intents0.at("turret").at("errorDegrees") == Catch::Approx(0.0));
  REQUIRE(intents0.at("turret").at("ageTicks") == 2);
  REQUIRE(intents0.at("hull").at("active") == false);
  REQUIRE(intents0.at("hull").at("errorDegrees") == Catch::Approx(0.0));
  REQUIRE(intents0.at("hull").at("ageTicks") == 2);
  REQUIRE(intents0.at("weapon").at("active") == false);
  REQUIRE(intents0.at("weapon").at("minHitChance") == Catch::Approx(0.0));
  REQUIRE(intents0.at("weapon").at("ageTicks") == 2);
  const auto& unit1 = frame.at("units")[1];
  REQUIRE(unit1.at("unitId") == 2);
  REQUIRE(unit1.at("position").at("x") == Catch::Approx(34.0));
  REQUIRE(unit1.at("position").at("y") == Catch::Approx(12.0));
  REQUIRE(frame.at("events").empty());
  REQUIRE(frame.at("projectiles").empty());
  REQUIRE(frame.at("actions").empty());

  robolocks_battle_runner_run(runtime, 118);

  REQUIRE(robolocks_battle_runner_tick(runtime) == 120);
  const auto final_frame = nlohmann::json::parse(robolocks_battle_runner_frame_json(runtime));
  REQUIRE(final_frame.at("units")[0].at("position").at("x") == Catch::Approx(6.0));
  REQUIRE(final_frame.at("units")[1].at("position").at("x") == Catch::Approx(34.0));
  REQUIRE(final_frame.at("units")[1].at("turretHeadingDegrees") == Catch::Approx(180.0));
  REQUIRE(final_frame.at("units")[1].at("hullHeadingDegrees") == Catch::Approx(180.0));

  robolocks_battle_runner_destroy(runtime);
}

TEST_CASE("C API exposes a coarse frame JSON matching the replay schema") {
  RobolocksBattleRunnerHandle runtime = robolocks_battle_runner_create_from_json(R"json({
    "battleId": "c_api_frame_test",
    "seed": 1,
    "tickRate": 30,
    "tickLimit": 9000,
    "units": [
      {
        "unitId": 1, "teamId": 1, "name": "Blue",
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
        "unitId": 2, "teamId": 2, "name": "Red",
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

  robolocks_battle_runner_step(runtime);

  const char* frame_text = robolocks_battle_runner_frame_json(runtime);
  REQUIRE(frame_text != nullptr);
  const auto frame = nlohmann::json::parse(frame_text);
  REQUIRE(frame.at("tick") == 1);
  REQUIRE(frame.at("units").is_array());
  REQUIRE(frame.at("units").size() == 2);
  REQUIRE(frame.at("units")[0].contains("name"));
  REQUIRE(frame.at("units")[0].at("name") == "Blue");
  REQUIRE(frame.at("units")[0].at("teamId") == 1);
  REQUIRE(frame.at("units")[0].at("modules").at("sensor").at("rangeMeters") == Catch::Approx(60.0));
  REQUIRE(frame.at("units")[0].at("intents").at("mobility").contains("active"));
  REQUIRE(frame.at("projectiles").is_array());
  REQUIRE(frame.at("events").is_array());
  REQUIRE(frame.at("actions").is_array());
  REQUIRE(frame.contains("ruleState"));
  REQUIRE(frame.at("ruleState").contains("outcome"));

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
  const auto callback_frame = nlohmann::json::parse(robolocks_battle_runner_frame_json(runtime));
  const auto& actions = callback_frame.at("actions");
  REQUIRE(actions.size() == 2);
  REQUIRE(actions[0].at("type") == "moveTo");
  REQUIRE(actions[0].at("position").at("x") == Catch::Approx(17.0));
  REQUIRE(actions[1].at("type") == "aimAt");
  REQUIRE(actions[1].at("target").at("x") == Catch::Approx(34.0));
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

  const auto frame = nlohmann::json::parse(robolocks_battle_runner_frame_json(runtime));
  const auto& rule_state = frame.at("ruleState");
  const auto& scores = rule_state.at("scores");
  REQUIRE(scores.size() == 2);
  REQUIRE(scores[0].at("unitId") == 1);
  REQUIRE(scores[0].at("teamId") == 1);
  REQUIRE(scores[0].at("kills") == 1);
  REQUIRE(scores[1].at("deaths") == 1);

  const auto& events = frame.at("events");
  const nlohmann::json* damage_event = nullptr;
  for (const auto& event : events) {
    if (event.at("code") == "armor_damage") {
      damage_event = &event;
      break;
    }
  }
  REQUIRE(damage_event != nullptr);
  const auto& payload = damage_event->at("payload");
  REQUIRE(payload.at("sourceUnitId") == 1);
  REQUIRE(payload.at("targetUnitId") == 2);
  REQUIRE(payload.at("sourceTeamId") == 1);
  REQUIRE(payload.at("targetTeamId") == 2);
  REQUIRE(payload.at("damageType") == "direct");
  REQUIRE(payload.at("damage") == Catch::Approx(30.0));
  REQUIRE(payload.at("remainingArmor") == Catch::Approx(0.0));
  REQUIRE(payload.at("penetrationMillimeters") == Catch::Approx(120.0));
  REQUIRE(payload.at("armorMillimeters") == Catch::Approx(100.0));

  const auto& outcome = rule_state.at("outcome");
  REQUIRE(outcome.at("finished") == true);
  REQUIRE(outcome.at("reason") == "kill_limit");
  REQUIRE(outcome.at("winnerTeamId") == 1);

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
  {
    const auto frame = nlohmann::json::parse(robolocks_battle_runner_frame_json(runtime));
    const auto& rule_state = frame.at("ruleState");
    const auto& zones = rule_state.at("captureZones");
    REQUIRE(zones.size() == 1);
    REQUIRE(zones[0].at("id") == "alpha");
    REQUIRE(zones[0].at("position").at("x") == Catch::Approx(5.0));
    REQUIRE(zones[0].at("position").at("y") == Catch::Approx(5.0));
    REQUIRE(zones[0].at("radiusMeters") == Catch::Approx(2.0));
    REQUIRE(zones[0].at("holdTicksRequired") == 2);
    REQUIRE(zones[0].at("heldTicks") == 1);
    REQUIRE(zones[0].at("ownerUnitId") == 1);
    REQUIRE(zones[0].at("ownerTeamId") == 1);
    REQUIRE(zones[0].at("contested") == false);
    REQUIRE(rule_state.at("outcome").at("finished") == false);
  }

  robolocks_battle_runner_step(runtime);
  {
    const auto frame = nlohmann::json::parse(robolocks_battle_runner_frame_json(runtime));
    const auto& rule_state = frame.at("ruleState");
    REQUIRE(rule_state.at("captureZones")[0].at("heldTicks") == 2);
    REQUIRE(rule_state.at("outcome").at("finished") == true);
    REQUIRE(rule_state.at("outcome").at("reason") == "capture_point");
    REQUIRE(rule_state.at("outcome").at("winnerTeamId") == 1);
  }

  robolocks_battle_runner_destroy(runtime);
}
