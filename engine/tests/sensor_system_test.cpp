#include <catch2/catch_test_macros.hpp>

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
