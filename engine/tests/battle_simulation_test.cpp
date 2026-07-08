#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <robolocks/order.hpp>
#include <robolocks/battle_simulation.hpp>

namespace {

robolocks::UnitSpec make_unit(
  robolocks::UnitId unit_id,
  const char* name,
  robolocks::Vec2 position,
  double max_speed_mps = 2.0,
  double armor_integrity = 100.0,
  double hull_heading_deg = 0.0,
  double turret_heading_deg = 0.0
) {
  return robolocks::UnitSpec{
    .unit_id = unit_id,
    .name = name,
    .transform = robolocks::TransformSpec{
      .position = position,
      .hull_heading_deg = hull_heading_deg,
    },
    .mobility = robolocks::MobilitySpec{
      .max_speed_mps = max_speed_mps,
      .max_hull_turn_degps = 120.0,
    },
    .turret = robolocks::TurretSpec{
      .heading_deg = turret_heading_deg,
      .max_turn_degps = 180.0,
    },
    .armor = robolocks::ArmorSpec{
      .integrity = armor_integrity,
    },
    .body = robolocks::BodySpec{
        .shape = robolocks::BodyShapeSpec{.radius_m = 0.0},
      },
  };
}

}  // namespace

TEST_CASE("battle_simulation step moves unit toward MoveTo target deterministically") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.units = {
    make_unit(robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}),
  };

  robolocks::BattleSimulation battle_simulation(config);

  robolocks::Order move{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::MoveToOrder{robolocks::Vec2{10.0, 0.0}},
  };

  const auto result = battle_simulation.step({
    robolocks::UnitOrders{robolocks::UnitId{1}, {move}},
  });

  REQUIRE(result.snapshot.tick == 1);
  REQUIRE(result.snapshot.units.size() == 1);
  REQUIRE(result.snapshot.units[0].position.x == Catch::Approx(2.0));
  REQUIRE(result.snapshot.units[0].position.y == Catch::Approx(0.0));
}

TEST_CASE("battle_simulation step moves then turns hull toward MoveTo target") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.units = {
    robolocks::UnitSpec{
      .unit_id = robolocks::UnitId{1},
      .name = "Blue",
      .transform = robolocks::TransformSpec{
        .position = robolocks::Vec2{0.0, 0.0},
        .hull_heading_deg = 0.0,
      },
      .mobility = robolocks::MobilitySpec{
        .max_speed_mps = 2.0,
        .max_hull_turn_degps = 45.0,
      },
      .turret = robolocks::TurretSpec{},
      .armor = robolocks::ArmorSpec{},
    },
  };

  robolocks::BattleSimulation battle_simulation(config);

  robolocks::Order move_north{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::MoveToOrder{robolocks::Vec2{0.0, 10.0}},
  };

  const auto result = battle_simulation.step({
    robolocks::UnitOrders{robolocks::UnitId{1}, {move_north}},
  });

  // Tank moves east (hull 0°) then hull turns toward north target.
  // Physics clamps y to body radius (1.0) from arena edge.
  REQUIRE(result.snapshot.units[0].hull_heading_deg == Catch::Approx(45.0));
  REQUIRE(result.snapshot.units[0].position.x == Catch::Approx(2.0));
  REQUIRE(result.snapshot.units[0].position.y == Catch::Approx(1.0));
}

TEST_CASE("battle_simulation keeps MoveTo intent active until replaced or completed") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.units = {
    make_unit(robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}),
  };

  robolocks::BattleSimulation battle_simulation(config);

  robolocks::Order move{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::MoveToOrder{robolocks::Vec2{10.0, 0.0}},
  };

  const auto first = battle_simulation.step({
    robolocks::UnitOrders{robolocks::UnitId{1}, {move}},
  });
  const auto second = battle_simulation.step({});

  REQUIRE(first.snapshot.units[0].position.x == Catch::Approx(2.0));
  REQUIRE(first.snapshot.units[0].mobility_intent_active);
  REQUIRE(first.snapshot.units[0].mobility_intent_target.x == Catch::Approx(10.0));
  REQUIRE(second.snapshot.units[0].position.x == Catch::Approx(4.0));
  REQUIRE(second.snapshot.units[0].mobility_intent_active);
  REQUIRE(second.snapshot.units[0].mobility_intent_age_ticks == 1);
}

