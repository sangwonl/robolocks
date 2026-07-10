#include <catch2/catch_test_macros.hpp>

#include <robolocks/math.hpp>
#include <robolocks/sensor_system.hpp>

TEST_CASE("sensor system filters contacts by module range and field of view") {
  robolocks::SensorSystem sensors({
    robolocks::UnitSensorComponent{
      .unit_id = robolocks::UnitId{1},
      .component = robolocks::SensorSpec{
        .range_m = 10.0,
        .fov_deg = 90.0,
        .refresh_ticks = 1,
      },
    },
  });

  robolocks::WorldSnapshot snapshot;
  snapshot.tick = 3;
  snapshot.units = {
    robolocks::UnitSnapshot{
      .unit_id = robolocks::UnitId{1},
      .team_id = 1,
      .position = robolocks::Vec2{0.0, 0.0},
      .hull_heading_deg = 0.0,
      .turret_heading_deg = 0.0,
      .armor_integrity = 100.0,
    },
    robolocks::UnitSnapshot{
      .unit_id = robolocks::UnitId{2},
      .team_id = 2,
      .position = robolocks::Vec2{8.0, 0.0},
      .hull_heading_deg = 180.0,
      .turret_heading_deg = 180.0,
      .armor_integrity = 100.0,
    },
    robolocks::UnitSnapshot{
      .unit_id = robolocks::UnitId{3},
      .position = robolocks::Vec2{0.0, 8.0},
      .hull_heading_deg = 180.0,
      .turret_heading_deg = 180.0,
      .armor_integrity = 100.0,
    },
    robolocks::UnitSnapshot{
      .unit_id = robolocks::UnitId{4},
      .position = robolocks::Vec2{12.0, 0.0},
      .hull_heading_deg = 180.0,
      .turret_heading_deg = 180.0,
      .armor_integrity = 100.0,
    },
  };

  sensors.set_scan_arc(robolocks::UnitId{1}, robolocks::ScanArcOrder{.direction_deg = 0.0, .width_deg = 90.0});

  const auto observation = sensors.build_observation(snapshot, robolocks::UnitId{1});

  REQUIRE(observation.tick == 3);
  REQUIRE(observation.self_id == robolocks::UnitId{1});
  REQUIRE(observation.contacts.units.size() == 1);
  REQUIRE(observation.contacts.units[0].unit_id == robolocks::UnitId{2});
  REQUIRE(observation.contacts.units[0].is_enemy);
}

TEST_CASE("sensor system measures range from the mounted sensor origin") {
  robolocks::SensorSystem sensors({
    robolocks::UnitSensorComponent{
      .unit_id = robolocks::UnitId{1},
      .component = robolocks::SensorSpec{
        .range_m = 10.0,
        .fov_deg = 90.0,
        .refresh_ticks = 1,
      },
    },
  });

  robolocks::WorldSnapshot snapshot;
  snapshot.units = {
    robolocks::UnitSnapshot{
      .unit_id = robolocks::UnitId{1},
      .position = robolocks::Vec2{0.0, 0.0},
      .hull_heading_deg = 180.0,
      .turret_heading_deg = 180.0,
      .armor_integrity = 100.0,
      .body_shape_type = robolocks::BodyShapeType::Box,
      .body_radius_m = 1.2,
      .body_length_m = 5.6,
      .body_width_m = 2.8,
    },
    robolocks::UnitSnapshot{
      .unit_id = robolocks::UnitId{2},
      .position = robolocks::Vec2{-9.8, 0.0},
      .hull_heading_deg = 0.0,
      .turret_heading_deg = 0.0,
      .armor_integrity = 100.0,
    },
  };

  sensors.set_scan_arc(robolocks::UnitId{1}, robolocks::ScanArcOrder{.direction_deg = 180.0, .width_deg = 90.0});

  const auto observation = sensors.build_observation(snapshot, robolocks::UnitId{1});

  REQUIRE(observation.contacts.units.empty());
}

TEST_CASE("sensor system uses all-around sensing when module fov is 360 degrees") {
  robolocks::SensorSystem sensors({
    robolocks::UnitSensorComponent{
      .unit_id = robolocks::UnitId{1},
      .component = robolocks::SensorSpec{
        .range_m = 10.0,
        .fov_deg = 360.0,
        .refresh_ticks = 1,
      },
    },
  });

  robolocks::WorldSnapshot snapshot;
  snapshot.units = {
    robolocks::UnitSnapshot{
      .unit_id = robolocks::UnitId{1},
      .team_id = 1,
      .position = robolocks::Vec2{0.0, 0.0},
      .hull_heading_deg = 0.0,
      .turret_heading_deg = 0.0,
      .armor_integrity = 100.0,
    },
    robolocks::UnitSnapshot{
      .unit_id = robolocks::UnitId{2},
      .team_id = 2,
      .position = robolocks::Vec2{-8.0, 0.0},
      .hull_heading_deg = 180.0,
      .turret_heading_deg = 180.0,
      .armor_integrity = 100.0,
    },
  };

  sensors.set_scan_arc(robolocks::UnitId{1}, robolocks::ScanArcOrder{.direction_deg = 0.0, .width_deg = 360.0});

  const auto observation = sensors.build_observation(snapshot, robolocks::UnitId{1});

  REQUIRE(observation.contacts.units.size() == 1);
  REQUIRE(observation.contacts.units[0].unit_id == robolocks::UnitId{2});
}

