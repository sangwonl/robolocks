#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <robolocks/order.hpp>
#include <robolocks/battlefield.hpp>

namespace {

robolocks::TankPreset make_tank(
  robolocks::UnitId unit_id,
  const char* name,
  robolocks::Vec2 position,
  double max_speed_mps = 2.0,
  double armor_integrity = 100.0,
  double hull_heading_deg = 0.0,
  double turret_heading_deg = 0.0
) {
  return robolocks::TankPreset{
    .unit_id = unit_id,
    .name = name,
    .transform = robolocks::TransformComponent{
      .position = position,
      .hull_heading_deg = hull_heading_deg,
    },
    .mobility = robolocks::MobilityComponent{
      .max_speed_mps = max_speed_mps,
      .max_hull_turn_degps = 120.0,
    },
    .turret = robolocks::TurretComponent{
      .heading_deg = turret_heading_deg,
      .max_turn_degps = 180.0,
    },
    .armor = robolocks::ArmorComponent{
      .integrity = armor_integrity,
    },
    .body = robolocks::BodyComponent{
        .shape = robolocks::BodyShapeComponent{.radius_m = 0.0},
      },
  };
}

}  // namespace

TEST_CASE("battlefield step moves tank toward MoveTo target deterministically") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.tanks = {
    make_tank(robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}),
  };

  robolocks::Battlefield battlefield(config);

  robolocks::Order move{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::MoveToOrder{robolocks::Vec2{10.0, 0.0}},
  };

  const auto result = battlefield.step({
    robolocks::UnitOrders{robolocks::UnitId{1}, {move}},
  });

  REQUIRE(result.snapshot.tick == 1);
  REQUIRE(result.snapshot.units.size() == 1);
  REQUIRE(result.snapshot.units[0].position.x == Catch::Approx(2.0));
  REQUIRE(result.snapshot.units[0].position.y == Catch::Approx(0.0));
}

TEST_CASE("battlefield step moves then turns hull toward MoveTo target") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.tanks = {
    robolocks::TankPreset{
      .unit_id = robolocks::UnitId{1},
      .name = "Blue",
      .transform = robolocks::TransformComponent{
        .position = robolocks::Vec2{0.0, 0.0},
        .hull_heading_deg = 0.0,
      },
      .mobility = robolocks::MobilityComponent{
        .max_speed_mps = 2.0,
        .max_hull_turn_degps = 45.0,
      },
      .turret = robolocks::TurretComponent{},
      .armor = robolocks::ArmorComponent{},
    },
  };

  robolocks::Battlefield battlefield(config);

  robolocks::Order move_north{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::MoveToOrder{robolocks::Vec2{0.0, 10.0}},
  };

  const auto result = battlefield.step({
    robolocks::UnitOrders{robolocks::UnitId{1}, {move_north}},
  });

  // Tank moves east (hull 0°) then hull turns toward north target.
  // Physics clamps y to body radius (1.0) from arena edge.
  REQUIRE(result.snapshot.units[0].hull_heading_deg == Catch::Approx(45.0));
  REQUIRE(result.snapshot.units[0].position.x == Catch::Approx(2.0));
  REQUIRE(result.snapshot.units[0].position.y == Catch::Approx(1.0));
}

TEST_CASE("battlefield keeps MoveTo intent active until replaced or completed") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.tanks = {
    make_tank(robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}),
  };

  robolocks::Battlefield battlefield(config);

  robolocks::Order move{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::MoveToOrder{robolocks::Vec2{10.0, 0.0}},
  };

  const auto first = battlefield.step({
    robolocks::UnitOrders{robolocks::UnitId{1}, {move}},
  });
  const auto second = battlefield.step({});

  REQUIRE(first.snapshot.units[0].position.x == Catch::Approx(2.0));
  REQUIRE(first.snapshot.units[0].mobility_intent_active);
  REQUIRE(first.snapshot.units[0].mobility_intent_target.x == Catch::Approx(10.0));
  REQUIRE(second.snapshot.units[0].position.x == Catch::Approx(4.0));
  REQUIRE(second.snapshot.units[0].mobility_intent_active);
  REQUIRE(second.snapshot.units[0].mobility_intent_age_ticks == 1);
}

