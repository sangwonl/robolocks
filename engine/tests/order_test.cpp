#include <catch2/catch_test_macros.hpp>

#include <robolocks/order.hpp>

TEST_CASE("order kinds map to control channels") {
  REQUIRE(robolocks::order_channel(robolocks::OrderKind::MoveTo) == robolocks::OrderChannel::Mobility);
  REQUIRE(robolocks::order_channel(robolocks::OrderKind::AimAt) == robolocks::OrderChannel::Turret);
  REQUIRE(robolocks::order_channel(robolocks::OrderKind::FireIfSolution) == robolocks::OrderChannel::Weapon);
  REQUIRE(robolocks::order_channel(robolocks::OrderKind::ScanArc) == robolocks::OrderChannel::Sensor);
  REQUIRE(robolocks::order_channel(robolocks::OrderKind::FaceArmorToward) == robolocks::OrderChannel::Hull);
}

TEST_CASE("order payload kind matches the payload type") {
  const robolocks::Order move_to_order{
    robolocks::OrderKind::MoveTo,
    robolocks::MoveToOrder{{1.0, 2.0}}
  };

  const robolocks::Order mismatched_order{
    robolocks::OrderKind::MoveTo,
    robolocks::AimAtOrder{{3.0, 4.0}}
  };

  REQUIRE(robolocks::order_payload_kind(robolocks::AimAtOrder{{5.0, 6.0}}) == robolocks::OrderKind::AimAt);
  REQUIRE(robolocks::order_payload_matches_kind(move_to_order));
  REQUIRE_FALSE(robolocks::order_payload_matches_kind(mismatched_order));
}
