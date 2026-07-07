#include <catch2/catch_approx.hpp>
#include <catch2/matchers/catch_matchers_exception.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>
#include <catch2/catch_test_macros.hpp>

#include <robolocks/battle_loader.hpp>

#include <string>

TEST_CASE("battle loader reads preset duel fixture into battle config") {
  const auto fixture_path = std::string(ROBOLOCKS_SOURCE_DIR) + "/fixtures/matches/preset_duel_v0.json";
  const auto loaded = robolocks::load_battle_from_file(fixture_path);
  const auto& config = loaded.config;

  REQUIRE(config.battle_id == "preset_duel_v0");
  REQUIRE(config.seed == 1);
  REQUIRE(config.tick_dt_sec == Catch::Approx(1.0 / 30.0));
  REQUIRE(config.tick_limit == 9000);
  REQUIRE(config.obstacles.size() == 1);
  REQUIRE(config.obstacles[0].id == "north_cover");
  REQUIRE(config.obstacles[0].position.x == Catch::Approx(20.0));
  REQUIRE(config.obstacles[0].position.y == Catch::Approx(6.0));
  REQUIRE(config.obstacles[0].radius_m == Catch::Approx(1.5));
  REQUIRE(config.obstacles[0].blocks_movement);
  REQUIRE(config.obstacles[0].blocks_line_of_sight);
  REQUIRE(config.tanks.size() == 2);

  REQUIRE(config.tanks[0].unit_id == robolocks::UnitId{1});
  REQUIRE(config.tanks[0].name == "Blue");
  REQUIRE(config.tanks[0].transform.position.x == Catch::Approx(6.0));
  REQUIRE(config.tanks[0].transform.position.y == Catch::Approx(12.0));
  REQUIRE(config.tanks[0].transform.hull_heading_deg == Catch::Approx(0.0));
  REQUIRE(config.tanks[0].turret.heading_deg == Catch::Approx(0.0));
  REQUIRE(config.tanks[0].mobility.max_speed_mps == Catch::Approx(6.0));
  REQUIRE(config.tanks[0].mobility.max_hull_turn_degps == Catch::Approx(120.0));
  REQUIRE(config.tanks[0].turret.max_turn_degps == Catch::Approx(180.0));
  REQUIRE(config.tanks[0].weapon.damage == Catch::Approx(25.0));
  REQUIRE(config.tanks[0].weapon.range_m == Catch::Approx(80.0));
  REQUIRE(config.tanks[0].weapon.aim_tolerance_deg == Catch::Approx(5.0));
  REQUIRE(config.tanks[0].weapon.reload_ticks == 30);
  REQUIRE(config.tanks[0].armor.integrity == Catch::Approx(100.0));
  REQUIRE(config.tanks[0].body.shape.type == robolocks::BodyShapeType::Box);
  REQUIRE(config.tanks[0].body.shape.radius_m == Catch::Approx(1.2));
  REQUIRE(config.tanks[0].body.shape.length_m == Catch::Approx(5.6));
  REQUIRE(config.tanks[0].body.shape.width_m == Catch::Approx(2.8));
  REQUIRE(config.tanks[0].body.mass_kg == Catch::Approx(30000.0));
  REQUIRE(config.tanks[0].sensor.range_m == Catch::Approx(60.0));
  REQUIRE(config.tanks[0].sensor.fov_deg == Catch::Approx(120.0));
  REQUIRE(config.tanks[0].sensor.refresh_ticks == 1);

  REQUIRE(config.tanks[1].unit_id == robolocks::UnitId{2});
  REQUIRE(config.tanks[1].name == "Red");
  REQUIRE(config.tanks[1].transform.position.x == Catch::Approx(34.0));
  REQUIRE(config.tanks[1].transform.position.y == Catch::Approx(12.0));
  REQUIRE(config.tanks[1].transform.hull_heading_deg == Catch::Approx(180.0));
  REQUIRE(config.tanks[1].turret.heading_deg == Catch::Approx(180.0));
  REQUIRE(config.tanks[1].mobility.max_speed_mps == Catch::Approx(6.0));
  REQUIRE(config.tanks[1].mobility.max_hull_turn_degps == Catch::Approx(120.0));
  REQUIRE(config.tanks[1].turret.max_turn_degps == Catch::Approx(180.0));
  REQUIRE(config.tanks[1].weapon.damage == Catch::Approx(25.0));
  REQUIRE(config.tanks[1].weapon.range_m == Catch::Approx(80.0));
  REQUIRE(config.tanks[1].weapon.aim_tolerance_deg == Catch::Approx(5.0));
  REQUIRE(config.tanks[1].weapon.reload_ticks == 30);
  REQUIRE(config.tanks[1].armor.integrity == Catch::Approx(100.0));
  REQUIRE(config.tanks[1].body.shape.type == robolocks::BodyShapeType::Box);
  REQUIRE(config.tanks[1].body.shape.radius_m == Catch::Approx(1.2));
  REQUIRE(config.tanks[1].body.shape.length_m == Catch::Approx(5.6));
  REQUIRE(config.tanks[1].body.shape.width_m == Catch::Approx(2.8));
  REQUIRE(config.tanks[1].body.mass_kg == Catch::Approx(30000.0));
  REQUIRE(config.tanks[1].sensor.range_m == Catch::Approx(60.0));
  REQUIRE(config.tanks[1].sensor.fov_deg == Catch::Approx(120.0));
  REQUIRE(config.tanks[1].sensor.refresh_ticks == 1);

  REQUIRE(loaded.controllers.size() == 2);
  REQUIRE(loaded.controllers[0].unit_id == robolocks::UnitId{1});
  REQUIRE(loaded.controllers[0].type == "builtin");
  REQUIRE(loaded.controllers[0].id == "hold_line");
  REQUIRE(loaded.controllers[0].hold_position.x == Catch::Approx(17.0));
  REQUIRE(loaded.controllers[0].hold_position.y == Catch::Approx(12.0));

  REQUIRE(loaded.controllers[1].unit_id == robolocks::UnitId{2});
  REQUIRE(loaded.controllers[1].type == "builtin");
  REQUIRE(loaded.controllers[1].id == "hold_line");
  REQUIRE(loaded.controllers[1].hold_position.x == Catch::Approx(23.0));
  REQUIRE(loaded.controllers[1].hold_position.y == Catch::Approx(12.0));
}