TEST_CASE("battlefield clears MoveTo intent when physics blocks progress against an obstacle") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.obstacles = {
    robolocks::StaticObstacle{
      .id = "cover",
      .position = robolocks::Vec2{8.0, 5.0},
      .radius_m = 1.5,
      .blocks_movement = true,
    },
  };
  config.tanks = {
    robolocks::TankPreset{
      .unit_id = robolocks::UnitId{1},
      .name = "Blue",
      .transform = robolocks::TransformComponent{
        .position = robolocks::Vec2{4.0, 5.0},
        .hull_heading_deg = 0.0,
      },
      .mobility = robolocks::MobilityComponent{
        .max_speed_mps = 0.5,
        .max_hull_turn_degps = 120.0,
      },
      .turret = robolocks::TurretComponent{},
      .armor = robolocks::ArmorComponent{},
      .body = robolocks::BodyComponent{
        .shape = robolocks::BodyShapeComponent{
          .type = robolocks::BodyShapeType::Box,
          .radius_m = 1.2,
          .length_m = 5.6,
          .width_m = 2.8,
        },
        .mass_kg = 30000.0,
      },
    },
  };

  robolocks::Battlefield battlefield(config);

  const auto result = battlefield.step({
    robolocks::UnitOrders{
      robolocks::UnitId{1},
      {
        robolocks::Order{
          .kind = robolocks::OrderKind::MoveTo,
          .payload = robolocks::MoveToOrder{robolocks::Vec2{12.0, 5.0}},
        },
      },
    },
  });

  REQUIRE_FALSE(result.snapshot.units[0].mobility_intent_active);
}

TEST_CASE("battlefield keeps AimAt intent slewing when no new order is submitted") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.tanks = {
    robolocks::TankPreset{
      .unit_id = robolocks::UnitId{1},
      .name = "Blue",
      .transform = robolocks::TransformComponent{
        .position = robolocks::Vec2{5.0, 5.0},
        .hull_heading_deg = 0.0,
      },
      .turret = robolocks::TurretComponent{
        .heading_deg = 0.0,
        .max_turn_degps = 45.0,
      },
    },
  };

  robolocks::Battlefield battlefield(config);

  robolocks::Order aim_up{
    .kind = robolocks::OrderKind::AimAt,
    .payload = robolocks::AimAtOrder{robolocks::Vec2{5.0, 15.0}},
  };

  const auto first = battlefield.step({
    robolocks::UnitOrders{robolocks::UnitId{1}, {aim_up}},
  });
  const auto second = battlefield.step({});

  REQUIRE(first.snapshot.units[0].turret_heading_deg == Catch::Approx(45.0));
  REQUIRE(first.snapshot.units[0].turret_intent_active);
  REQUIRE(first.snapshot.units[0].turret_intent_error_deg == Catch::Approx(45.0));
  REQUIRE(second.snapshot.units[0].turret_heading_deg == Catch::Approx(90.0));
  REQUIRE(second.snapshot.units[0].turret_intent_active);
  REQUIRE(second.snapshot.units[0].turret_intent_error_deg == Catch::Approx(0.0));
  REQUIRE(second.snapshot.units[0].turret_intent_age_ticks == 1);
}

