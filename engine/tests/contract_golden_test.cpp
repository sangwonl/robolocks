#include <catch2/catch_test_macros.hpp>

#include <robolocks/controller_protocol_json.hpp>
#include <robolocks/observation.hpp>
#include <robolocks/order.hpp>
#include <robolocks/snapshot.hpp>
#include <robolocks/snapshot_json.hpp>

#include <nlohmann/json.hpp>

#include <cstdlib>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

// Golden fixture contract test.
//
// A single fully-populated, deliberately non-default canonical frame and
// observation are serialized through the engine's shared serializers and pinned
// against checked-in golden JSON files under fixtures/contracts/. The same two
// files are asserted against by the Python SDK (sdk/python/tests/test_contract.py)
// and the web replay parser (web/tests/contract.test.mjs), so a schema change
// only has to be re-blessed once and every stale mirror lights up.
//
// Re-bless workflow: set WRITE_GOLDEN=1 (the value must be exactly "1") in the
// environment and run this test once. The two goldens are overwritten from
// the live serializer output and a conspicuous WARN is printed to stderr;
// commit the result. In normal mode (no env var, or any value other than
// "1") the test asserts serializer output equals the goldens byte-for-value.

namespace {

const std::string kContractDir = std::string(ROBOLOCKS_SOURCE_DIR) + "/fixtures/contracts";
const std::string kFrameGoldenPath = kContractDir + "/frame.golden.json";
const std::string kObservationGoldenPath = kContractDir + "/observation.golden.json";

std::string read_file(const std::string& path) {
  std::ifstream stream(path);
  if (!stream) {
    return {};
  }
  std::ostringstream buffer;
  buffer << stream.rdbuf();
  return buffer.str();
}

void write_file(const std::string& path, const std::string& contents) {
  std::ofstream stream(path);
  stream << contents;
  stream << "\n";
}

robolocks::UnitModulesSnapshot make_blue_modules() {
  robolocks::UnitModulesSnapshot modules;
  modules.mobility.id = "tracked_chassis_mk2";
  modules.mobility.max_speed_mps = 7.5;
  modules.mobility.max_hull_turn_degps = 95.0;
  modules.turret.id = "heavy_turret_mk2";
  modules.turret.heading_deg = 47.0;
  modules.turret.max_turn_degps = 140.0;
  modules.weapon.id = "cannon_88mm_mk2";
  modules.weapon.fire_mode = robolocks::WeaponFireMode::Ballistic;
  modules.weapon.damage = 42.0;
  modules.weapon.penetration_mm = 132.0;
  modules.weapon.range_m = 96.0;
  modules.weapon.muzzle_velocity_mps = 780.0;
  modules.weapon.muzzle_offset_m = robolocks::Vec3{3.6, 0.2, 1.65};
  modules.weapon.launch_angle_deg = 3.5;
  modules.weapon.gravity_mps2 = 9.81;
  modules.weapon.blast_radius_m = 2.25;
  modules.weapon.projectile_radius_m = 0.08;
  modules.weapon.aim_tolerance_deg = 4.5;
  modules.weapon.reload_ticks = 72;
  modules.armor.id = "composite_armor_mk2";
  modules.armor.integrity = 88.5;
  modules.armor.front_mm = 120.0;
  modules.armor.side_mm = 70.0;
  modules.armor.rear_mm = 45.0;
  modules.body.id = "heavy_hull_mk2";
  modules.body.mass_kg = 42000.0;
  modules.body.shape.type = robolocks::BodyShapeType::Box;
  modules.body.shape.radius_m = 1.2;
  modules.body.shape.length_m = 6.4;
  modules.body.shape.width_m = 3.1;
  modules.sensor.id = "radar_optic_mk2";
  modules.sensor.range_m = 640.0;
  modules.sensor.fov_deg = 220.0;
  modules.sensor.refresh_ticks = 3;
  return modules;
}

robolocks::UnitSnapshot make_blue_unit() {
  robolocks::UnitSnapshot unit;
  unit.unit_id = robolocks::UnitId{1};
  unit.team_id = 1;
  unit.name = "blue_vanguard";
  unit.position = robolocks::Vec2{12.5, 7.25};
  unit.hull_heading_deg = 33.0;
  unit.turret_heading_deg = 47.0;
  unit.armor_integrity = 88.5;
  unit.weapon_cooldown_ticks = 4;
  unit.body_shape_type = robolocks::BodyShapeType::Box;
  unit.body_radius_m = 1.2;
  unit.body_length_m = 6.4;
  unit.body_width_m = 3.1;
  unit.modules = make_blue_modules();
  unit.mobility_intent.active = true;
  unit.mobility_intent.target = robolocks::Vec2{24.0, 14.0};
  unit.mobility_intent.remaining_m = 18.5;
  unit.mobility_intent.age_ticks = 12;
  unit.turret_intent.active = true;
  unit.turret_intent.target = robolocks::Vec2{28.0, 16.5};
  unit.turret_intent.error_deg = 6.5;
  unit.turret_intent.age_ticks = 8;
  unit.hull_intent.active = true;
  unit.hull_intent.target = robolocks::Vec2{22.0, 10.0};
  unit.hull_intent.error_deg = 11.0;
  unit.hull_intent.age_ticks = 5;
  unit.weapon_intent.active = true;
  unit.weapon_intent.min_hit_chance = 0.65;
  unit.weapon_intent.age_ticks = 3;
  return unit;
}

robolocks::UnitSnapshot make_red_unit() {
  robolocks::UnitSnapshot unit;
  unit.unit_id = robolocks::UnitId{2};
  unit.team_id = 2;
  unit.name = "red_marauder";
  unit.position = robolocks::Vec2{28.0, 16.5};
  unit.hull_heading_deg = 190.0;
  unit.turret_heading_deg = 205.0;
  unit.armor_integrity = 62.0;
  unit.weapon_cooldown_ticks = 12;
  unit.body_shape_type = robolocks::BodyShapeType::Circle;
  unit.body_radius_m = 1.4;
  unit.body_length_m = 5.6;
  unit.body_width_m = 2.8;
  unit.modules = make_blue_modules();
  unit.modules.mobility.id = "wheeled_chassis_mk1";
  unit.modules.turret.id = "light_turret_mk1";
  unit.modules.turret.heading_deg = 205.0;
  unit.modules.weapon.id = "autocannon_40mm_mk1";
  unit.modules.weapon.fire_mode = robolocks::WeaponFireMode::Direct;
  unit.modules.body.id = "medium_hull_mk1";
  unit.modules.body.shape.type = robolocks::BodyShapeType::Circle;
  unit.modules.body.shape.radius_m = 1.4;
  unit.modules.body.shape.length_m = 0.0;
  unit.modules.body.shape.width_m = 0.0;
  return unit;
}

robolocks::ProjectileSnapshot make_projectile() {
  robolocks::ProjectileSnapshot projectile;
  projectile.projectile_id = 7;
  projectile.owner_unit_id = robolocks::UnitId{1};
  projectile.previous_position = robolocks::Vec2{13.0, 7.5};
  projectile.position = robolocks::Vec2{14.2, 7.9};
  projectile.radius_m = 0.08;
  projectile.previous_height_m = 1.1;
  projectile.height_m = 1.3;
  return projectile;
}

robolocks::WorldSnapshot make_snapshot() {
  robolocks::WorldSnapshot snapshot;
  snapshot.tick = 42;
  snapshot.units.push_back(make_blue_unit());
  snapshot.units.push_back(make_red_unit());
  snapshot.projectiles.push_back(make_projectile());
  return snapshot;
}

std::vector<robolocks::Event> make_events() {
  robolocks::Event event;
  event.tick = 42;
  event.unit_id = robolocks::UnitId{2};
  event.code = "armor_penetrated";
  event.message = "Projectile penetrated side armor.";
  event.payload.projectile_id = 7;
  event.payload.source_unit_id = robolocks::UnitId{1};
  event.payload.target_unit_id = robolocks::UnitId{2};
  event.payload.source_team_id = 1;
  event.payload.target_team_id = 2;
  event.payload.damage_type = "direct";
  event.payload.armor_facing = "side";
  event.payload.damage = 42.0;
  event.payload.remaining_armor = 62.0;
  event.payload.penetration_mm = 132.0;
  event.payload.armor_mm = 70.0;
  event.payload.impact_distance_m = 15.5;
  event.payload.blast_radius_m = 2.25;
  return {event};
}

std::vector<robolocks::UnitOrders> make_orders() {
  robolocks::UnitOrders blue;
  blue.unit_id = robolocks::UnitId{1};
  blue.orders.push_back(robolocks::Order{
    .kind = robolocks::OrderKind::AimAt,
    .payload = robolocks::AimAtOrder{robolocks::Vec2{28.0, 16.5}},
  });
  blue.orders.push_back(robolocks::Order{
    .kind = robolocks::OrderKind::FireIfSolution,
    .payload = robolocks::FireIfSolutionOrder{0.65},
  });
  blue.orders.push_back(robolocks::Order{
    .kind = robolocks::OrderKind::ScanArc,
    .payload = robolocks::ScanArcOrder{
      .direction_deg = 90.0,
      .width_deg = 120.0,
      .range_m = 55.0,
    },
  });

  robolocks::UnitOrders red;
  red.unit_id = robolocks::UnitId{2};
  red.orders.push_back(robolocks::Order{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::MoveToOrder{robolocks::Vec2{24.0, 14.0}},
  });

  return {blue, red};
}

robolocks::BattleRuleState make_rule_state() {
  robolocks::BattleRuleState rule_state;
  rule_state.scores.push_back(robolocks::BattleScore{
    .unit_id = robolocks::UnitId{1},
    .team_id = 1,
    .kills = 1,
    .deaths = 0,
    .damage_dealt = 42.0,
  });
  rule_state.scores.push_back(robolocks::BattleScore{
    .unit_id = robolocks::UnitId{2},
    .team_id = 2,
    .kills = 0,
    .deaths = 1,
    .damage_dealt = 12.5,
  });
  robolocks::CaptureZoneState zone;
  zone.id = "center";
  zone.position = robolocks::Vec2{20.0, 12.0};
  zone.radius_m = 3.5;
  zone.hold_ticks_required = 300;
  zone.held_ticks = 120;
  zone.owner_unit_id = robolocks::UnitId{1};
  zone.owner_team_id = 1;
  zone.contested = true;
  rule_state.capture_zones.push_back(zone);
  rule_state.outcome.finished = true;
  rule_state.outcome.reason = "kill_limit";
  rule_state.outcome.winner_unit_id = robolocks::UnitId{1};
  rule_state.outcome.winner_team_id = 1;
  return rule_state;
}

robolocks::StaticObstacle make_cover_obstacle() {
  robolocks::StaticObstacle obstacle;
  obstacle.id = "north_cover";
  obstacle.position = robolocks::Vec2{18.0, 20.0};
  obstacle.radius_m = 2.5;
  obstacle.blocks_movement = false;
  obstacle.blocks_line_of_sight = false;
  return obstacle;
}

robolocks::StaticObstacle make_wall_obstacle() {
  robolocks::StaticObstacle obstacle;
  obstacle.id = "south_wall";
  obstacle.position = robolocks::Vec2{10.0, 4.0};
  obstacle.radius_m = 1.75;
  obstacle.blocks_movement = false;
  obstacle.blocks_line_of_sight = false;
  return obstacle;
}

robolocks::ContactObservation make_enemy_contact() {
  robolocks::ContactObservation contact;
  contact.unit_id = robolocks::UnitId{2};
  contact.team_id = 2;
  contact.is_enemy = true;
  contact.position = robolocks::Vec2{28.0, 16.5};
  contact.hull_heading_deg = 190.0;
  contact.turret_heading_deg = 205.0;
  contact.armor_integrity = 62.0;
  contact.weapon_cooldown_ticks = 12;
  contact.body_shape_type = robolocks::BodyShapeType::Circle;
  contact.body_radius_m = 1.4;
  contact.body_length_m = 5.6;
  contact.body_width_m = 2.8;
  return contact;
}

robolocks::Observation make_observation() {
  robolocks::Observation observation;
  observation.tick = 42;
  observation.self_id = robolocks::UnitId{1};
  observation.self = make_blue_unit();
  observation.contacts.units.push_back(make_enemy_contact());
  observation.contacts.obstacles.push_back(make_cover_obstacle());
  observation.contacts.projectiles.push_back(make_projectile());
  observation.obstacles.push_back(make_cover_obstacle());
  observation.obstacles.push_back(make_wall_obstacle());
  return observation;
}

nlohmann::ordered_json canonical_frame() {
  const auto rule_state = make_rule_state();
  return robolocks::frame_to_json(make_snapshot(), make_events(), make_orders(), &rule_state);
}

nlohmann::json canonical_observation() {
  return robolocks::observation_to_json(make_observation());
}

}  // namespace

