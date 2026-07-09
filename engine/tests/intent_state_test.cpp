#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <robolocks/intent_state.hpp>

TEST_CASE("intent state applies resolved orders without resetting unchanged targets") {
  robolocks::UnitState unit{
    .unit_id = robolocks::UnitId{1},
    .mobility_intent = robolocks::IntentChannelState{
      .active = true,
      .target = robolocks::Vec2{10.0, 0.0},
      .started_tick = 3,
      .updated_tick = 3,
    },
  };
  robolocks::ResolvedUnitOrders resolved;
  resolved.move_to = robolocks::MoveToOrder{robolocks::Vec2{10.0, 0.0}};

  robolocks::apply_resolved_orders_to_intents(unit, resolved, 8);

  REQUIRE(unit.mobility_intent.active);
  REQUIRE(unit.mobility_intent.started_tick == 3);
  REQUIRE(unit.mobility_intent.updated_tick == 8);
}

TEST_CASE("intent state clears all active intents") {
  robolocks::UnitState unit{
    .unit_id = robolocks::UnitId{1},
    .mobility_intent = robolocks::IntentChannelState{.active = true},
    .turret_intent = robolocks::IntentChannelState{.active = true},
    .hull_intent = robolocks::IntentChannelState{.active = true},
    .weapon_intent = robolocks::WeaponIntentState{.active = true},
  };

  robolocks::clear_intents(unit);

  REQUIRE_FALSE(unit.mobility_intent.active);
  REQUIRE_FALSE(unit.turret_intent.active);
  REQUIRE_FALSE(unit.hull_intent.active);
  REQUIRE_FALSE(unit.weapon_intent.active);
}