TEST_CASE("battlefield ignores orders for destroyed units") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.tanks = {
    make_tank(robolocks::UnitId{1}, "Blue", robolocks::Vec2{5.0, 5.0}, 2.0, 0.0),
  };

  robolocks::Battlefield battlefield(config);

  const auto result = battlefield.step({
    robolocks::UnitOrders{
      robolocks::UnitId{1},
      {
        robolocks::Order{
          .kind = robolocks::OrderKind::MoveTo,
          .payload = robolocks::MoveToOrder{robolocks::Vec2{10.0, 5.0}},
        },
        robolocks::Order{
          .kind = robolocks::OrderKind::AimAt,
          .payload = robolocks::AimAtOrder{robolocks::Vec2{10.0, 5.0}},
        },
        robolocks::Order{
          .kind = robolocks::OrderKind::FireIfSolution,
          .payload = robolocks::FireIfSolutionOrder{0.6},
        },
      },
    },
  });

  REQUIRE(result.snapshot.units[0].position.x == Catch::Approx(5.0));
  REQUIRE_FALSE(result.snapshot.units[0].mobility_intent_active);
  REQUIRE_FALSE(result.snapshot.units[0].turret_intent_active);
  REQUIRE_FALSE(result.snapshot.units[0].weapon_intent_active);
}

TEST_CASE("battlefield clears active intents when a unit is destroyed") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.tanks = {
    make_tank(robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}, 2.0, 25.0),
    make_tank(robolocks::UnitId{2}, "Red", robolocks::Vec2{10.0, 0.0}, 0.0, 100.0, 180.0, 180.0),
  };

  robolocks::Battlefield battlefield(config);

  battlefield.step({
    robolocks::UnitOrders{
      robolocks::UnitId{1},
      {
        robolocks::Order{
          .kind = robolocks::OrderKind::MoveTo,
          .payload = robolocks::MoveToOrder{robolocks::Vec2{10.0, 0.0}},
        },
      },
    },
  });

  const auto result = battlefield.step({
    robolocks::UnitOrders{
      robolocks::UnitId{2},
      {
        robolocks::Order{
          .kind = robolocks::OrderKind::AimAt,
          .payload = robolocks::AimAtOrder{robolocks::Vec2{2.0, 0.0}},
        },
        robolocks::Order{
          .kind = robolocks::OrderKind::FireIfSolution,
          .payload = robolocks::FireIfSolutionOrder{0.6},
        },
      },
    },
  });

  REQUIRE(result.snapshot.units[0].armor_integrity == Catch::Approx(0.0));
  REQUIRE_FALSE(result.snapshot.units[0].mobility_intent_active);
  REQUIRE_FALSE(result.snapshot.units[0].turret_intent_active);
  REQUIRE_FALSE(result.snapshot.units[0].weapon_intent_active);
}

TEST_CASE("battlefield keeps tank footprint inside arena bounds") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.bounds = robolocks::BattleBounds{
    .min = robolocks::Vec2{0.0, 0.0},
    .max = robolocks::Vec2{10.0, 10.0},
  };
  config.tanks = {
    robolocks::TankPreset{
      .unit_id = robolocks::UnitId{1},
      .name = "Blue",
      .transform = robolocks::TransformComponent{
        .position = robolocks::Vec2{1.0, 5.0},
        .hull_heading_deg = 180.0,
      },
      .mobility = robolocks::MobilityComponent{
        .max_speed_mps = 5.0,
        .max_hull_turn_degps = 180.0,
      },
      .body = robolocks::BodyComponent{
        .shape = robolocks::BodyShapeComponent{.radius_m = 1.0},
      },
    },
  };

  robolocks::Battlefield battlefield(config);

  robolocks::Order move_left{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::MoveToOrder{robolocks::Vec2{-10.0, 5.0}},
  };

  const auto result = battlefield.step({
    robolocks::UnitOrders{robolocks::UnitId{1}, {move_left}},
  });

  REQUIRE(result.snapshot.units[0].position.x == Catch::Approx(1.0));
  REQUIRE(result.snapshot.units[0].position.y == Catch::Approx(5.0));
}

