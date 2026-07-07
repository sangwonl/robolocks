#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <robolocks/physics_system.hpp>

TEST_CASE("physics system resolves collisions by inverse mass and emits contact events") {
  robolocks::PhysicsSystem physics(robolocks::BattleBounds{
    .min = robolocks::Vec2{0.0, 0.0},
    .max = robolocks::Vec2{20.0, 10.0},
  });

  std::vector<robolocks::PhysicsBody> bodies = {
    robolocks::PhysicsBody{
      .unit_id = robolocks::UnitId{1},
      .position = robolocks::Vec2{5.0, 5.0},
      .shape = robolocks::BodyShapeComponent{.radius_m = 1.0},
      .mass_kg = 1000.0,
    },
    robolocks::PhysicsBody{
      .unit_id = robolocks::UnitId{2},
      .position = robolocks::Vec2{4.0, 5.0},
      .shape = robolocks::BodyShapeComponent{.radius_m = 1.0},
      .mass_kg = 3000.0,
    },
  };

  const auto events = physics.resolve(robolocks::Tick{7}, bodies);

  REQUIRE(bodies[0].position.x == Catch::Approx(5.75));
  REQUIRE(bodies[1].position.x == Catch::Approx(3.75));
  REQUIRE(events.size() == 2);
  REQUIRE(events[0].tick == 7);
  REQUIRE(events[0].unit_id == robolocks::UnitId{1});
  REQUIRE(events[0].code == "unit_collision");
  REQUIRE(events[1].unit_id == robolocks::UnitId{2});
}

TEST_CASE("physics system separates overlapping oriented box hulls") {
  robolocks::PhysicsSystem physics(robolocks::BattleBounds{
    .min = robolocks::Vec2{0.0, 0.0},
    .max = robolocks::Vec2{40.0, 24.0},
  });

  std::vector<robolocks::PhysicsBody> bodies = {
    robolocks::PhysicsBody{
      .unit_id = robolocks::UnitId{1},
      .position = robolocks::Vec2{17.0, 12.0},
      .shape = robolocks::BodyShapeComponent{
        .type = robolocks::BodyShapeType::Box,
        .radius_m = 1.2,
        .length_m = 5.6,
        .width_m = 2.8,
      },
      .heading_deg = 0.0,
      .mass_kg = 30000.0,
    },
    robolocks::PhysicsBody{
      .unit_id = robolocks::UnitId{2},
      .position = robolocks::Vec2{20.0, 12.0},
      .shape = robolocks::BodyShapeComponent{
        .type = robolocks::BodyShapeType::Box,
        .radius_m = 1.2,
        .length_m = 5.6,
        .width_m = 2.8,
      },
      .heading_deg = 180.0,
      .mass_kg = 30000.0,
    },
  };

  const auto events = physics.resolve(robolocks::Tick{12}, bodies);

  REQUIRE(events.size() == 2);
  REQUIRE(bodies[0].position.x == Catch::Approx(15.7));
  REQUIRE(bodies[1].position.x == Catch::Approx(21.3));
  REQUIRE(bodies[1].position.x - bodies[0].position.x == Catch::Approx(5.6));
}

TEST_CASE("physics system separates box hulls from circular obstacles using hull footprint") {
  robolocks::PhysicsSystem physics(
    robolocks::BattleBounds{
      .min = robolocks::Vec2{0.0, 0.0},
      .max = robolocks::Vec2{40.0, 24.0},
    },
    {
      robolocks::StaticObstacle{
        .id = "cover",
        .position = robolocks::Vec2{20.0, 12.0},
        .radius_m = 1.0,
        .blocks_movement = true,
      },
    }
  );

  std::vector<robolocks::PhysicsBody> bodies = {
    robolocks::PhysicsBody{
      .unit_id = robolocks::UnitId{1},
      .position = robolocks::Vec2{22.0, 12.0},
      .shape = robolocks::BodyShapeComponent{
        .type = robolocks::BodyShapeType::Box,
        .radius_m = 1.2,
        .length_m = 5.6,
        .width_m = 2.8,
      },
      .heading_deg = 0.0,
      .mass_kg = 30000.0,
    },
  };

  const auto events = physics.resolve(robolocks::Tick{9}, bodies);

  REQUIRE(bodies[0].position.x == Catch::Approx(23.8));
  REQUIRE(events.size() == 1);
  REQUIRE(events[0].tick == 9);
  REQUIRE(events[0].unit_id == robolocks::UnitId{1});
  REQUIRE(events[0].code == "obstacle_collision");
  REQUIRE(events[0].message == "Collided with obstacle cover.");
}
