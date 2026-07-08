#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <robolocks/controller_protocol_json.hpp>

#include <nlohmann/json.hpp>

TEST_CASE("controller protocol serializes observation for external bots") {
  robolocks::Observation observation;
  observation.tick = 42;
  observation.self_id = robolocks::UnitId{1};
  observation.self = robolocks::UnitSnapshot{
    .unit_id = robolocks::UnitId{1},
    .position = robolocks::Vec2{6.0, 12.0},
    .hull_heading_deg = 15.0,
    .turret_heading_deg = 20.0,
    .armor_integrity = 91.5,
    .weapon_cooldown_ticks = 7,
    .body_shape_type = robolocks::BodyShapeType::Box,
    .mobility_intent_active = true,
    .mobility_intent_target = robolocks::Vec2{20.0, 12.0},
    .mobility_intent_remaining_m = 14.0,
    .mobility_intent_age_ticks = 2,
    .turret_intent_active = true,
    .turret_intent_target = robolocks::Vec2{34.0, 12.0},
    .turret_intent_error_deg = 4.5,
    .turret_intent_age_ticks = 1,
    .weapon_intent_active = true,
    .weapon_intent_min_hit_chance = 0.6,
    .weapon_intent_age_ticks = 3,
  };
  observation.contacts.push_back(robolocks::ContactObservation{
    .unit_id = robolocks::UnitId{2},
    .position = robolocks::Vec2{34.0, 12.0},
    .hull_heading_deg = 180.0,
    .turret_heading_deg = 175.0,
    .armor_integrity = 88.0,
    .weapon_cooldown_ticks = 3,
    .body_shape_type = robolocks::BodyShapeType::Box,
  });
  observation.obstacles.push_back(robolocks::StaticObstacle{
    .id = "north_cover",
    .position = robolocks::Vec2{20.0, 6.0},
    .radius_m = 1.5,
    .blocks_movement = true,
    .blocks_line_of_sight = true,
  });

  const auto json = robolocks::observation_to_json(observation);

  REQUIRE(json.at("tick") == 42);
  REQUIRE(json.at("selfId") == 1);
  REQUIRE(json.at("self").at("unitId") == 1);
  REQUIRE(json.at("self").at("position").at("x") == Catch::Approx(6.0));
  REQUIRE(json.at("self").at("position").at("y") == Catch::Approx(12.0));
  REQUIRE(json.at("self").at("hullHeadingDegrees") == Catch::Approx(15.0));
  REQUIRE(json.at("self").at("turretHeadingDegrees") == Catch::Approx(20.0));
  REQUIRE(json.at("self").at("armorIntegrity") == Catch::Approx(91.5));
  REQUIRE(json.at("self").at("weaponCooldownTicks") == 7);
  REQUIRE(json.at("self").at("bodyShape").at("type") == "box");
  REQUIRE(json.at("self").at("bodyShape").at("radiusMeters") == Catch::Approx(1.0));
  REQUIRE(json.at("self").at("bodyShape").at("lengthMeters") == Catch::Approx(5.6));
  REQUIRE(json.at("self").at("bodyShape").at("widthMeters") == Catch::Approx(2.8));
  REQUIRE(json.at("self").at("intents").at("mobility").at("active") == true);
  REQUIRE(json.at("self").at("intents").at("mobility").at("target").at("x") == Catch::Approx(20.0));
  REQUIRE(json.at("self").at("intents").at("mobility").at("remainingMeters") == Catch::Approx(14.0));
  REQUIRE(json.at("self").at("intents").at("mobility").at("ageTicks") == 2);
  REQUIRE(json.at("self").at("intents").at("turret").at("active") == true);
  REQUIRE(json.at("self").at("intents").at("turret").at("target").at("x") == Catch::Approx(34.0));
  REQUIRE(json.at("self").at("intents").at("turret").at("errorDegrees") == Catch::Approx(4.5));
  REQUIRE(json.at("self").at("intents").at("turret").at("ageTicks") == 1);
  REQUIRE(json.at("self").at("intents").at("weapon").at("active") == true);
  REQUIRE(json.at("self").at("intents").at("weapon").at("minHitChance") == Catch::Approx(0.6));
  REQUIRE(json.at("self").at("intents").at("weapon").at("ageTicks") == 3);

  REQUIRE(json.at("contacts").size() == 1);
  REQUIRE(json.at("contacts").at(0).at("unitId") == 2);
  REQUIRE(json.at("contacts").at(0).at("position").at("x") == Catch::Approx(34.0));
  REQUIRE(json.at("contacts").at(0).at("position").at("y") == Catch::Approx(12.0));
  REQUIRE(json.at("contacts").at(0).at("weaponCooldownTicks") == 3);
  REQUIRE(json.at("contacts").at(0).at("bodyShape").at("type") == "box");
  REQUIRE(json.at("contacts").at(0).at("bodyShape").at("radiusMeters") == Catch::Approx(1.0));
  REQUIRE(json.at("contacts").at(0).at("bodyShape").at("lengthMeters") == Catch::Approx(5.6));
  REQUIRE(json.at("contacts").at(0).at("bodyShape").at("widthMeters") == Catch::Approx(2.8));
  REQUIRE(json.at("map").at("obstacles").size() == 1);
  REQUIRE(json.at("map").at("obstacles").at(0).at("id") == "north_cover");
  REQUIRE(json.at("map").at("obstacles").at(0).at("position").at("x") == Catch::Approx(20.0));
  REQUIRE(json.at("map").at("obstacles").at(0).at("position").at("y") == Catch::Approx(6.0));
  REQUIRE(json.at("map").at("obstacles").at(0).at("radiusMeters") == Catch::Approx(1.5));
  REQUIRE(json.at("map").at("obstacles").at(0).at("blocksMovement") == true);
  REQUIRE(json.at("map").at("obstacles").at(0).at("blocksLineOfSight") == true);
}