TEST_CASE("battlefield separates overlapping tank footprints after movement") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.bounds = robolocks::BattleBounds{
    .min = robolocks::Vec2{0.0, 0.0},
    .max = robolocks::Vec2{20.0, 10.0},
  };
  config.tanks = {
    robolocks::TankPreset{
      .unit_id = robolocks::UnitId{1},
      .name = "Blue",
      .transform = robolocks::TransformComponent{
        .position = robolocks::Vec2{1.0, 5.0},
        .hull_heading_deg = 0.0,
      },
      .mobility = robolocks::MobilityComponent{
        .max_speed_mps = 4.0,
        .max_hull_turn_degps = 180.0,
      },
      .body = robolocks::BodyComponent{
        .shape = robolocks::BodyShapeComponent{.radius_m = 1.0},
      },
    },
    robolocks::TankPreset{
      .unit_id = robolocks::UnitId{2},
      .name = "Red",
      .transform = robolocks::TransformComponent{
        .position = robolocks::Vec2{4.0, 5.0},
        .hull_heading_deg = 180.0,
      },
      .body = robolocks::BodyComponent{
        .shape = robolocks::BodyShapeComponent{.radius_m = 1.0},
      },
    },
  };

  robolocks::Battlefield battlefield(config);

  robolocks::Order move_right{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::MoveToOrder{robolocks::Vec2{10.0, 5.0}},
  };

  const auto result = battlefield.step({
    robolocks::UnitOrders{robolocks::UnitId{1}, {move_right}},
  });

  REQUIRE(result.snapshot.units[0].position.x == Catch::Approx(5.5));
  REQUIRE(result.snapshot.units[1].position.x == Catch::Approx(3.5));
}

TEST_CASE("battlefield resolves tank collisions using body mass and emits events") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.bounds = robolocks::BattleBounds{
    .min = robolocks::Vec2{0.0, 0.0},
    .max = robolocks::Vec2{20.0, 10.0},
  };
  config.tanks = {
    robolocks::TankPreset{
      .unit_id = robolocks::UnitId{1},
      .name = "Light",
      .transform = robolocks::TransformComponent{
        .position = robolocks::Vec2{1.0, 5.0},
        .hull_heading_deg = 0.0,
      },
      .mobility = robolocks::MobilityComponent{
        .max_speed_mps = 4.0,
        .max_hull_turn_degps = 180.0,
      },
      .body = robolocks::BodyComponent{
        .shape = robolocks::BodyShapeComponent{.radius_m = 1.0},
        .mass_kg = 1000.0,
      },
    },
    robolocks::TankPreset{
      .unit_id = robolocks::UnitId{2},
      .name = "Heavy",
      .transform = robolocks::TransformComponent{
        .position = robolocks::Vec2{4.0, 5.0},
        .hull_heading_deg = 180.0,
      },
      .body = robolocks::BodyComponent{
        .shape = robolocks::BodyShapeComponent{.radius_m = 1.0},
        .mass_kg = 3000.0,
      },
    },
  };

  robolocks::Battlefield battlefield(config);

  robolocks::Order move_right{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::MoveToOrder{robolocks::Vec2{10.0, 5.0}},
  };

  const auto result = battlefield.step({
    robolocks::UnitOrders{robolocks::UnitId{1}, {move_right}},
  });

  REQUIRE(result.snapshot.units[0].position.x == Catch::Approx(5.75));
  REQUIRE(result.snapshot.units[1].position.x == Catch::Approx(3.75));
  REQUIRE(result.events.size() == 2);
  REQUIRE(result.events[0].unit_id == robolocks::UnitId{1});
  REQUIRE(result.events[0].code == "unit_collision");
  REQUIRE(result.events[1].unit_id == robolocks::UnitId{2});
  REQUIRE(result.events[1].code == "unit_collision");
}