TEST_CASE("sensor system blocks contacts behind line-of-sight obstacles") {
  robolocks::SensorSystem sensors(
    {
      robolocks::UnitSensorComponent{
        .unit_id = robolocks::UnitId{1},
        .component = robolocks::SensorSpec{
          .range_m = 20.0,
          .fov_deg = 360.0,
          .refresh_ticks = 1,
        },
      },
    },
    {
      robolocks::StaticObstacle{
        .id = "cover",
        .position = robolocks::Vec2{5.0, 0.0},
        .radius_m = 1.0,
        .blocks_movement = true,
        .blocks_line_of_sight = true,
      },
    }
  );

  robolocks::WorldSnapshot snapshot;
  snapshot.units = {
    robolocks::UnitSnapshot{
      .unit_id = robolocks::UnitId{1},
      .team_id = 1,
      .position = robolocks::Vec2{0.0, 0.0},
      .hull_heading_deg = 0.0,
      .turret_heading_deg = 0.0,
      .armor_integrity = 100.0,
    },
    robolocks::UnitSnapshot{
      .unit_id = robolocks::UnitId{2},
      .team_id = 2,
      .position = robolocks::Vec2{10.0, 0.0},
      .hull_heading_deg = 180.0,
      .turret_heading_deg = 180.0,
      .armor_integrity = 100.0,
    },
  };

  sensors.set_scan_arc(robolocks::UnitId{1}, robolocks::ScanArcOrder{.direction_deg = 0.0, .width_deg = 360.0});

  const auto observation = sensors.build_observation(snapshot, robolocks::UnitId{1});

  REQUIRE(observation.contacts.units.empty());
}

TEST_CASE("sensor system reports obstacle and projectile contacts inside scan volume") {
  robolocks::SensorSystem sensors(
    {
      robolocks::UnitSensorComponent{
        .unit_id = robolocks::UnitId{1},
        .component = robolocks::SensorSpec{
          .range_m = 20.0,
          .fov_deg = 90.0,
          .refresh_ticks = 1,
        },
      },
    },
    {
      robolocks::StaticObstacle{
        .id = "visible_cover",
        .position = robolocks::Vec2{8.0, 1.0},
        .radius_m = 1.0,
        .blocks_movement = true,
        .blocks_line_of_sight = true,
      },
      robolocks::StaticObstacle{
        .id = "outside_arc",
        .position = robolocks::Vec2{0.0, 8.0},
        .radius_m = 1.0,
        .blocks_movement = true,
        .blocks_line_of_sight = true,
      },
    }
  );

  robolocks::WorldSnapshot snapshot;
  snapshot.units = {
    robolocks::UnitSnapshot{
      .unit_id = robolocks::UnitId{1},
      .position = robolocks::Vec2{0.0, 0.0},
      .hull_heading_deg = 0.0,
      .turret_heading_deg = 0.0,
      .armor_integrity = 100.0,
      .body_shape_type = robolocks::BodyShapeType::Box,
      .body_radius_m = 1.2,
      .body_length_m = 5.6,
      .body_width_m = 2.8,
    },
  };
  snapshot.projectiles = {
    robolocks::ProjectileSnapshot{
      .projectile_id = 7,
      .owner_unit_id = robolocks::UnitId{2},
      .previous_position = robolocks::Vec2{4.0, 0.0},
      .position = robolocks::Vec2{6.0, 0.0},
      .radius_m = 0.08,
      .previous_height_m = 1.0,
      .height_m = 1.0,
    },
    robolocks::ProjectileSnapshot{
      .projectile_id = 8,
      .owner_unit_id = robolocks::UnitId{2},
      .previous_position = robolocks::Vec2{0.0, 4.0},
      .position = robolocks::Vec2{0.0, 6.0},
      .radius_m = 0.08,
      .previous_height_m = 1.0,
      .height_m = 1.0,
    },
  };

  sensors.set_scan_arc(robolocks::UnitId{1}, robolocks::ScanArcOrder{.direction_deg = 0.0, .width_deg = 90.0});

  const auto observation = sensors.build_observation(snapshot, robolocks::UnitId{1});

  REQUIRE(observation.contacts.obstacles.size() == 1);
  REQUIRE(observation.contacts.obstacles[0].id == "visible_cover");
  REQUIRE(observation.contacts.projectiles.size() == 1);
  REQUIRE(observation.contacts.projectiles[0].projectile_id == 7);
}

