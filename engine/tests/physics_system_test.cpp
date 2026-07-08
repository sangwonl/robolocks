#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <robolocks/physics_system.hpp>

#include <cmath>

namespace {

double distance(robolocks::Vec2 a, robolocks::Vec2 b) {
  const double dx = a.x - b.x;
  const double dy = a.y - b.y;
  return std::sqrt(dx * dx + dy * dy);
}

}  // namespace

TEST_CASE("physics system uses the jolt 3d backend") {
  robolocks::PhysicsSystem physics(robolocks::BattleBounds{});

  REQUIRE(physics.backend_name() == std::string("jolt"));
  REQUIRE(physics.uses_3d_backend());
}

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

  REQUIRE(distance(bodies[0].position, bodies[1].position) >= Catch::Approx(2.0).margin(0.05));
  REQUIRE(bodies[0].position.x > 5.0);
  REQUIRE(bodies[1].position.x < 4.0);
  REQUIRE((bodies[0].position.x - 5.0) > (4.0 - bodies[1].position.x));
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
  REQUIRE(bodies[0].position.x <= 17.01);
  REQUIRE(bodies[1].position.x >= 19.99);
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

  REQUIRE(bodies[0].position.x >= 22.0);
  REQUIRE(events.size() == 1);
  REQUIRE(events[0].tick == 9);
  REQUIRE(events[0].unit_id == robolocks::UnitId{1});
  REQUIRE(events[0].code == "obstacle_collision");
  REQUIRE(events[0].message == "Collided with obstacle cover.");
}
