#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <robolocks/order_resolution.hpp>

TEST_CASE("order resolution groups valid orders by control channel") {
  const std::vector<robolocks::UnitOrders> orders_by_unit{
    robolocks::UnitOrders{
      .unit_id = robolocks::UnitId{1},
      .orders = {
        robolocks::Order{
          .kind = robolocks::OrderKind::MoveTo,
          .payload = robolocks::MoveToOrder{robolocks::Vec2{3.0, 4.0}},
        },
        robolocks::Order{
          .kind = robolocks::OrderKind::AimAt,
          .payload = robolocks::AimAtOrder{robolocks::Vec2{9.0, 8.0}},
        },
      },
    },
  };

  const auto resolved = robolocks::resolve_unit_orders(robolocks::UnitId{1}, 12, orders_by_unit);

  REQUIRE(resolved.move_to.has_value());
  REQUIRE(resolved.move_to->position.x == Catch::Approx(3.0));
  REQUIRE(resolved.aim_at.has_value());
  REQUIRE(resolved.aim_at->target.y == Catch::Approx(8.0));
  REQUIRE(resolved.events.empty());
}

TEST_CASE("order resolution rejects duplicate orders on one control channel") {
  const std::vector<robolocks::UnitOrders> orders_by_unit{
    robolocks::UnitOrders{
      .unit_id = robolocks::UnitId{1},
      .orders = {
        robolocks::Order{
          .kind = robolocks::OrderKind::MoveTo,
          .payload = robolocks::MoveToOrder{robolocks::Vec2{3.0, 4.0}},
        },
        robolocks::Order{
          .kind = robolocks::OrderKind::MoveTo,
          .payload = robolocks::MoveToOrder{robolocks::Vec2{5.0, 6.0}},
        },
      },
    },
  };

  const auto resolved = robolocks::resolve_unit_orders(robolocks::UnitId{1}, 12, orders_by_unit);

  REQUIRE_FALSE(resolved.move_to.has_value());
  REQUIRE(resolved.events.size() == 1);
  REQUIRE(resolved.events[0].unit_id == robolocks::UnitId{1});
  REQUIRE(resolved.events[0].tick == 12);
  REQUIRE(resolved.events[0].code == "duplicate_mobility_order");
}

