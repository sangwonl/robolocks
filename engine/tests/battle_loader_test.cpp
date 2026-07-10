#include <catch2/catch_approx.hpp>
#include <catch2/matchers/catch_matchers_exception.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>
#include <catch2/catch_test_macros.hpp>

#include <robolocks/battle_loader.hpp>

#include <filesystem>
#include <fstream>
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
  REQUIRE(config.units.size() == 2);

  REQUIRE(config.units[0].unit_id == robolocks::UnitId{1});
  REQUIRE(config.units[0].team_id == 1);
  REQUIRE(config.units[0].name == "Blue");
  REQUIRE(config.units[0].transform.position.x == Catch::Approx(6.0));
  REQUIRE(config.units[0].transform.position.y == Catch::Approx(12.0));
  REQUIRE(config.units[0].transform.hull_heading_deg == Catch::Approx(0.0));
  REQUIRE(config.units[0].turret.heading_deg == Catch::Approx(0.0));
  REQUIRE(config.units[0].mobility.max_speed_mps == Catch::Approx(6.0));
  REQUIRE(config.units[0].mobility.max_hull_turn_degps == Catch::Approx(120.0));
  REQUIRE(config.units[0].turret.max_turn_degps == Catch::Approx(180.0));
  REQUIRE(config.units[0].weapon.damage == Catch::Approx(25.0));
  REQUIRE(config.units[0].weapon.range_m == Catch::Approx(80.0));
  REQUIRE(config.units[0].weapon.aim_tolerance_deg == Catch::Approx(5.0));
  REQUIRE(config.units[0].weapon.reload_ticks == 30);
  REQUIRE(config.units[0].armor.integrity == Catch::Approx(100.0));
  REQUIRE(config.units[0].body.shape.type == robolocks::BodyShapeType::Box);
  REQUIRE(config.units[0].body.shape.radius_m == Catch::Approx(1.2));
  REQUIRE(config.units[0].body.shape.length_m == Catch::Approx(5.6));
  REQUIRE(config.units[0].body.shape.width_m == Catch::Approx(2.8));
  REQUIRE(config.units[0].body.mass_kg == Catch::Approx(30000.0));
  REQUIRE(config.units[0].sensor.range_m == Catch::Approx(60.0));
  REQUIRE(config.units[0].sensor.fov_deg == Catch::Approx(120.0));
  REQUIRE(config.units[0].sensor.refresh_ticks == 1);

  REQUIRE(config.units[1].unit_id == robolocks::UnitId{2});
  REQUIRE(config.units[1].team_id == 2);
  REQUIRE(config.units[1].name == "Red");
  REQUIRE(config.units[1].transform.position.x == Catch::Approx(34.0));
  REQUIRE(config.units[1].transform.position.y == Catch::Approx(12.0));
  REQUIRE(config.units[1].transform.hull_heading_deg == Catch::Approx(180.0));
  REQUIRE(config.units[1].turret.heading_deg == Catch::Approx(180.0));
  REQUIRE(config.units[1].mobility.max_speed_mps == Catch::Approx(6.0));
  REQUIRE(config.units[1].mobility.max_hull_turn_degps == Catch::Approx(120.0));
  REQUIRE(config.units[1].turret.max_turn_degps == Catch::Approx(180.0));
  REQUIRE(config.units[1].weapon.damage == Catch::Approx(25.0));
  REQUIRE(config.units[1].weapon.range_m == Catch::Approx(80.0));
  REQUIRE(config.units[1].weapon.aim_tolerance_deg == Catch::Approx(5.0));
  REQUIRE(config.units[1].weapon.reload_ticks == 30);
  REQUIRE(config.units[1].armor.integrity == Catch::Approx(100.0));
  REQUIRE(config.units[1].body.shape.type == robolocks::BodyShapeType::Box);
  REQUIRE(config.units[1].body.shape.radius_m == Catch::Approx(1.2));
  REQUIRE(config.units[1].body.shape.length_m == Catch::Approx(5.6));
  REQUIRE(config.units[1].body.shape.width_m == Catch::Approx(2.8));
  REQUIRE(config.units[1].body.mass_kg == Catch::Approx(30000.0));
  REQUIRE(config.units[1].sensor.range_m == Catch::Approx(60.0));
  REQUIRE(config.units[1].sensor.fov_deg == Catch::Approx(120.0));
  REQUIRE(config.units[1].sensor.refresh_ticks == 1);

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

namespace {
const char* kMinimalBattleJson = R"json({
  "battleId": "field_schema_test",
  "seed": 1,
  "tickRate": 30,
  "tickLimit": 9000,
  %FIELD%
  "units": [
    {"unitId": 1, "teamId": 1, "name": "Blue", "spawn": {"x": 0, "y": 0, "headingDeg": 0}, "modules": {}}
  ],
  "controllers": [
    {"unitId": 1, "type": "json_callback"}
  ]
})json";

