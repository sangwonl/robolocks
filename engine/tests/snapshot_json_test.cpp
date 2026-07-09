#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <robolocks/snapshot_json.hpp>

#include <nlohmann/json.hpp>

namespace {

robolocks::UnitSnapshot make_unit() {
  robolocks::UnitSnapshot unit;
  unit.unit_id = robolocks::UnitId{1};
  unit.team_id = 1;
  unit.name = "blue_1";
  unit.position = robolocks::Vec2{4.0, 12.0};
  unit.hull_heading_deg = 10.0;
  unit.turret_heading_deg = 20.0;
  unit.armor_integrity = 95.0;
  unit.weapon_cooldown_ticks = 5;
  unit.body_shape_type = robolocks::BodyShapeType::Box;
  unit.body_radius_m = 1.2;
  unit.body_length_m = 5.6;
  unit.body_width_m = 2.8;
  unit.modules.mobility.id = "tracked_chassis_mk1";
  unit.modules.turret.id = "light_turret_mk1";
  unit.modules.turret.heading_deg = 20.0;
  unit.modules.weapon.id = "cannon_75mm_mk1";
  unit.modules.weapon.fire_mode = robolocks::WeaponFireMode::Direct;
  unit.modules.armor.id = "rolled_armor_mk1";
  unit.modules.body.id = "medium_hull_mk1";
  unit.modules.sensor.id = "visual_optic_mk1";
  unit.mobility_intent.active = true;
  unit.mobility_intent.target = robolocks::Vec2{20.0, 12.0};
  unit.mobility_intent.remaining_m = 16.0;
  return unit;
}

}  // namespace

TEST_CASE("snapshot_to_json emits the frame schema") {
  robolocks::WorldSnapshot snapshot;
  snapshot.tick = 7;
  snapshot.units.push_back(make_unit());
  snapshot.projectiles.push_back(robolocks::ProjectileSnapshot{
    .projectile_id = 3,
    .owner_unit_id = robolocks::UnitId{1},
    .position = robolocks::Vec2{5.0, 12.0},
  });

  const auto frame = robolocks::snapshot_to_json(snapshot);

  REQUIRE(frame.at("tick") == snapshot.tick);
  REQUIRE(frame.at("units").at(0).at("unitId") == 1);
  REQUIRE(frame.at("units").at(0).at("name") == "blue_1");
  REQUIRE(frame.at("units").at(0).at("teamId") == 1);
  REQUIRE(frame.at("units").at(0).at("weaponCooldownTicks") == 5);
  REQUIRE(frame.at("units").at(0).at("bodyShape").at("type") == "box");
  REQUIRE(frame.at("units").at(0).at("modules").at("mobility").at("id") == "tracked_chassis_mk1");
  REQUIRE(frame.at("units").at(0).at("modules").at("turret").contains("headingDegrees"));
  REQUIRE(frame.at("units").at(0).at("intents").at("mobility").at("active") == true);
  REQUIRE(frame.at("units").at(0).at("intents").contains("hull"));
  REQUIRE(frame.at("projectiles").at(0).at("projectileId") == 3);

  // The full frame object carries the CLI stream/replay schema keys.
  REQUIRE(frame.contains("events"));
  REQUIRE(frame.contains("actions"));
  REQUIRE(frame.at("events").is_array());
  REQUIRE(frame.at("actions").is_array());
  REQUIRE(frame.at("ruleState").contains("scores"));
  REQUIRE(frame.at("ruleState").contains("captureZones"));
  REQUIRE(frame.at("ruleState").at("outcome").at("finished") == false);
}

TEST_CASE("action_to_json keeps scanArc rangeMeters that the CLI used to drop") {
  const robolocks::Order order{
    .kind = robolocks::OrderKind::ScanArc,
    .payload = robolocks::ScanArcOrder{
      .direction_deg = 45.0,
      .width_deg = 90.0,
      .range_m = 30.0,
    },
  };

  const auto json = robolocks::action_to_json(robolocks::UnitId{2}, order);

  REQUIRE(json.at("unitId") == 2);
  REQUIRE(json.at("type") == "scanArc");
  REQUIRE(json.at("channel") == "sensor");
  REQUIRE(json.at("directionDegrees") == Catch::Approx(45.0));
  REQUIRE(json.at("widthDegrees") == Catch::Approx(90.0));
  REQUIRE(json.at("rangeMeters") == Catch::Approx(30.0));
}

TEST_CASE("event_to_json emits a structured payload object") {
  robolocks::Event event;
  event.tick = 12;
  event.unit_id = robolocks::UnitId{1};
  event.code = "armor_bounced";
  event.message = "Projectile failed to penetrate front armor.";
  event.payload.damage_type = "direct";
  event.payload.armor_facing = "front";
  event.payload.penetration_mm = 80.0;

  const auto json = robolocks::event_to_json(event);

  REQUIRE(json.at("tick") == 12);
  REQUIRE(json.at("unitId") == 1);
  REQUIRE(json.at("code") == "armor_bounced");
  REQUIRE(json.at("payload").at("damageType") == "direct");
  REQUIRE(json.at("payload").at("armorFacing") == "front");
  REQUIRE(json.at("payload").at("penetrationMillimeters") == Catch::Approx(80.0));
}