TEST_CASE("battlefield separates tank footprints from circular obstacles") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.bounds = robolocks::BattleBounds{
    .min = robolocks::Vec2{0.0, 0.0},
    .max = robolocks::Vec2{20.0, 10.0},
  };
  config.obstacles = {
    robolocks::StaticObstacle{
      .id = "cover",
      .position = robolocks::Vec2{4.0, 5.0},
      .radius_m = 1.0,
      .blocks_movement = true,
      .blocks_line_of_sight = true,
    },
  };
  config.tanks = {
    robolocks::TankPreset{
      .unit_id = robolocks::UnitId{1},
      .name = "Blue",
      .transform = robolocks::TransformComponent{
        .position = robolocks::Vec2{1.0, 5.0},
        .hull_heading_deg = 0.0,
      },
      .mobility = robolocks::MobilityComponent{
        .max_speed_mps = 2.5,
        .max_hull_turn_degps = 180.0,
      },
      .body = robolocks::BodyComponent{
        .shape = robolocks::BodyShapeComponent{.radius_m = 1.0},
      },
    },
  };

  robolocks::Battlefield battlefield(config);

  robolocks::Order move_right{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::MoveToOrder{robolocks::Vec2{10.0, 5.0}},
  };

  const auto result = battlefield.step({
    robolocks::UnitOrders{robolocks::UnitId{1}, {move_right}},
  });

  REQUIRE(result.snapshot.units[0].position.x == Catch::Approx(2.0));
  REQUIRE(result.snapshot.units[0].position.y == Catch::Approx(5.0));
}

TEST_CASE("same commands produce same battlefield snapshots") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.tanks = {
    make_tank(robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}),
  };

  robolocks::Order move{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::MoveToOrder{robolocks::Vec2{10.0, 0.0}},
  };

  robolocks::Battlefield a(config);
  robolocks::Battlefield b(config);

  const auto ar = a.step({robolocks::UnitOrders{robolocks::UnitId{1}, {move}}});
  const auto br = b.step({robolocks::UnitOrders{robolocks::UnitId{1}, {move}}});

  REQUIRE(ar.snapshot.units[0].position.x == Catch::Approx(br.snapshot.units[0].position.x));
  REQUIRE(ar.snapshot.units[0].position.y == Catch::Approx(br.snapshot.units[0].position.y));
}

TEST_CASE("battlefield initializes hull and turret headings from tank preset") {
  robolocks::BattleConfig config;
  config.tanks = {
    make_tank(robolocks::UnitId{2}, "Red", robolocks::Vec2{34.0, 12.0}, 2.0, 100.0, 180.0, 180.0),
  };

  robolocks::Battlefield battlefield(config);
  const auto snapshot = battlefield.snapshot();

  REQUIRE(snapshot.units.size() == 1);
  REQUIRE(snapshot.units[0].hull_heading_deg == Catch::Approx(180.0));
  REQUIRE(snapshot.units[0].turret_heading_deg == Catch::Approx(180.0));
}

TEST_CASE("battlefield step ignores invalid order payloads and emits a diagnostic") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.tanks = {
    make_tank(robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}),
  };

  robolocks::Battlefield battlefield(config);

  robolocks::Order invalid_move{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::AimAtOrder{robolocks::Vec2{10.0, 0.0}},
  };

  const auto result = battlefield.step({
    robolocks::UnitOrders{robolocks::UnitId{1}, {invalid_move}},
  });

  REQUIRE(result.snapshot.tick == 1);
  REQUIRE(result.snapshot.units.size() == 1);
  REQUIRE(result.snapshot.units[0].position.x == Catch::Approx(0.0));
  REQUIRE(result.snapshot.units[0].position.y == Catch::Approx(0.0));
  REQUIRE(result.events.size() == 1);
  REQUIRE(result.events[0].tick == 1);
  REQUIRE(result.events[0].unit_id == robolocks::UnitId{1});
  REQUIRE(result.events[0].code == "invalid_order_payload_kind");
}