std::string battle_json_with_field(const std::string& field_fragment) {
  std::string json = kMinimalBattleJson;
  const auto marker = json.find("%FIELD%");
  json.replace(marker, std::string("%FIELD%").size(), field_fragment);
  return json;
}
}  // namespace

TEST_CASE("battle loader parses an explicit play field") {
  const auto loaded = robolocks::load_battle_from_json_string(
    battle_json_with_field(R"json("field": {"min": {"x": -12, "y": -8}, "max": {"x": 52, "y": 32}},)json")
  );
  REQUIRE(loaded.config.bounds.min.x == Catch::Approx(-12.0));
  REQUIRE(loaded.config.bounds.min.y == Catch::Approx(-8.0));
  REQUIRE(loaded.config.bounds.max.x == Catch::Approx(52.0));
  REQUIRE(loaded.config.bounds.max.y == Catch::Approx(32.0));
}

TEST_CASE("battle loader parses a circular play field shape") {
  const auto loaded = robolocks::load_battle_from_json_string(
    battle_json_with_field(R"json("field": {"min": {"x": 0, "y": 0}, "max": {"x": 40, "y": 40}, "shape": {"type": "circle", "center": {"x": 20, "y": 20}, "radiusMeters": 16}},)json")
  );
  REQUIRE(loaded.config.bounds.shape == robolocks::BattleBoundsShape::Circle);
  REQUIRE(loaded.config.bounds.center.x == Catch::Approx(20.0));
  REQUIRE(loaded.config.bounds.center.y == Catch::Approx(20.0));
  REQUIRE(loaded.config.bounds.radius_m == Catch::Approx(16.0));
}

TEST_CASE("battle loader parses a polygon play field shape") {
  const auto loaded = robolocks::load_battle_from_json_string(
    battle_json_with_field(R"json("field": {"min": {"x": 0, "y": 0}, "max": {"x": 40, "y": 32}, "shape": {"type": "polygon", "vertices": [{"x": 20, "y": 2}, {"x": 36, "y": 10}, {"x": 32, "y": 26}, {"x": 8, "y": 26}, {"x": 4, "y": 10}]}},)json")
  );
  REQUIRE(loaded.config.bounds.shape == robolocks::BattleBoundsShape::Polygon);
  REQUIRE(loaded.config.bounds.vertices.size() == 5);
  REQUIRE(loaded.config.bounds.vertices[0].x == Catch::Approx(20.0));
  REQUIRE(loaded.config.bounds.vertices[4].y == Catch::Approx(10.0));
}

TEST_CASE("battle loader falls back to the default field when omitted") {
  const auto loaded = robolocks::load_battle_from_json_string(battle_json_with_field(""));
  REQUIRE(loaded.config.bounds.min.x == Catch::Approx(0.0));
  REQUIRE(loaded.config.bounds.min.y == Catch::Approx(0.0));
  REQUIRE(loaded.config.bounds.max.x == Catch::Approx(40.0));
  REQUIRE(loaded.config.bounds.max.y == Catch::Approx(24.0));
}

TEST_CASE("battle loader rejects a degenerate play field") {
  REQUIRE_THROWS_MATCHES(
    robolocks::load_battle_from_json_string(
      battle_json_with_field(R"json("field": {"min": {"x": 10, "y": 0}, "max": {"x": 10, "y": 24}},)json")
    ),
    std::runtime_error,
    Catch::Matchers::MessageMatches(Catch::Matchers::ContainsSubstring("field.max must be greater than field.min"))
  );
}