TEST_CASE("controller protocol parses external bot order list") {
  const auto json = nlohmann::json::parse(R"json(
    {
      "orders": [
        {"type": "moveTo", "position": {"x": 17.0, "y": 12.0}},
        {"type": "aimAt", "target": {"x": 22.0, "y": 12.0}},
        {"type": "faceArmorToward", "target": {"x": 24.0, "y": 12.0}},
        {"type": "fireIfSolution", "minHitChance": 0.65},
        {"type": "scanArc", "directionDegrees": 45.0, "widthDegrees": 90.0}
      ]
    }
  )json");

  const auto orders = robolocks::orders_from_json(json);

  REQUIRE(orders.size() == 5);

  REQUIRE(orders[0].kind == robolocks::OrderKind::MoveTo);
  const auto& move_to = std::get<robolocks::MoveToOrder>(orders[0].payload);
  REQUIRE(move_to.position.x == Catch::Approx(17.0));
  REQUIRE(move_to.position.y == Catch::Approx(12.0));

  REQUIRE(orders[1].kind == robolocks::OrderKind::AimAt);
  const auto& aim_at = std::get<robolocks::AimAtOrder>(orders[1].payload);
  REQUIRE(aim_at.target.x == Catch::Approx(22.0));
  REQUIRE(aim_at.target.y == Catch::Approx(12.0));

  REQUIRE(orders[2].kind == robolocks::OrderKind::FaceArmorToward);
  const auto& face = std::get<robolocks::FaceArmorTowardOrder>(orders[2].payload);
  REQUIRE(face.target.x == Catch::Approx(24.0));
  REQUIRE(face.target.y == Catch::Approx(12.0));

  REQUIRE(orders[3].kind == robolocks::OrderKind::FireIfSolution);
  const auto& fire = std::get<robolocks::FireIfSolutionOrder>(orders[3].payload);
  REQUIRE(fire.min_hit_chance == Catch::Approx(0.65));

  REQUIRE(orders[4].kind == robolocks::OrderKind::ScanArc);
  const auto& scan = std::get<robolocks::ScanArcOrder>(orders[4].payload);
  REQUIRE(scan.direction_deg == Catch::Approx(45.0));
  REQUIRE(scan.width_deg == Catch::Approx(90.0));
}