TEST_CASE("battlefield step rejects duplicate mobility commands for one unit") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.tanks = {
    make_tank(robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}),
  };

  robolocks::Battlefield battlefield(config);

  robolocks::Order first_move{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::MoveToOrder{robolocks::Vec2{10.0, 0.0}},
  };

  robolocks::Order second_move{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::MoveToOrder{robolocks::Vec2{0.0, 10.0}},
  };

  const auto result = battlefield.step({
    robolocks::UnitOrders{robolocks::UnitId{1}, {first_move, second_move}},
  });

  REQUIRE(result.snapshot.tick == 1);
  REQUIRE(result.snapshot.units.size() == 1);
  REQUIRE(result.snapshot.units[0].position.x == Catch::Approx(0.0));
  REQUIRE(result.snapshot.units[0].position.y == Catch::Approx(0.0));
  REQUIRE(result.events.size() == 1);
  REQUIRE(result.events[0].tick == 1);
  REQUIRE(result.events[0].unit_id == robolocks::UnitId{1});
  REQUIRE(result.events[0].code == "duplicate_mobility_order");
}

TEST_CASE("battlefield step applies turret and hull commands with turn limits") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.tanks = {
    make_tank(robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}),
  };

  robolocks::Battlefield battlefield(config);

  robolocks::Order aim_up{
    .kind = robolocks::OrderKind::AimAt,
    .payload = robolocks::AimAtOrder{robolocks::Vec2{0.0, 10.0}},
  };

  robolocks::Order face_left{
    .kind = robolocks::OrderKind::FaceArmorToward,
    .payload = robolocks::FaceArmorTowardOrder{robolocks::Vec2{-10.0, 0.0}},
  };

  const auto result = battlefield.step({
    robolocks::UnitOrders{robolocks::UnitId{1}, {aim_up, face_left}},
  });

  REQUIRE(result.snapshot.tick == 1);
  REQUIRE(result.snapshot.units.size() == 1);
  REQUIRE(result.snapshot.units[0].turret_heading_deg == Catch::Approx(90.0));
  REQUIRE(result.snapshot.units[0].hull_heading_deg == Catch::Approx(120.0));
}

TEST_CASE("battlefield uses mobility turret and armor components from tank preset") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.tanks = {
    robolocks::TankPreset{
      .unit_id = robolocks::UnitId{1},
      .name = "Blue",
      .transform = robolocks::TransformComponent{
        .position = robolocks::Vec2{0.0, 0.0},
        .hull_heading_deg = 0.0,
      },
      .mobility = robolocks::MobilityComponent{
        .max_speed_mps = 3.0,
        .max_hull_turn_degps = 45.0,
      },
      .turret = robolocks::TurretComponent{
        .heading_deg = 0.0,
        .max_turn_degps = 30.0,
      },
      .armor = robolocks::ArmorComponent{
        .integrity = 87.5,
      },
    },
  };

  robolocks::Battlefield battlefield(config);

  const auto result = battlefield.step({
    robolocks::UnitOrders{
      robolocks::UnitId{1},
      {
        robolocks::Order{
          .kind = robolocks::OrderKind::MoveTo,
          .payload = robolocks::MoveToOrder{robolocks::Vec2{10.0, 0.0}},
        },
        robolocks::Order{
          .kind = robolocks::OrderKind::AimAt,
          .payload = robolocks::AimAtOrder{robolocks::Vec2{0.0, 10.0}},
        },
        robolocks::Order{
          .kind = robolocks::OrderKind::FaceArmorToward,
          .payload = robolocks::FaceArmorTowardOrder{robolocks::Vec2{0.0, 10.0}},
        },
      },
    },
  });

  // Move east, then hull faces FaceArmorToward target, turret turns.
  // Physics clamps y to body radius (1.0) from arena edge.
  REQUIRE(result.snapshot.units[0].position.x == Catch::Approx(3.0));
  REQUIRE(result.snapshot.units[0].position.y == Catch::Approx(1.0));
  REQUIRE(result.snapshot.units[0].turret_heading_deg == Catch::Approx(30.0));
  REQUIRE(result.snapshot.units[0].hull_heading_deg == Catch::Approx(45.0));
  REQUIRE(result.snapshot.units[0].armor_integrity == Catch::Approx(87.5));
}