TEST_CASE("battle loader reads python controller paths") {
  const auto fixture_path = std::string(ROBOLOCKS_SOURCE_DIR) + "/fixtures/matches/preset_duel_python_v0.json";
  const auto loaded = robolocks::load_battle_from_file(fixture_path);

  REQUIRE(loaded.controllers.size() == 2);
  REQUIRE(loaded.controllers[0].unit_id == robolocks::UnitId{1});
  REQUIRE(loaded.controllers[0].type == "python");
  REQUIRE(loaded.controllers[0].path == "../../examples/bots/hold_line_blue.py");
  REQUIRE(loaded.controllers[0].resolved_path.ends_with("examples/bots/hold_line_blue.py"));

  REQUIRE(loaded.controllers[1].unit_id == robolocks::UnitId{2});
  REQUIRE(loaded.controllers[1].type == "python");
  REQUIRE(loaded.controllers[1].path == "../../examples/bots/hold_line_blue.py");
  REQUIRE(loaded.controllers[1].resolved_path.ends_with("examples/bots/hold_line_blue.py"));
}

TEST_CASE("battle loader resolves module specs from catalog ids and applies inline overrides") {
  const auto fixture_path = std::string(ROBOLOCKS_SOURCE_DIR) + "/fixtures/matches/catalog_duel_v0.json";
  const auto loaded = robolocks::load_battle_from_file(fixture_path);
  const auto& config = loaded.config;

  REQUIRE(config.battle_id == "catalog_duel_v0");
  REQUIRE(config.tanks.size() == 2);

  REQUIRE(config.tanks[0].mobility.max_speed_mps == Catch::Approx(6.0));
  REQUIRE(config.tanks[0].mobility.max_hull_turn_degps == Catch::Approx(120.0));
  REQUIRE(config.tanks[0].turret.max_turn_degps == Catch::Approx(180.0));
  REQUIRE(config.tanks[0].weapon.damage == Catch::Approx(25.0));
  REQUIRE(config.tanks[0].weapon.reload_ticks == 30);
  REQUIRE(config.tanks[0].body.shape.type == robolocks::BodyShapeType::Box);
  REQUIRE(config.tanks[0].body.shape.length_m == Catch::Approx(5.6));
  REQUIRE(config.tanks[0].sensor.fov_deg == Catch::Approx(120.0));

  REQUIRE(config.tanks[1].mobility.max_speed_mps == Catch::Approx(3.0));
  REQUIRE(config.tanks[1].mobility.max_hull_turn_degps == Catch::Approx(60.0));
  REQUIRE(config.tanks[1].weapon.fire_mode == robolocks::WeaponFireMode::Ballistic);
  REQUIRE(config.tanks[1].weapon.launch_angle_deg == Catch::Approx(45.0));
  REQUIRE(config.tanks[1].weapon.gravity_mps2 == Catch::Approx(9.81));
  REQUIRE(config.tanks[1].weapon.blast_radius_m == Catch::Approx(2.5));
  REQUIRE(config.tanks[1].weapon.reload_ticks == 45);
}

TEST_CASE("battle loader rejects unknown catalog module ids") {
  const auto fixture_path = std::string(ROBOLOCKS_SOURCE_DIR)
    + "/fixtures/matches/invalid_unknown_module_v0.json";

  REQUIRE_THROWS_MATCHES(
    robolocks::load_battle_from_file(fixture_path),
    std::runtime_error,
    Catch::Matchers::MessageMatches(Catch::Matchers::ContainsSubstring("Unknown mobility module id: missing_chassis"))
  );
}

TEST_CASE("battle loader rejects implicit body shape schema") {
  const auto fixture_path = std::string(ROBOLOCKS_SOURCE_DIR)
    + "/fixtures/matches/invalid_implicit_body_shape_v0.json";

  REQUIRE_THROWS_MATCHES(
    robolocks::load_battle_from_file(fixture_path),
    std::runtime_error,
    Catch::Matchers::MessageMatches(Catch::Matchers::ContainsSubstring("Expected modules.body.shape object"))
  );
}
