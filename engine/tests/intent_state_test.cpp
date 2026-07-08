#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <robolocks/intent_state.hpp>

TEST_CASE("intent state applies resolved orders without resetting unchanged targets") {
  robolocks::UnitState unit{
    .unit_id = robolocks::UnitId{1},
    .mobility_intent_active = true,
    .mobility_intent_target = robolocks::Vec2{10.0, 0.0},
    .mobility_intent_started_tick = 3,
    .mobility_intent_updated_tick = 3,
  };
  robolocks::ResolvedUnitOrders resolved;
  resolved.move_to = robolocks::MoveToOrder{robolocks::Vec2{10.0, 0.0}};

  robolocks::apply_resolved_orders_to_intents(unit, resolved, 8);

  REQUIRE(unit.mobility_intent_active);
  REQUIRE(unit.mobility_intent_started_tick == 3);
  REQUIRE(unit.mobility_intent_updated_tick == 8);
}

TEST_CASE("intent state clears all active intents") {
  robolocks::UnitState unit{
    .unit_id = robolocks::UnitId{1},
    .mobility_intent_active = true,
    .turret_intent_active = true,
    .hull_intent_active = true,
    .weapon_intent_active = true,
  };

  robolocks::clear_intents(unit);

  REQUIRE_FALSE(unit.mobility_intent_active);
  REQUIRE_FALSE(unit.turret_intent_active);
  REQUIRE_FALSE(unit.hull_intent_active);
  REQUIRE_FALSE(unit.weapon_intent_active);
}