TEST_CASE("battlefield applies FireIfSolution through weapon damage and reload") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.tanks = {
    make_tank(robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}, 0.0, 100.0, 0.0, 0.0),
    make_tank(robolocks::UnitId{2}, "Red", robolocks::Vec2{10.0, 0.0}, 0.0, 100.0, 180.0, 180.0),
  };

  robolocks::Battlefield battlefield(config);

  const auto first = battlefield.step({
    robolocks::UnitOrders{
      robolocks::UnitId{1},
      {
        robolocks::Order{
          .kind = robolocks::OrderKind::AimAt,
          .payload = robolocks::AimAtOrder{robolocks::Vec2{10.0, 0.0}},
        },
        robolocks::Order{
          .kind = robolocks::OrderKind::FireIfSolution,
          .payload = robolocks::FireIfSolutionOrder{0.6},
        },
      },
    },
  });

  REQUIRE(first.snapshot.units[1].armor_integrity == Catch::Approx(75.0));
  REQUIRE(first.events.size() == 2);
  REQUIRE(first.events[0].unit_id == robolocks::UnitId{1});
  REQUIRE(first.events[0].code == "weapon_fired");
  REQUIRE(first.events[1].unit_id == robolocks::UnitId{2});
  REQUIRE(first.events[1].code == "armor_damage");

  const auto second = battlefield.step({
    robolocks::UnitOrders{
      robolocks::UnitId{1},
      {
        robolocks::Order{
          .kind = robolocks::OrderKind::FireIfSolution,
          .payload = robolocks::FireIfSolutionOrder{0.6},
        },
      },
    },
  });

  REQUIRE(second.snapshot.units[1].armor_integrity == Catch::Approx(75.0));
  REQUIRE(second.events.size() == 1);
  REQUIRE(second.events[0].unit_id == robolocks::UnitId{1});
  REQUIRE(second.events[0].code == "weapon_reloading");
}

TEST_CASE("battlefield keeps FireIfSolution intent until turret solution is available") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.tanks = {
    robolocks::TankPreset{
      .unit_id = robolocks::UnitId{1},
      .name = "Blue",
      .transform = robolocks::TransformComponent{
        .position = robolocks::Vec2{5.0, 5.0},
      },
      .mobility = robolocks::MobilityComponent{
        .max_speed_mps = 0.0,
      },
      .turret = robolocks::TurretComponent{
        .heading_deg = 0.0,
        .max_turn_degps = 45.0,
      },
      .weapon = robolocks::WeaponComponent{
        .damage = 25.0,
        .range_m = 80.0,
        .aim_tolerance_deg = 5.0,
        .reload_ticks = 30,
      },
      .body = robolocks::BodyComponent{
        .shape = robolocks::BodyShapeComponent{.radius_m = 0.0},
      },
    },
    make_tank(robolocks::UnitId{2}, "Red", robolocks::Vec2{5.0, 15.0}, 0.0, 100.0, 180.0, 180.0),
  };

  robolocks::Battlefield battlefield(config);

  const auto first = battlefield.step({
    robolocks::UnitOrders{
      robolocks::UnitId{1},
      {
        robolocks::Order{
          .kind = robolocks::OrderKind::AimAt,
          .payload = robolocks::AimAtOrder{robolocks::Vec2{5.0, 15.0}},
        },
        robolocks::Order{
          .kind = robolocks::OrderKind::FireIfSolution,
          .payload = robolocks::FireIfSolutionOrder{0.6},
        },
      },
    },
  });

  REQUIRE(first.snapshot.units[1].armor_integrity == Catch::Approx(100.0));
  REQUIRE(first.snapshot.units[0].weapon_intent_active);

  const auto second = battlefield.step({});

  REQUIRE(second.snapshot.units[1].armor_integrity == Catch::Approx(75.0));
  REQUIRE_FALSE(second.snapshot.units[0].weapon_intent_active);
  REQUIRE(second.events.size() == 2);
  REQUIRE(second.events[0].code == "weapon_fired");
}
