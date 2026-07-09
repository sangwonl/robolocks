#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <robolocks/battle_config.hpp>
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

TEST_CASE("distance measures a 3-4-5 triangle") {
  REQUIRE(robolocks::distance(robolocks::Vec2{0.0, 0.0}, robolocks::Vec2{3.0, 4.0}) == Catch::Approx(5.0));
  REQUIRE(robolocks::distance(robolocks::Vec2{3.0, 4.0}, robolocks::Vec2{0.0, 0.0}) == Catch::Approx(5.0));
}

TEST_CASE("dot of orthogonal vectors is zero") {
  REQUIRE(robolocks::dot(robolocks::Vec2{1.0, 0.0}, robolocks::Vec2{0.0, 1.0}) == Catch::Approx(0.0));
  REQUIRE(robolocks::dot(robolocks::Vec2{2.0, 3.0}, robolocks::Vec2{4.0, 5.0}) == Catch::Approx(23.0));
}

TEST_CASE("forward_vector points along the heading axes") {
  const auto east = robolocks::forward_vector(0.0);
  REQUIRE(east.x == Catch::Approx(1.0));
  REQUIRE(east.y == Catch::Approx(0.0).margin(1e-12));

  const auto north = robolocks::forward_vector(90.0);
  REQUIRE(north.x == Catch::Approx(0.0).margin(1e-12));
  REQUIRE(north.y == Catch::Approx(1.0));
}

TEST_CASE("right_vector is perpendicular to forward_vector at heading zero") {
  const auto right = robolocks::right_vector(0.0);
  REQUIRE(right.x == Catch::Approx(0.0).margin(1e-12));
  REQUIRE(right.y == Catch::Approx(1.0));
}

TEST_CASE("segment_intersects_circle detects hit, miss, and tangent cases") {
  const robolocks::Vec2 a{0.0, 0.0};
  const robolocks::Vec2 b{10.0, 0.0};

  // Segment passes straight through the circle.
  REQUIRE(robolocks::segment_intersects_circle(a, b, robolocks::Vec2{5.0, 0.0}, 1.0));

  // Circle is far off the segment's path.
  REQUIRE_FALSE(robolocks::segment_intersects_circle(a, b, robolocks::Vec2{5.0, 5.0}, 1.0));

  // Circle sits exactly one radius away from the segment: tangent counts as a hit.
  REQUIRE(robolocks::segment_intersects_circle(a, b, robolocks::Vec2{5.0, 1.0}, 1.0));

  // Degenerate zero-length segment falls back to a point-to-center distance check.
  REQUIRE(robolocks::segment_intersects_circle(a, a, robolocks::Vec2{0.0, 0.5}, 1.0));
  REQUIRE_FALSE(robolocks::segment_intersects_circle(a, a, robolocks::Vec2{5.0, 5.0}, 1.0));
}

TEST_CASE("collision_radius matches shape geometry") {
  robolocks::BodyShapeSpec circle;
  circle.type = robolocks::BodyShapeType::Circle;
  circle.radius_m = 2.5;
  REQUIRE(robolocks::collision_radius(circle) == Catch::Approx(2.5));

  robolocks::BodyShapeSpec box;
  box.type = robolocks::BodyShapeType::Box;
  box.radius_m = 1.0;
  box.length_m = 6.0;
  box.width_m = 8.0;
  // Half-diagonal of a 6x8 box is hypot(3, 4) == 5, which exceeds radius_m.
  REQUIRE(robolocks::collision_radius(box) == Catch::Approx(5.0));

  robolocks::BodyShapeSpec small_box;
  small_box.type = robolocks::BodyShapeType::Box;
  small_box.radius_m = 10.0;
  small_box.length_m = 1.0;
  small_box.width_m = 1.0;
  // radius_m dominates when it exceeds the half-diagonal.
  REQUIRE(robolocks::collision_radius(small_box) == Catch::Approx(10.0));
}
