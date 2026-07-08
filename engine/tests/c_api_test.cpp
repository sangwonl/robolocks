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
  RobolocksBattleRunnerHandle runtime = robolocks_battle_runner_create_preset_duel();
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
  REQUIRE(robolocks_battle_runner_unit_x(runtime, 0) == Catch::Approx(6.4));
  REQUIRE(robolocks_battle_runner_unit_y(runtime, 0) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runner_unit_turret_heading(runtime, 0) == Catch::Approx(0.0));
  REQUIRE(robolocks_battle_runner_unit_hull_heading(runtime, 0) == Catch::Approx(0.0));
  REQUIRE(robolocks_battle_runner_unit_weapon_cooldown(runtime, 0) == 30);
  REQUIRE(robolocks_battle_runner_unit_body_shape_type(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runner_unit_body_radius(runtime, 0) == Catch::Approx(1.2));
  const auto unit_modules = nlohmann::json::parse(robolocks_battle_runner_unit_modules_json(runtime, 0));
  REQUIRE(unit_modules.at("mobility").at("id") == "tracked_chassis_mk1");
  REQUIRE(unit_modules.at("weapon").at("muzzleOffsetMeters").at("x") == Catch::Approx(3.6));
  REQUIRE(unit_modules.at("sensor").at("rangeMeters") == Catch::Approx(60.0));
  REQUIRE(robolocks_battle_runner_unit_mobility_intent_active(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runner_unit_mobility_intent_target_x(runtime, 0) == Catch::Approx(17.0));
  REQUIRE(robolocks_battle_runner_unit_mobility_intent_target_y(runtime, 0) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runner_unit_mobility_intent_remaining(runtime, 0) == Catch::Approx(10.6));
  REQUIRE(robolocks_battle_runner_unit_mobility_intent_age(runtime, 0) == 0);
  REQUIRE(robolocks_battle_runner_unit_turret_intent_active(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runner_unit_turret_intent_target_x(runtime, 0) == Catch::Approx(33.8));
  REQUIRE(robolocks_battle_runner_unit_turret_intent_target_y(runtime, 0) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runner_unit_turret_intent_error(runtime, 0) == Catch::Approx(0.0));
  REQUIRE(robolocks_battle_runner_unit_turret_intent_age(runtime, 0) == 0);
  REQUIRE(robolocks_battle_runner_unit_hull_intent_active(runtime, 0) == 0);
  REQUIRE(robolocks_battle_runner_unit_hull_intent_target_x(runtime, 0) == Catch::Approx(6.0));
  REQUIRE(robolocks_battle_runner_unit_hull_intent_target_y(runtime, 0) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runner_unit_hull_intent_error(runtime, 0) == Catch::Approx(0.0));
  REQUIRE(robolocks_battle_runner_unit_hull_intent_age(runtime, 0) == 2);
  REQUIRE(robolocks_battle_runner_unit_weapon_intent_active(runtime, 0) == 0);
  REQUIRE(robolocks_battle_runner_unit_weapon_intent_min_hit_chance(runtime, 0) == Catch::Approx(0.0));
  REQUIRE(robolocks_battle_runner_unit_weapon_intent_age(runtime, 0) == 0);
  REQUIRE(robolocks_battle_runner_unit_id(runtime, 1) == 2);
  REQUIRE(robolocks_battle_runner_unit_x(runtime, 1) == Catch::Approx(33.6));
  REQUIRE(robolocks_battle_runner_unit_y(runtime, 1) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runner_event_count(runtime) == 4);
  REQUIRE(std::string(robolocks_battle_runner_event_code(runtime, 0)) == "weapon_fired");
  REQUIRE(std::string(robolocks_battle_runner_event_code(runtime, 1)) == "weapon_fired");
  REQUIRE(robolocks_battle_runner_projectile_count(runtime) == 0);
  REQUIRE(robolocks_battle_runner_action_count(runtime) == 8);
  REQUIRE(robolocks_battle_runner_action_unit_id(runtime, 0) == 1);
  REQUIRE(std::string(robolocks_battle_runner_action_type(runtime, 0)) == "scanArc");
  REQUIRE(std::string(robolocks_battle_runner_action_channel(runtime, 0)) == "sensor");
  REQUIRE(robolocks_battle_runner_action_has_scan_arc(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runner_action_direction(runtime, 0) == Catch::Approx(0.0));
  REQUIRE(robolocks_battle_runner_action_width(runtime, 0) == Catch::Approx(360.0));
  REQUIRE(robolocks_battle_runner_action_unit_id(runtime, 1) == 1);
  REQUIRE(std::string(robolocks_battle_runner_action_type(runtime, 1)) == "moveTo");
  REQUIRE(std::string(robolocks_battle_runner_action_channel(runtime, 1)) == "mobility");
  REQUIRE(robolocks_battle_runner_action_has_position(runtime, 1) == 1);
  REQUIRE(robolocks_battle_runner_action_position_x(runtime, 1) == Catch::Approx(17.0));
  REQUIRE(robolocks_battle_runner_action_position_y(runtime, 1) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runner_action_has_target(runtime, 1) == 0);
  REQUIRE(std::string(robolocks_battle_runner_action_type(runtime, 2)) == "aimAt");
  REQUIRE(std::string(robolocks_battle_runner_action_channel(runtime, 2)) == "turret");
  REQUIRE(robolocks_battle_runner_action_has_target(runtime, 2) == 1);
  REQUIRE(robolocks_battle_runner_action_target_x(runtime, 2) == Catch::Approx(33.8));
  REQUIRE(robolocks_battle_runner_action_target_y(runtime, 2) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runner_action_unit_id(runtime, 4) == 2);
  REQUIRE(std::string(robolocks_battle_runner_action_type(runtime, 4)) == "scanArc");
  REQUIRE(robolocks_battle_runner_action_unit_id(runtime, 5) == 2);
  REQUIRE(std::string(robolocks_battle_runner_action_type(runtime, 5)) == "moveTo");
  REQUIRE(robolocks_battle_runner_action_unit_id(runtime, 6) == 2);
  REQUIRE(std::string(robolocks_battle_runner_action_type(runtime, 6)) == "aimAt");

  robolocks_battle_runner_run(runtime, 118);

  REQUIRE(robolocks_battle_runner_tick(runtime) == 120);
  REQUIRE(robolocks_battle_runner_unit_x(runtime, 0) == Catch::Approx(17.0));
  REQUIRE(robolocks_battle_runner_unit_x(runtime, 1) == Catch::Approx(23.0));
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
  REQUIRE(g_received_observation.at("contacts").size() == 0);
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
