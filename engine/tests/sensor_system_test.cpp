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
      .position = robolocks::Vec2{0.0, 0.0},
      .hull_heading_deg = 0.0,
      .turret_heading_deg = 0.0,
      .armor_integrity = 100.0,
    },
    robolocks::UnitSnapshot{
      .unit_id = robolocks::UnitId{2},
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
  REQUIRE(observation.contacts.size() == 1);
  REQUIRE(observation.contacts[0].unit_id == robolocks::UnitId{2});
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
    robolocks::UnitSnapshot{robolocks::UnitId{1}, robolocks::Vec2{0.0, 0.0}, 0.0, 0.0, 100.0},
    robolocks::UnitSnapshot{robolocks::UnitId{2}, robolocks::Vec2{-8.0, 0.0}, 180.0, 180.0, 100.0},
  };

  sensors.set_scan_arc(robolocks::UnitId{1}, robolocks::ScanArcOrder{.direction_deg = 0.0, .width_deg = 360.0});

  const auto observation = sensors.build_observation(snapshot, robolocks::UnitId{1});

  REQUIRE(observation.contacts.size() == 1);
  REQUIRE(observation.contacts[0].unit_id == robolocks::UnitId{2});
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
    robolocks::UnitSnapshot{robolocks::UnitId{1}, robolocks::Vec2{0.0, 0.0}, 0.0, 0.0, 100.0},
    robolocks::UnitSnapshot{robolocks::UnitId{2}, robolocks::Vec2{10.0, 0.0}, 180.0, 180.0, 100.0},
  };

  sensors.set_scan_arc(robolocks::UnitId{1}, robolocks::ScanArcOrder{.direction_deg = 0.0, .width_deg = 360.0});

  const auto observation = sensors.build_observation(snapshot, robolocks::UnitId{1});

  REQUIRE(observation.contacts.empty());
}
