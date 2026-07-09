#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <robolocks/actuator_system.hpp>

TEST_CASE("actuator system moves along current hull heading before turning") {
  robolocks::UnitState unit{
    .unit_id = robolocks::UnitId{1},
    .transform = robolocks::TransformSpec{
      .position = robolocks::Vec2{0.0, 0.0},
      .hull_heading_deg = 0.0,
    },
    .mobility = robolocks::MobilitySpec{
      .max_speed_mps = 2.0,
      .max_hull_turn_degps = 90.0,
    },
    .mobility_intent = robolocks::IntentChannelState{
      .active = true,
      .target = robolocks::Vec2{0.0, 10.0},
    },
  };

  robolocks::advance_unit_actuators(unit, 1.0);

  REQUIRE(unit.transform.position.x == Catch::Approx(2.0));
  REQUIRE(unit.transform.position.y == Catch::Approx(0.0));
  REQUIRE(unit.transform.hull_heading_deg == Catch::Approx(90.0));
}

