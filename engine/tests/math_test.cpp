#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <robolocks/math.hpp>

TEST_CASE("vector length is deterministic for simple values") {
  const robolocks::Vec2 v{3.0, 4.0};
  REQUIRE(robolocks::length(v) == Catch::Approx(5.0));
}

TEST_CASE("normalize_or_zero handles zero vector") {
  const robolocks::Vec2 v{0.0, 0.0};
  const auto n = robolocks::normalize_or_zero(v);
  REQUIRE(n.x == 0.0);
  REQUIRE(n.y == 0.0);
}

TEST_CASE("advance_toward does not overshoot") {
  const robolocks::Vec2 from{0.0, 0.0};
  const robolocks::Vec2 to{10.0, 0.0};
  const auto moved = robolocks::advance_toward(from, to, 3.0);
  REQUIRE(moved.x == Catch::Approx(3.0));
  REQUIRE(moved.y == Catch::Approx(0.0));

  const auto clamped = robolocks::advance_toward(from, to, 20.0);
  REQUIRE(clamped.x == Catch::Approx(10.0));
  REQUIRE(clamped.y == Catch::Approx(0.0));
}

TEST_CASE("angle_to returns a wrapped heading in degrees") {
  REQUIRE(robolocks::angle_to(robolocks::Vec2{0.0, 0.0}, robolocks::Vec2{1.0, 0.0}) == Catch::Approx(0.0));
  REQUIRE(robolocks::angle_to(robolocks::Vec2{0.0, 0.0}, robolocks::Vec2{0.0, 1.0}) == Catch::Approx(90.0));
  REQUIRE(robolocks::angle_to(robolocks::Vec2{0.0, 0.0}, robolocks::Vec2{-1.0, 0.0}) == Catch::Approx(180.0));
  REQUIRE(robolocks::angle_to(robolocks::Vec2{0.0, 0.0}, robolocks::Vec2{0.0, -1.0}) == Catch::Approx(270.0));
}

TEST_CASE("advance_angle_toward takes the shortest wrapped turn") {
  REQUIRE(robolocks::advance_angle_toward(350.0, 10.0, 5.0) == Catch::Approx(355.0));
  REQUIRE(robolocks::advance_angle_toward(350.0, 10.0, 20.0) == Catch::Approx(10.0));
  REQUIRE(robolocks::advance_angle_toward(10.0, 350.0, 5.0) == Catch::Approx(5.0));
}