TEST_CASE("battle loader reads deathmatch rule and respawn spawn points") {
  const auto fixture_path = std::filesystem::temp_directory_path() / "robolocks_rule_config_test.json";
  {
    std::ofstream fixture(fixture_path);
    fixture << R"json({
  "battleId": "rule_schema_test",
  "seed": 1,
  "tickRate": 30,
  "tickLimit": 9000,
  "rule": {
    "mode": "kill_limit_deathmatch",
    "teamMode": "team",
    "killLimit": 10,
    "timeLimitTicks": 9000,
    "captureZones": [
      {"id": "alpha", "position": {"x": 20, "y": 12}, "radiusMeters": 4, "holdTicks": 300}
    ],
    "respawn": {
      "enabled": true,
      "cooldownTicks": 150,
      "invulnerableTicks": 60,
      "spawnPoints": [
        {"id": "blue_base", "teamId": 1, "position": {"x": 4, "y": 12}, "radiusMeters": 3, "headingDegrees": 0}
      ]
    }
  },
  "units": [
    {"unitId": 1, "teamId": 1, "name": "Blue", "spawn": {"x": 0, "y": 0, "headingDeg": 0}, "modules": {}}
  ],
  "controllers": [
    {"unitId": 1, "type": "json_callback"}
  ]
})json";
  }

  const auto loaded = robolocks::load_battle_from_file(fixture_path.string());

  REQUIRE(loaded.config.rule.mode == robolocks::BattleRuleMode::KillLimitDeathmatch);
  REQUIRE(loaded.config.rule.team_mode == robolocks::BattleTeamMode::Team);
  REQUIRE(loaded.config.rule.kill_limit == 10);
  REQUIRE(loaded.config.rule.time_limit_ticks == 9000);
  REQUIRE(loaded.config.rule.capture_zones.size() == 1);
  REQUIRE(loaded.config.rule.capture_zones[0].id == "alpha");
  REQUIRE(loaded.config.rule.capture_zones[0].position.x == Catch::Approx(20.0));
  REQUIRE(loaded.config.rule.capture_zones[0].radius_m == Catch::Approx(4.0));
  REQUIRE(loaded.config.rule.capture_zones[0].hold_ticks == 300);
  REQUIRE(loaded.config.rule.respawn.enabled);
  REQUIRE(loaded.config.rule.respawn.cooldown_ticks == 150);
  REQUIRE(loaded.config.rule.respawn.invulnerable_ticks == 60);
  REQUIRE(loaded.config.rule.respawn.spawn_points.size() == 1);
  REQUIRE(loaded.config.rule.respawn.spawn_points[0].id == "blue_base");
  REQUIRE(loaded.config.rule.respawn.spawn_points[0].team_id == 1);
  REQUIRE(loaded.config.rule.respawn.spawn_points[0].position.x == Catch::Approx(4.0));
  REQUIRE(loaded.config.rule.respawn.spawn_points[0].radius_m == Catch::Approx(3.0));
  REQUIRE(loaded.config.rule.respawn.spawn_points[0].heading_deg == Catch::Approx(0.0));
}

TEST_CASE("battle loader accepts units as the battle unit list") {
  const auto fixture_path = std::filesystem::temp_directory_path() / "robolocks_units_battle_config_test.json";
  {
    std::ofstream fixture(fixture_path);
    fixture << R"json({
  "battleId": "units_schema_test",
  "seed": 1,
  "tickRate": 30,
  "tickLimit": 60,
  "units": [
    {
      "unitId": 1,
      "name": "Blue",
      "spawn": {"x": 6.0, "y": 12.0, "headingDeg": 45.0}
    }
  ],
  "controllers": []
})json";
  }

  const auto loaded = robolocks::load_battle_from_file(fixture_path.string());

  REQUIRE(loaded.config.units.size() == 1);
  REQUIRE(loaded.config.units[0].unit_id == robolocks::UnitId{1});
  REQUIRE(loaded.config.units[0].name == "Blue");
  REQUIRE(loaded.config.units[0].transform.position.x == Catch::Approx(6.0));
  REQUIRE(loaded.config.units[0].transform.position.y == Catch::Approx(12.0));
  REQUIRE(loaded.config.units[0].transform.hull_heading_deg == Catch::Approx(45.0));
}

TEST_CASE("battle loader resolves module specs from catalog ids and applies inline overrides") {
  const auto fixture_path = std::string(ROBOLOCKS_SOURCE_DIR) + "/fixtures/matches/catalog_duel_v0.json";
  const auto loaded = robolocks::load_battle_from_file(fixture_path);
  const auto& config = loaded.config;

  REQUIRE(config.battle_id == "catalog_duel_v0");
  REQUIRE(config.units.size() == 2);

  REQUIRE(config.units[0].mobility.max_speed_mps == Catch::Approx(6.0));
  REQUIRE(config.units[0].mobility.max_hull_turn_degps == Catch::Approx(120.0));
  REQUIRE(config.units[0].turret.max_turn_degps == Catch::Approx(180.0));
  REQUIRE(config.units[0].weapon.damage == Catch::Approx(25.0));
  REQUIRE(config.units[0].weapon.reload_ticks == 30);
  REQUIRE(config.units[0].body.shape.type == robolocks::BodyShapeType::Box);
  REQUIRE(config.units[0].body.shape.length_m == Catch::Approx(5.6));
  REQUIRE(config.units[0].sensor.fov_deg == Catch::Approx(120.0));

  REQUIRE(config.units[1].mobility.max_speed_mps == Catch::Approx(3.0));
  REQUIRE(config.units[1].mobility.max_hull_turn_degps == Catch::Approx(60.0));
  REQUIRE(config.units[1].weapon.fire_mode == robolocks::WeaponFireMode::Ballistic);
  REQUIRE(config.units[1].weapon.launch_angle_deg == Catch::Approx(45.0));
  REQUIRE(config.units[1].weapon.gravity_mps2 == Catch::Approx(9.81));
  REQUIRE(config.units[1].weapon.blast_radius_m == Catch::Approx(2.5));
  REQUIRE(config.units[1].weapon.reload_ticks == 45);
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
