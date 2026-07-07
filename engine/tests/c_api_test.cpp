#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <robolocks/c_api.h>

#include <string>

TEST_CASE("C API drives the battle runtime and exposes snapshots") {
  RobolocksBattleRuntimeHandle runtime = robolocks_battle_runtime_create_preset_duel();
  REQUIRE(runtime != nullptr);

  REQUIRE(robolocks_battle_runtime_tick(runtime) == 0);
  REQUIRE(robolocks_battle_runtime_unit_count(runtime) == 2);
  REQUIRE(robolocks_battle_runtime_obstacle_count(runtime) == 1);
  REQUIRE(std::string(robolocks_battle_runtime_obstacle_id(runtime, 0)) == "north_cover");
  REQUIRE(robolocks_battle_runtime_obstacle_x(runtime, 0) == Catch::Approx(20.0));
  REQUIRE(robolocks_battle_runtime_obstacle_y(runtime, 0) == Catch::Approx(6.0));
  REQUIRE(robolocks_battle_runtime_obstacle_radius_m(runtime, 0) == Catch::Approx(1.5));
  REQUIRE(robolocks_battle_runtime_obstacle_blocks_movement(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runtime_obstacle_blocks_line_of_sight(runtime, 0) == 1);

  robolocks_battle_runtime_step(runtime);

  REQUIRE(robolocks_battle_runtime_tick(runtime) == 1);
  REQUIRE(robolocks_battle_runtime_unit_id(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runtime_unit_x(runtime, 0) == Catch::Approx(6.2));
  REQUIRE(robolocks_battle_runtime_unit_y(runtime, 0) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runtime_unit_turret_heading_deg(runtime, 0) == Catch::Approx(0.0));
  REQUIRE(robolocks_battle_runtime_unit_hull_heading_deg(runtime, 0) == Catch::Approx(0.0));
  REQUIRE(robolocks_battle_runtime_unit_weapon_cooldown_ticks(runtime, 0) == 30);
  REQUIRE(robolocks_battle_runtime_unit_body_shape_type(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runtime_unit_body_radius_m(runtime, 0) == Catch::Approx(1.2));
  REQUIRE(robolocks_battle_runtime_unit_mobility_intent_active(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runtime_unit_mobility_intent_target_x(runtime, 0) == Catch::Approx(17.0));
  REQUIRE(robolocks_battle_runtime_unit_mobility_intent_target_y(runtime, 0) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runtime_unit_mobility_intent_remaining_m(runtime, 0) == Catch::Approx(10.8));
  REQUIRE(robolocks_battle_runtime_unit_mobility_intent_age_ticks(runtime, 0) == 0);
  REQUIRE(robolocks_battle_runtime_unit_turret_intent_active(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runtime_unit_turret_intent_target_x(runtime, 0) == Catch::Approx(34.0));
  REQUIRE(robolocks_battle_runtime_unit_turret_intent_target_y(runtime, 0) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runtime_unit_turret_intent_error_deg(runtime, 0) == Catch::Approx(0.0));
  REQUIRE(robolocks_battle_runtime_unit_turret_intent_age_ticks(runtime, 0) == 0);
  REQUIRE(robolocks_battle_runtime_unit_hull_intent_active(runtime, 0) == 0);
  REQUIRE(robolocks_battle_runtime_unit_hull_intent_target_x(runtime, 0) == Catch::Approx(6.0));
  REQUIRE(robolocks_battle_runtime_unit_hull_intent_target_y(runtime, 0) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runtime_unit_hull_intent_error_deg(runtime, 0) == Catch::Approx(0.0));
  REQUIRE(robolocks_battle_runtime_unit_hull_intent_age_ticks(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runtime_unit_weapon_intent_active(runtime, 0) == 0);
  REQUIRE(robolocks_battle_runtime_unit_weapon_intent_min_hit_chance(runtime, 0) == Catch::Approx(0.0));
  REQUIRE(robolocks_battle_runtime_unit_weapon_intent_age_ticks(runtime, 0) == 0);
  REQUIRE(robolocks_battle_runtime_unit_id(runtime, 1) == 2);
  REQUIRE(robolocks_battle_runtime_unit_x(runtime, 1) == Catch::Approx(33.8));
  REQUIRE(robolocks_battle_runtime_unit_y(runtime, 1) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runtime_event_count(runtime) == 4);
  REQUIRE(std::string(robolocks_battle_runtime_event_code(runtime, 0)) == "weapon_fired");
  REQUIRE(std::string(robolocks_battle_runtime_event_code(runtime, 1)) == "armor_damage");
  REQUIRE(robolocks_battle_runtime_action_count(runtime) == 6);
  REQUIRE(robolocks_battle_runtime_action_unit_id(runtime, 0) == 1);
  REQUIRE(std::string(robolocks_battle_runtime_action_type(runtime, 0)) == "moveTo");
  REQUIRE(std::string(robolocks_battle_runtime_action_channel(runtime, 0)) == "mobility");
  REQUIRE(robolocks_battle_runtime_action_has_position(runtime, 0) == 1);
  REQUIRE(robolocks_battle_runtime_action_position_x(runtime, 0) == Catch::Approx(17.0));
  REQUIRE(robolocks_battle_runtime_action_position_y(runtime, 0) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runtime_action_has_target(runtime, 0) == 0);
  REQUIRE(std::string(robolocks_battle_runtime_action_type(runtime, 1)) == "aimAt");
  REQUIRE(std::string(robolocks_battle_runtime_action_channel(runtime, 1)) == "turret");
  REQUIRE(robolocks_battle_runtime_action_has_target(runtime, 1) == 1);
  REQUIRE(robolocks_battle_runtime_action_target_x(runtime, 1) == Catch::Approx(34.0));
  REQUIRE(robolocks_battle_runtime_action_target_y(runtime, 1) == Catch::Approx(12.0));
  REQUIRE(robolocks_battle_runtime_action_unit_id(runtime, 3) == 2);
  REQUIRE(std::string(robolocks_battle_runtime_action_type(runtime, 3)) == "moveTo");
  REQUIRE(robolocks_battle_runtime_action_unit_id(runtime, 4) == 2);
  REQUIRE(std::string(robolocks_battle_runtime_action_type(runtime, 4)) == "aimAt");

  robolocks_battle_runtime_run_ticks(runtime, 119);

  REQUIRE(robolocks_battle_runtime_tick(runtime) == 120);
  REQUIRE(robolocks_battle_runtime_unit_x(runtime, 0) == Catch::Approx(17.0));
  REQUIRE(robolocks_battle_runtime_unit_x(runtime, 1) == Catch::Approx(23.0));
  REQUIRE(robolocks_battle_runtime_unit_turret_heading_deg(runtime, 1) == Catch::Approx(180.0));
  REQUIRE(robolocks_battle_runtime_unit_hull_heading_deg(runtime, 1) == Catch::Approx(180.0));

  robolocks_battle_runtime_destroy(runtime);
}