TEST_CASE("sensor scan direction slews toward the request at the module rate") {
  robolocks::SensorSystem sensors({
    robolocks::UnitSensorComponent{
      .unit_id = robolocks::UnitId{1},
      .component = robolocks::SensorSpec{.range_m = 100.0, .fov_deg = 360.0, .refresh_ticks = 1, .max_scan_slew_degps = 360.0},
    },
  });

  // First scan orients instantly (initial mounting).
  sensors.set_scan_arc(robolocks::UnitId{1}, robolocks::ScanArcOrder{.direction_deg = 0.0, .width_deg = 30.0});
  auto s0 = sensors.scan_state_for(robolocks::UnitId{1});
  REQUIRE(s0.active);
  REQUIRE(s0.direction_deg < 1e-6);
  REQUIRE(s0.direction_deg > -1e-6);

  // Request a 180-degree swing. At 360 deg/s and dt = 1/60s the cap is 6 deg/tick,
  // so one tick must NOT snap to 180.
  sensors.set_scan_arc(robolocks::UnitId{1}, robolocks::ScanArcOrder{.direction_deg = 180.0, .width_deg = 30.0});
  sensors.advance_scan(1.0 / 60.0);
  auto s1 = sensors.scan_state_for(robolocks::UnitId{1});
  REQUIRE(s1.direction_deg > 0.0);
  REQUIRE(s1.direction_deg <= 6.0 + 1e-6);
}

TEST_CASE("sensor refreshTicks holds contacts between refreshes") {
  robolocks::SensorSystem sensors({
    robolocks::UnitSensorComponent{
      .unit_id = robolocks::UnitId{1},
      .component = robolocks::SensorSpec{.range_m = 100.0, .fov_deg = 360.0, .refresh_ticks = 3, .max_scan_slew_degps = 360.0},
    },
  });
  sensors.set_scan_arc(robolocks::UnitId{1}, robolocks::ScanArcOrder{.direction_deg = 0.0, .width_deg = 360.0});

  auto make_snapshot = [](robolocks::Tick tick, robolocks::Vec2 enemy_pos) {
    robolocks::WorldSnapshot snapshot;
    snapshot.tick = tick;
    snapshot.units = {
      robolocks::UnitSnapshot{.unit_id = robolocks::UnitId{1}, .team_id = 1, .position = robolocks::Vec2{0.0, 0.0}, .armor_integrity = 100.0},
      robolocks::UnitSnapshot{.unit_id = robolocks::UnitId{2}, .team_id = 2, .position = enemy_pos, .armor_integrity = 100.0},
    };
    return snapshot;
  };

  // Tick 0: enemy in range -> detected and cached.
  auto obs0 = sensors.build_observation(make_snapshot(0, robolocks::Vec2{5.0, 0.0}), robolocks::UnitId{1});
  REQUIRE(obs0.contacts.units.size() == 1);

  // Tick 1 (before refresh window elapses): enemy moved far away, but the cached
  // contact is held.
  auto obs1 = sensors.build_observation(make_snapshot(1, robolocks::Vec2{500.0, 0.0}), robolocks::UnitId{1});
  REQUIRE(obs1.contacts.units.size() == 1);

  // Tick 3 (>= refresh_ticks since last refresh): re-scans, enemy now out of range.
  auto obs3 = sensors.build_observation(make_snapshot(3, robolocks::Vec2{500.0, 0.0}), robolocks::UnitId{1});
  REQUIRE(obs3.contacts.units.empty());
}

TEST_CASE("sensor scan rotates smoothly (no reversal) when the request outpaces the slew rate") {
  robolocks::SensorSystem sensors({
    robolocks::UnitSensorComponent{
      .unit_id = robolocks::UnitId{1},
      .component = robolocks::SensorSpec{.range_m = 100.0, .fov_deg = 360.0, .refresh_ticks = 1, .max_scan_slew_degps = 360.0},
    },
  });

  double request = 0.0;
  sensors.set_scan_arc(robolocks::UnitId{1}, robolocks::ScanArcOrder{.direction_deg = 0.0, .width_deg = 160.0});
  sensors.advance_scan(1.0 / 60.0);
  double prev = sensors.scan_state_for(robolocks::UnitId{1}).direction_deg;

  // Request +10 deg/tick, well above the 6 deg/tick cap. Every tick the scan must
  // advance in the SAME direction (no 180-degree wrap reversal) and never exceed
  // the per-tick cap.
  for (int i = 0; i < 90; i += 1) {
    request += 10.0;
    sensors.set_scan_arc(robolocks::UnitId{1}, robolocks::ScanArcOrder{.direction_deg = request, .width_deg = 160.0});
    sensors.advance_scan(1.0 / 60.0);
    const double cur = sensors.scan_state_for(robolocks::UnitId{1}).direction_deg;
    const double step = robolocks::shortest_angle_delta_deg(prev, cur);
    REQUIRE(step > 0.0);
    REQUIRE(step <= 6.0 + 1e-6);
    prev = cur;
  }
}
