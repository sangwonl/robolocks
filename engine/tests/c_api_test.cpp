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
  REQUIRE(robolocks_battle_runner_obstacle_radius_m(runtime, 0) == Catch::Approx(1.5));
  REQUIRE(robolocks_battle_runner_obstacle_blocks_movement(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runner_obstacle_blocks_line_of_sight(runtime, 0) == 1);

  robolocks_battle_runner_step(runtime);

  REQUIRE(robolocks_battle_runner_tick(runtime) == 1);
  REQUIRE(robolocks_battle_runner_unit_id(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runner_unit_x(runtime, 0) == Catch::Approx(6.2));
  REQUIRE(robolocks_battle_runner_unit_y(runtime, 0) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runner_unit_turret_heading_deg(runtime, 0) == Catch::Approx(0.0));
  REQUIRE(robolocks_battle_runner_unit_hull_heading_deg(runtime, 0) == Catch::Approx(0.0));
  REQUIRE(robolocks_battle_runner_unit_weapon_cooldown_ticks(runtime, 0) == 30);
  REQUIRE(robolocks_battle_runner_unit_body_shape_type(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runner_unit_body_radius_m(runtime, 0) == Catch::Approx(1.2));
  REQUIRE(robolocks_battle_runner_unit_mobility_intent_active(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runner_unit_mobility_intent_target_x(runtime, 0) == Catch::Approx(17.0));
  REQUIRE(robolocks_battle_runner_unit_mobility_intent_target_y(runtime, 0) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runner_unit_mobility_intent_remaining_m(runtime, 0) == Catch::Approx(10.8));
  REQUIRE(robolocks_battle_runner_unit_mobility_intent_age_ticks(runtime, 0) == 0);
  REQUIRE(robolocks_battle_runner_unit_turret_intent_active(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runner_unit_turret_intent_target_x(runtime, 0) == Catch::Approx(34.0));
  REQUIRE(robolocks_battle_runner_unit_turret_intent_target_y(runtime, 0) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runner_unit_turret_intent_error_deg(runtime, 0) == Catch::Approx(0.0));
  REQUIRE(robolocks_battle_runner_unit_turret_intent_age_ticks(runtime, 0) == 0);
  REQUIRE(robolocks_battle_runner_unit_hull_intent_active(runtime, 0) == 0);
  REQUIRE(robolocks_battle_runner_unit_hull_intent_target_x(runtime, 0) == Catch::Approx(6.0));
  REQUIRE(robolocks_battle_runner_unit_hull_intent_target_y(runtime, 0) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runner_unit_hull_intent_error_deg(runtime, 0) == Catch::Approx(0.0));
  REQUIRE(robolocks_battle_runner_unit_hull_intent_age_ticks(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runner_unit_weapon_intent_active(runtime, 0) == 0);
  REQUIRE(robolocks_battle_runner_unit_weapon_intent_min_hit_chance(runtime, 0) == Catch::Approx(0.0));
  REQUIRE(robolocks_battle_runner_unit_weapon_intent_age_ticks(runtime, 0) == 0);
  REQUIRE(robolocks_battle_runner_unit_id(runtime, 1) == 2);
  REQUIRE(robolocks_battle_runner_unit_x(runtime, 1) == Catch::Approx(33.8));
  REQUIRE(robolocks_battle_runner_unit_y(runtime, 1) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runner_event_count(runtime) == 2);
  REQUIRE(std::string(robolocks_battle_runner_event_code(runtime, 0)) == "weapon_fired");
  REQUIRE(std::string(robolocks_battle_runner_event_code(runtime, 1)) == "weapon_fired");
  REQUIRE(robolocks_battle_runner_projectile_count(runtime) == 2);
  REQUIRE(robolocks_battle_runner_projectile_owner_unit_id(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runner_projectile_x(runtime, 0) > 20.0);
  REQUIRE(robolocks_battle_runner_projectile_radius_m(runtime, 0) == Catch::Approx(0.08));
  REQUIRE(robolocks_battle_runner_projectile_previous_height_m(runtime, 0) == Catch::Approx(1.65));
  REQUIRE(robolocks_battle_runner_projectile_height_m(runtime, 0) == Catch::Approx(1.65));
  REQUIRE(robolocks_battle_runner_action_count(runtime) == 6);
  REQUIRE(robolocks_battle_runner_action_unit_id(runtime, 0) == 1);
  REQUIRE(std::string(robolocks_battle_runner_action_type(runtime, 0)) == "moveTo");
  REQUIRE(std::string(robolocks_battle_runner_action_channel(runtime, 0)) == "mobility");
  REQUIRE(robolocks_battle_runner_action_has_position(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runner_action_position_x(runtime, 0) == Catch::Approx(17.0));
  REQUIRE(robolocks_battle_runner_action_position_y(runtime, 0) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runner_action_has_target(runtime, 0) == 0);
  REQUIRE(std::string(robolocks_battle_runner_action_type(runtime, 1)) == "aimAt");
  REQUIRE(std::string(robolocks_battle_runner_action_channel(runtime, 1)) == "turret");
  REQUIRE(robolocks_battle_runner_action_has_target(runtime, 1) == 1);
  REQUIRE(robolocks_battle_runner_action_target_x(runtime, 1) == Catch::Approx(34.0));
  REQUIRE(robolocks_battle_runner_action_target_y(runtime, 1) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runner_action_unit_id(runtime, 3) == 2);
  REQUIRE(std::string(robolocks_battle_runner_action_type(runtime, 3)) == "moveTo");
  REQUIRE(robolocks_battle_runner_action_unit_id(runtime, 4) == 2);
  REQUIRE(std::string(robolocks_battle_runner_action_type(runtime, 4)) == "aimAt");

  robolocks_battle_runner_run_ticks(runtime, 119);

  REQUIRE(robolocks_battle_runner_tick(runtime) == 120);
  REQUIRE(robolocks_battle_runner_unit_x(runtime, 0) == Catch::Approx(17.0));
  REQUIRE(robolocks_battle_runner_unit_x(runtime, 1) == Catch::Approx(23.0));
  REQUIRE(robolocks_battle_runner_unit_turret_heading_deg(runtime, 1) == Catch::Approx(180.0));
  REQUIRE(robolocks_battle_runner_unit_hull_heading_deg(runtime, 1) == Catch::Approx(180.0));

  robolocks_battle_runner_destroy(runtime);
}

TEST_CASE("C API research runner calls a registered JSON bot callback during step") {
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

  RobolocksBattleRunnerHandle runtime = robolocks_battle_runner_create_research_duel_with_json_bot(1);
  REQUIRE(runtime != nullptr);

  robolocks_battle_runner_step(runtime);

  REQUIRE(g_called_bot_id == 1);
  REQUIRE(g_received_observation.at("selfId") == 1);
  REQUIRE(g_received_observation.at("contacts").size() == 1);
  REQUIRE(robolocks_battle_runner_tick(runtime) == 1);
  REQUIRE(robolocks_battle_runner_action_count(runtime) == 5);
  REQUIRE(std::string(robolocks_battle_runner_action_type(runtime, 0)) == "moveTo");
  REQUIRE(robolocks_battle_runner_action_position_x(runtime, 0) == Catch::Approx(17.0));
  REQUIRE(std::string(robolocks_battle_runner_action_type(runtime, 1)) == "aimAt");
  REQUIRE(robolocks_battle_runner_action_target_x(runtime, 1) == Catch::Approx(34.0));
  REQUIRE(g_release_call_count == 1);
  REQUIRE(g_released_response == g_callback_response.c_str());

  robolocks_battle_runner_destroy(runtime);
  robolocks_battle_runner_set_json_bot_callback(nullptr, nullptr, nullptr);
}