TEST_CASE("battle_simulation clears MoveTo intent when physics blocks progress against an obstacle") {
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
  config.units = {
    robolocks::UnitSpec{
      .unit_id = robolocks::UnitId{1},
      .name = "Blue",
      .transform = robolocks::TransformSpec{
        .position = robolocks::Vec2{4.0, 5.0},
        .hull_heading_deg = 0.0,
      },
      .mobility = robolocks::MobilitySpec{
        .max_speed_mps = 0.5,
        .max_hull_turn_degps = 120.0,
      },
      .turret = robolocks::TurretSpec{},
      .armor = robolocks::ArmorSpec{},
      .body = robolocks::BodySpec{
        .shape = robolocks::BodyShapeSpec{
          .type = robolocks::BodyShapeType::Box,
          .radius_m = 1.2,
          .length_m = 5.6,
          .width_m = 2.8,
        },
        .mass_kg = 30000.0,
      },
    },
  };

  robolocks::BattleSimulation battle_simulation(config);

  const auto result = battle_simulation.step({
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

TEST_CASE("battle_simulation keeps AimAt intent slewing when no new order is submitted") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.units = {
    robolocks::UnitSpec{
      .unit_id = robolocks::UnitId{1},
      .name = "Blue",
      .transform = robolocks::TransformSpec{
        .position = robolocks::Vec2{5.0, 5.0},
        .hull_heading_deg = 0.0,
      },
      .turret = robolocks::TurretSpec{
        .heading_deg = 0.0,
        .max_turn_degps = 45.0,
      },
    },
  };

  robolocks::BattleSimulation battle_simulation(config);

  robolocks::Order aim_up{
    .kind = robolocks::OrderKind::AimAt,
    .payload = robolocks::AimAtOrder{robolocks::Vec2{5.0, 15.0}},
  };

  const auto first = battle_simulation.step({
    robolocks::UnitOrders{robolocks::UnitId{1}, {aim_up}},
  });
  const auto second = battle_simulation.step({});

  REQUIRE(first.snapshot.units[0].turret_heading_deg == Catch::Approx(45.0));
  REQUIRE(first.snapshot.units[0].turret_intent_active);
  REQUIRE(first.snapshot.units[0].turret_intent_error_deg == Catch::Approx(45.0));
  REQUIRE(second.snapshot.units[0].turret_heading_deg == Catch::Approx(90.0));
  REQUIRE(second.snapshot.units[0].turret_intent_active);
  REQUIRE(second.snapshot.units[0].turret_intent_error_deg == Catch::Approx(0.0));
  REQUIRE(second.snapshot.units[0].turret_intent_age_ticks == 1);
}

TEST_CASE("battle_simulation ignores orders for destroyed units") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.units = {
    make_unit(robolocks::UnitId{1}, "Blue", robolocks::Vec2{5.0, 5.0}, 2.0, 0.0),
  };

  robolocks::BattleSimulation battle_simulation(config);

  const auto result = battle_simulation.step({
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

TEST_CASE("battle_simulation clears active intents when a unit is destroyed") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.units = {
    make_unit(robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}, 2.0, 25.0),
    make_unit(robolocks::UnitId{2}, "Red", robolocks::Vec2{10.0, 0.0}, 0.0, 100.0, 180.0, 180.0),
  };

  robolocks::BattleSimulation battle_simulation(config);

  battle_simulation.step({
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

  const auto result = battle_simulation.step({
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

TEST_CASE("battle_simulation keeps unit footprint inside arena bounds") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.bounds = robolocks::BattleBounds{
    .min = robolocks::Vec2{0.0, 0.0},
    .max = robolocks::Vec2{10.0, 10.0},
  };
  config.units = {
    robolocks::UnitSpec{
      .unit_id = robolocks::UnitId{1},
      .name = "Blue",
      .transform = robolocks::TransformSpec{
        .position = robolocks::Vec2{1.0, 5.0},
        .hull_heading_deg = 180.0,
      },
      .mobility = robolocks::MobilitySpec{
        .max_speed_mps = 5.0,
        .max_hull_turn_degps = 180.0,
      },
      .body = robolocks::BodySpec{
        .shape = robolocks::BodyShapeSpec{.radius_m = 1.0},
      },
    },
  };

  robolocks::BattleSimulation battle_simulation(config);

  robolocks::Order move_left{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::MoveToOrder{robolocks::Vec2{-10.0, 5.0}},
  };

  const auto result = battle_simulation.step({
    robolocks::UnitOrders{robolocks::UnitId{1}, {move_left}},
  });

  REQUIRE(result.snapshot.units[0].position.x == Catch::Approx(1.0));
  REQUIRE(result.snapshot.units[0].position.y == Catch::Approx(5.0));
}

TEST_CASE("battle_simulation separates overlapping unit footprints after movement") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.bounds = robolocks::BattleBounds{
    .min = robolocks::Vec2{0.0, 0.0},
    .max = robolocks::Vec2{20.0, 10.0},
  };
  config.units = {
    robolocks::UnitSpec{
      .unit_id = robolocks::UnitId{1},
      .name = "Blue",
      .transform = robolocks::TransformSpec{
        .position = robolocks::Vec2{1.0, 5.0},
        .hull_heading_deg = 0.0,
      },
      .mobility = robolocks::MobilitySpec{
        .max_speed_mps = 4.0,
        .max_hull_turn_degps = 180.0,
      },
      .body = robolocks::BodySpec{
        .shape = robolocks::BodyShapeSpec{.radius_m = 1.0},
      },
    },
    robolocks::UnitSpec{
      .unit_id = robolocks::UnitId{2},
      .name = "Red",
      .transform = robolocks::TransformSpec{
        .position = robolocks::Vec2{4.0, 5.0},
        .hull_heading_deg = 180.0,
      },
      .body = robolocks::BodySpec{
        .shape = robolocks::BodyShapeSpec{.radius_m = 1.0},
      },
    },
  };

  robolocks::BattleSimulation battle_simulation(config);

  robolocks::Order move_right{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::MoveToOrder{robolocks::Vec2{10.0, 5.0}},
  };

  const auto result = battle_simulation.step({
    robolocks::UnitOrders{robolocks::UnitId{1}, {move_right}},
  });

  REQUIRE(result.snapshot.units[0].position.x > 5.0);
  REQUIRE(result.snapshot.units[1].position.x < 4.0);
  REQUIRE(result.snapshot.units[0].position.x - result.snapshot.units[1].position.x >= Catch::Approx(2.0).margin(0.05));
}

TEST_CASE("battle_simulation resolves unit collisions using body mass and emits events") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.bounds = robolocks::BattleBounds{
    .min = robolocks::Vec2{0.0, 0.0},
    .max = robolocks::Vec2{20.0, 10.0},
  };
  config.units = {
    robolocks::UnitSpec{
      .unit_id = robolocks::UnitId{1},
      .name = "Light",
      .transform = robolocks::TransformSpec{
        .position = robolocks::Vec2{1.0, 5.0},
        .hull_heading_deg = 0.0,
      },
      .mobility = robolocks::MobilitySpec{
        .max_speed_mps = 4.0,
        .max_hull_turn_degps = 180.0,
      },
      .body = robolocks::BodySpec{
        .shape = robolocks::BodyShapeSpec{.radius_m = 1.0},
        .mass_kg = 1000.0,
      },
    },
    robolocks::UnitSpec{
      .unit_id = robolocks::UnitId{2},
      .name = "Heavy",
      .transform = robolocks::TransformSpec{
        .position = robolocks::Vec2{4.0, 5.0},
        .hull_heading_deg = 180.0,
      },
      .body = robolocks::BodySpec{
        .shape = robolocks::BodyShapeSpec{.radius_m = 1.0},
        .mass_kg = 3000.0,
      },
    },
  };

  robolocks::BattleSimulation battle_simulation(config);

  robolocks::Order move_right{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::MoveToOrder{robolocks::Vec2{10.0, 5.0}},
  };

  const auto result = battle_simulation.step({
    robolocks::UnitOrders{robolocks::UnitId{1}, {move_right}},
  });

  REQUIRE(result.snapshot.units[0].position.x > 5.0);
  REQUIRE(result.snapshot.units[1].position.x < 4.0);
  REQUIRE((result.snapshot.units[0].position.x - 5.0) > (4.0 - result.snapshot.units[1].position.x));
  REQUIRE(result.events.size() == 2);
  REQUIRE(result.events[0].unit_id == robolocks::UnitId{1});
  REQUIRE(result.events[0].code == "unit_collision");
  REQUIRE(result.events[1].unit_id == robolocks::UnitId{2});
  REQUIRE(result.events[1].code == "unit_collision");
}

TEST_CASE("battle_simulation separates unit footprints from circular obstacles") {
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
  config.units = {
    robolocks::UnitSpec{
      .unit_id = robolocks::UnitId{1},
      .name = "Blue",
      .transform = robolocks::TransformSpec{
        .position = robolocks::Vec2{1.0, 5.0},
        .hull_heading_deg = 0.0,
      },
      .mobility = robolocks::MobilitySpec{
        .max_speed_mps = 2.5,
        .max_hull_turn_degps = 180.0,
      },
      .body = robolocks::BodySpec{
        .shape = robolocks::BodyShapeSpec{.radius_m = 1.0},
      },
    },
  };

  robolocks::BattleSimulation battle_simulation(config);

  robolocks::Order move_right{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::MoveToOrder{robolocks::Vec2{10.0, 5.0}},
  };

  const auto result = battle_simulation.step({
    robolocks::UnitOrders{robolocks::UnitId{1}, {move_right}},
  });

  REQUIRE(result.snapshot.units[0].position.x == Catch::Approx(2.0));
  REQUIRE(result.snapshot.units[0].position.y == Catch::Approx(5.0));
}

TEST_CASE("same orders produce same battle_simulation snapshots") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.units = {
    make_unit(robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}),
  };

  robolocks::Order move{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::MoveToOrder{robolocks::Vec2{10.0, 0.0}},
  };

  robolocks::BattleSimulation a(config);
  robolocks::BattleSimulation b(config);

  const auto ar = a.step({robolocks::UnitOrders{robolocks::UnitId{1}, {move}}});
  const auto br = b.step({robolocks::UnitOrders{robolocks::UnitId{1}, {move}}});

  REQUIRE(ar.snapshot.units[0].position.x == Catch::Approx(br.snapshot.units[0].position.x));
  REQUIRE(ar.snapshot.units[0].position.y == Catch::Approx(br.snapshot.units[0].position.y));
}

TEST_CASE("battle_simulation initializes hull and turret headings from unit spec") {
  robolocks::BattleConfig config;
  config.units = {
    make_unit(robolocks::UnitId{2}, "Red", robolocks::Vec2{34.0, 12.0}, 2.0, 100.0, 180.0, 180.0),
  };

  robolocks::BattleSimulation battle_simulation(config);
  const auto snapshot = battle_simulation.snapshot();

  REQUIRE(snapshot.units.size() == 1);
  REQUIRE(snapshot.units[0].hull_heading_deg == Catch::Approx(180.0));
  REQUIRE(snapshot.units[0].turret_heading_deg == Catch::Approx(180.0));
}

TEST_CASE("battle_simulation step ignores invalid order payloads and emits a diagnostic") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.units = {
    make_unit(robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}),
  };

  robolocks::BattleSimulation battle_simulation(config);

  robolocks::Order invalid_move{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::AimAtOrder{robolocks::Vec2{10.0, 0.0}},
  };

  const auto result = battle_simulation.step({
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

TEST_CASE("battle_simulation step rejects duplicate mobility orders for one unit") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.units = {
    make_unit(robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}),
  };

  robolocks::BattleSimulation battle_simulation(config);

  robolocks::Order first_move{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::MoveToOrder{robolocks::Vec2{10.0, 0.0}},
  };

  robolocks::Order second_move{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::MoveToOrder{robolocks::Vec2{0.0, 10.0}},
  };

  const auto result = battle_simulation.step({
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

TEST_CASE("battle_simulation step applies turret and hull orders with turn limits") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.units = {
    make_unit(robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}),
  };

  robolocks::BattleSimulation battle_simulation(config);

  robolocks::Order aim_up{
    .kind = robolocks::OrderKind::AimAt,
    .payload = robolocks::AimAtOrder{robolocks::Vec2{0.0, 10.0}},
  };

  robolocks::Order face_left{
    .kind = robolocks::OrderKind::FaceArmorToward,
    .payload = robolocks::FaceArmorTowardOrder{robolocks::Vec2{-10.0, 0.0}},
  };

  const auto result = battle_simulation.step({
    robolocks::UnitOrders{robolocks::UnitId{1}, {aim_up, face_left}},
  });

  REQUIRE(result.snapshot.tick == 1);
  REQUIRE(result.snapshot.units.size() == 1);
  REQUIRE(result.snapshot.units[0].turret_heading_deg == Catch::Approx(90.0));
  REQUIRE(result.snapshot.units[0].hull_heading_deg == Catch::Approx(120.0));
}

TEST_CASE("battle_simulation uses mobility turret and armor components from unit spec") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.units = {
    robolocks::UnitSpec{
      .unit_id = robolocks::UnitId{1},
      .name = "Blue",
      .transform = robolocks::TransformSpec{
        .position = robolocks::Vec2{0.0, 0.0},
        .hull_heading_deg = 0.0,
      },
      .mobility = robolocks::MobilitySpec{
        .max_speed_mps = 3.0,
        .max_hull_turn_degps = 45.0,
      },
      .turret = robolocks::TurretSpec{
        .heading_deg = 0.0,
        .max_turn_degps = 30.0,
      },
      .armor = robolocks::ArmorSpec{
        .integrity = 87.5,
      },
    },
  };

  robolocks::BattleSimulation battle_simulation(config);

  const auto result = battle_simulation.step({
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

TEST_CASE("battle_simulation applies FireIfSolution through weapon damage and reload") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.units = {
    make_unit(robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}, 0.0, 100.0, 0.0, 0.0),
    make_unit(robolocks::UnitId{2}, "Red", robolocks::Vec2{10.0, 0.0}, 0.0, 100.0, 180.0, 180.0),
  };

  robolocks::BattleSimulation battle_simulation(config);

  const auto first = battle_simulation.step({
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

  REQUIRE(first.snapshot.units[1].armor_integrity == Catch::Approx(62.5));
  REQUIRE(first.events.size() == 2);
  REQUIRE(first.events[0].unit_id == robolocks::UnitId{1});
  REQUIRE(first.events[0].code == "weapon_fired");
  REQUIRE(first.events[1].unit_id == robolocks::UnitId{2});
  REQUIRE(first.events[1].code == "armor_damage");

  const auto second = battle_simulation.step({
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

  REQUIRE(second.snapshot.units[1].armor_integrity == Catch::Approx(62.5));
  REQUIRE(second.events.size() == 1);
  REQUIRE(second.events[0].unit_id == robolocks::UnitId{1});
  REQUIRE(second.events[0].code == "weapon_reloading");
}

TEST_CASE("battle_simulation advances fired projectiles before applying damage") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.units = {
    make_unit(robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}, 0.0, 100.0, 0.0, 0.0),
    make_unit(robolocks::UnitId{2}, "Red", robolocks::Vec2{10.0, 0.0}, 0.0, 100.0, 180.0, 180.0),
  };
  config.units[0].weapon.muzzle_velocity_mps = 4.0;
  config.units[0].weapon.projectile_radius_m = 0.1;
  config.units[1].body.shape.radius_m = 1.0;

  robolocks::BattleSimulation battle_simulation(config);

  const auto first = battle_simulation.step({
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

  REQUIRE(first.snapshot.units[1].armor_integrity == Catch::Approx(100.0));
  REQUIRE(first.snapshot.projectiles.size() == 1);
  REQUIRE(first.snapshot.projectiles[0].position.x == Catch::Approx(4.0));
  REQUIRE(first.events.size() == 1);
  REQUIRE(first.events[0].code == "weapon_fired");

  const auto second = battle_simulation.step({});

  REQUIRE(second.snapshot.units[1].armor_integrity == Catch::Approx(100.0));
  REQUIRE(second.snapshot.projectiles.size() == 1);
  REQUIRE(second.snapshot.projectiles[0].position.x == Catch::Approx(8.0));

  const auto third = battle_simulation.step({});

  REQUIRE(third.snapshot.units[1].armor_integrity == Catch::Approx(62.5));
  REQUIRE(third.snapshot.projectiles.empty());
  REQUIRE(third.events.size() == 1);
  REQUIRE(third.events[0].unit_id == robolocks::UnitId{2});
  REQUIRE(third.events[0].code == "armor_damage");
}

TEST_CASE("battle_simulation spawns fired projectiles from the weapon muzzle") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.units = {
    make_unit(robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}, 0.0, 100.0, 0.0, 0.0),
    make_unit(robolocks::UnitId{2}, "Red", robolocks::Vec2{20.0, 0.0}, 0.0, 100.0, 180.0, 180.0),
  };
  config.units[0].weapon.muzzle_velocity_mps = 4.0;
  config.units[0].weapon.muzzle_offset_m = robolocks::Vec3{2.0, 0.0, 1.4};
  config.units[0].weapon.projectile_radius_m = 0.1;
  config.units[1].body.shape.radius_m = 1.0;

  robolocks::BattleSimulation battle_simulation(config);

  const auto result = battle_simulation.step({
    robolocks::UnitOrders{
      robolocks::UnitId{1},
      {
        robolocks::Order{
          .kind = robolocks::OrderKind::AimAt,
          .payload = robolocks::AimAtOrder{robolocks::Vec2{20.0, 0.0}},
        },
        robolocks::Order{
          .kind = robolocks::OrderKind::FireIfSolution,
          .payload = robolocks::FireIfSolutionOrder{0.6},
        },
      },
    },
  });

  REQUIRE(result.events.size() == 1);
  REQUIRE(result.events[0].code == "weapon_fired");
  REQUIRE(result.snapshot.projectiles.size() == 1);
  REQUIRE(result.snapshot.projectiles[0].previous_position.x == Catch::Approx(2.0));
  REQUIRE(result.snapshot.projectiles[0].previous_position.y == Catch::Approx(0.0));
  REQUIRE(result.snapshot.projectiles[0].previous_height_m == Catch::Approx(1.4));
  REQUIRE(result.snapshot.projectiles[0].position.x == Catch::Approx(6.0));
  REQUIRE(result.snapshot.projectiles[0].position.y == Catch::Approx(0.0));
  REQUIRE(result.snapshot.projectiles[0].height_m == Catch::Approx(1.4));
}

TEST_CASE("battle_simulation resolves projectile penetration against armor facing") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.units = {
    make_unit(robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}, 0.0, 100.0, 0.0, 0.0),
    make_unit(robolocks::UnitId{2}, "Red", robolocks::Vec2{10.0, 0.0}, 0.0, 100.0, 180.0, 180.0),
  };
  config.units[0].weapon.muzzle_velocity_mps = 10.0;
  config.units[0].weapon.projectile_radius_m = 0.1;
  config.units[0].weapon.penetration_mm = 80.0;
  config.units[1].armor.front_mm = 120.0;
  config.units[1].armor.side_mm = 80.0;
  config.units[1].armor.rear_mm = 40.0;
  config.units[1].body.shape.radius_m = 1.0;

  robolocks::BattleSimulation front_simulation(config);
  const auto front_result = front_simulation.step({
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

  REQUIRE(front_result.snapshot.units[1].armor_integrity == Catch::Approx(100.0));
  REQUIRE(front_result.events.size() == 2);
  REQUIRE(front_result.events[0].code == "weapon_fired");
  REQUIRE(front_result.events[1].unit_id == robolocks::UnitId{2});
  REQUIRE(front_result.events[1].code == "armor_bounced");

  config.units[1].transform.hull_heading_deg = 0.0;
  config.units[1].turret.heading_deg = 0.0;
  robolocks::BattleSimulation rear_simulation(config);
  const auto rear_result = rear_simulation.step({
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

  REQUIRE(rear_result.snapshot.units[1].armor_integrity == Catch::Approx(62.5));
  REQUIRE(rear_result.events.size() == 2);
  REQUIRE(rear_result.events[0].code == "weapon_fired");
  REQUIRE(rear_result.events[1].unit_id == robolocks::UnitId{2});
  REQUIRE(rear_result.events[1].code == "armor_damage");
  REQUIRE(rear_result.events[1].payload.projectile_id == 1);
  REQUIRE(rear_result.events[1].payload.damage == Catch::Approx(37.5));
  REQUIRE(rear_result.events[1].payload.remaining_armor == Catch::Approx(62.5));
  REQUIRE(rear_result.events[1].payload.armor_facing == "rear");
  REQUIRE(rear_result.events[1].payload.penetration_mm == Catch::Approx(80.0));
  REQUIRE(rear_result.events[1].payload.armor_mm == Catch::Approx(40.0));
}

TEST_CASE("battle_simulation advances ballistic projectiles with height and blast impact") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 0.5;
  config.units = {
    make_unit(robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}, 0.0, 100.0, 0.0, 0.0),
    make_unit(robolocks::UnitId{2}, "Red", robolocks::Vec2{11.1874, 0.0}, 0.0, 100.0, 180.0, 180.0),
  };
  config.units[0].weapon.fire_mode = robolocks::WeaponFireMode::Ballistic;
  config.units[0].weapon.muzzle_velocity_mps = 10.0;
  config.units[0].weapon.muzzle_offset_m = robolocks::Vec3{0.0, 0.0, 1.5};
  config.units[0].weapon.launch_angle_deg = 45.0;
  config.units[0].weapon.gravity_mps2 = 10.0;
  config.units[0].weapon.blast_radius_m = 2.0;
  config.units[0].weapon.projectile_radius_m = 0.1;
  config.units[0].weapon.penetration_mm = 1000.0;

  robolocks::BattleSimulation battle_simulation(config);
  const auto first = battle_simulation.step({
    robolocks::UnitOrders{
      robolocks::UnitId{1},
      {
        robolocks::Order{
          .kind = robolocks::OrderKind::AimAt,
          .payload = robolocks::AimAtOrder{robolocks::Vec2{11.1874, 0.0}},
        },
        robolocks::Order{
          .kind = robolocks::OrderKind::FireIfSolution,
          .payload = robolocks::FireIfSolutionOrder{0.6},
        },
      },
    },
  });

  REQUIRE(first.events[0].code == "weapon_fired");
  REQUIRE(first.snapshot.projectiles.size() == 1);
  REQUIRE(first.snapshot.projectiles[0].previous_height_m == Catch::Approx(1.5));
  REQUIRE(first.snapshot.projectiles[0].height_m == Catch::Approx(3.7855).margin(0.001));
  REQUIRE(first.snapshot.projectiles[0].position.x == Catch::Approx(3.5355).margin(0.001));

  battle_simulation.step({});
  battle_simulation.step({});
  const auto fourth = battle_simulation.step({});

  REQUIRE(fourth.snapshot.projectiles.empty());
  REQUIRE(fourth.snapshot.units[1].armor_integrity == Catch::Approx(75.0));
  REQUIRE(fourth.events.size() == 1);
  REQUIRE(fourth.events[0].unit_id == robolocks::UnitId{2});
  REQUIRE(fourth.events[0].code == "armor_damage");
  REQUIRE(fourth.events[0].payload.damage_type == "splash");
  REQUIRE(fourth.events[0].payload.projectile_id == 1);
  REQUIRE(fourth.events[0].payload.damage == Catch::Approx(25.0).margin(0.001));
  REQUIRE(fourth.events[0].payload.remaining_armor == Catch::Approx(75.0).margin(0.001));
  REQUIRE(fourth.events[0].payload.impact_distance_m == Catch::Approx(0.0).margin(0.001));
  REQUIRE(fourth.events[0].payload.blast_radius_m == Catch::Approx(2.0));
}

TEST_CASE("battle_simulation rejects ballistic fire when target is outside the ballistic solution") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 0.5;
  config.units = {
    make_unit(robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}, 0.0, 100.0, 0.0, 0.0),
    make_unit(robolocks::UnitId{2}, "Red", robolocks::Vec2{20.0, 0.0}, 0.0, 100.0, 180.0, 180.0),
  };
  config.units[0].weapon.fire_mode = robolocks::WeaponFireMode::Ballistic;
  config.units[0].weapon.muzzle_velocity_mps = 10.0;
  config.units[0].weapon.launch_angle_deg = 45.0;
  config.units[0].weapon.gravity_mps2 = 10.0;
  config.units[0].weapon.blast_radius_m = 2.0;
  config.units[0].weapon.range_m = 80.0;

  robolocks::BattleSimulation battle_simulation(config);
  const auto result = battle_simulation.step({
    robolocks::UnitOrders{
      robolocks::UnitId{1},
      {
        robolocks::Order{
          .kind = robolocks::OrderKind::AimAt,
          .payload = robolocks::AimAtOrder{robolocks::Vec2{20.0, 0.0}},
        },
        robolocks::Order{
          .kind = robolocks::OrderKind::FireIfSolution,
          .payload = robolocks::FireIfSolutionOrder{0.6},
        },
      },
    },
  });

  REQUIRE(result.snapshot.projectiles.empty());
  REQUIRE(result.snapshot.units[1].armor_integrity == Catch::Approx(100.0));
  REQUIRE(result.events.size() == 1);
  REQUIRE(result.events[0].code == "fire_no_solution");
}

TEST_CASE("battle_simulation keeps FireIfSolution intent until turret solution is available") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.units = {
    robolocks::UnitSpec{
      .unit_id = robolocks::UnitId{1},
      .name = "Blue",
      .transform = robolocks::TransformSpec{
        .position = robolocks::Vec2{5.0, 5.0},
      },
      .mobility = robolocks::MobilitySpec{
        .max_speed_mps = 0.0,
      },
      .turret = robolocks::TurretSpec{
        .heading_deg = 0.0,
        .max_turn_degps = 45.0,
      },
      .weapon = robolocks::WeaponSpec{
        .damage = 25.0,
        .range_m = 80.0,
        .aim_tolerance_deg = 5.0,
        .reload_ticks = 30,
      },
      .body = robolocks::BodySpec{
        .shape = robolocks::BodyShapeSpec{.radius_m = 0.0},
      },
    },
    make_unit(robolocks::UnitId{2}, "Red", robolocks::Vec2{5.0, 15.0}, 0.0, 100.0, 180.0, 180.0),
  };

  robolocks::BattleSimulation battle_simulation(config);

  const auto first = battle_simulation.step({
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

  const auto second = battle_simulation.step({});

  REQUIRE(second.snapshot.units[1].armor_integrity == Catch::Approx(62.5));
  REQUIRE_FALSE(second.snapshot.units[0].weapon_intent_active);
  REQUIRE(second.events.size() == 2);
  REQUIRE(second.events[0].code == "weapon_fired");
}