TEST_CASE("canonical frame and observation match the checked-in goldens") {
  const auto frame = canonical_frame();
  const auto observation = canonical_observation();

  const char* write_golden_env = std::getenv("WRITE_GOLDEN");
  if (write_golden_env != nullptr && std::string(write_golden_env) == "1") {
    std::cerr << "\n"
              << "!!! WARN: WRITE_GOLDEN=1 -- re-blessing checked-in golden fixtures !!!\n"
              << "    " << kFrameGoldenPath << "\n"
              << "    " << kObservationGoldenPath << "\n"
              << "    Overwritten from live serializer output. Review the diff and commit.\n"
              << std::endl;
    write_file(kFrameGoldenPath, frame.dump(2));
    write_file(kObservationGoldenPath, observation.dump(2));
    SUCCEED("Golden fixtures re-blessed from live serializer output.");
    return;
  }

  const auto frame_golden = read_file(kFrameGoldenPath);
  const auto observation_golden = read_file(kObservationGoldenPath);
  REQUIRE_FALSE(frame_golden.empty());
  REQUIRE_FALSE(observation_golden.empty());

  // frame_to_json returns ordered_json and observation_to_json returns json;
  // parse each golden with the matching type so operator== does a value compare.
  REQUIRE(frame == nlohmann::ordered_json::parse(frame_golden));
  REQUIRE(observation == nlohmann::json::parse(observation_golden));
}
