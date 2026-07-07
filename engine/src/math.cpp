#include <robolocks/math.hpp>

#include <cmath>

namespace robolocks {

namespace {

constexpr double kPi = 3.14159265358979323846;

}  // namespace

double clamp(double value, double min_value, double max_value) {
  if (value < min_value) {
    return min_value;
  }
  if (value > max_value) {
    return max_value;
  }
  return value;
}

double length(Vec2 v) {
  return std::sqrt(v.x * v.x + v.y * v.y);
}

Vec2 normalize_or_zero(Vec2 v) {
  const double len = length(v);
  if (len <= 0.0) {
    return {};
  }
  return Vec2{v.x / len, v.y / len};
}

Vec2 advance_toward(Vec2 from, Vec2 to, double max_distance) {
  const Vec2 delta{to.x - from.x, to.y - from.y};
  const double distance = length(delta);
  if (distance <= max_distance || distance <= 0.0) {
    return to;
  }
  const Vec2 dir = normalize_or_zero(delta);
  return Vec2{
    from.x + dir.x * max_distance,
    from.y + dir.y * max_distance,
  };
}

double normalize_angle_deg(double angle_deg) {
  double normalized = std::fmod(angle_deg, 360.0);
  if (normalized < 0.0) {
    normalized += 360.0;
  }
  return normalized;
}

double angle_to(Vec2 from, Vec2 to) {
  const double radians = std::atan2(to.y - from.y, to.x - from.x);
  return normalize_angle_deg(radians * 180.0 / kPi);
}

double shortest_angle_delta_deg(double from_deg, double to_deg) {
  double delta = normalize_angle_deg(to_deg) - normalize_angle_deg(from_deg);
  // Snap near-180° values to exactly 180° before wrapping.  This prevents
  // the delta sign from flipping when the target angle oscillates across the
  // negative-x atan2 discontinuity (e.g. 179.9° ↔ 180.1°).
  if (delta > 179.0 && delta < 181.0) {
    delta = 180.0;
  } else if (delta < -179.0 && delta > -181.0) {
    delta = -180.0;
  }
  if (delta > 180.0) {
    delta -= 360.0;
  }
  if (delta < -180.0) {
    delta += 360.0;
  }
  return delta;
}

double advance_angle_toward(double from_deg, double to_deg, double max_delta_deg) {
  const double delta = shortest_angle_delta_deg(from_deg, to_deg);
  if (std::abs(delta) <= max_delta_deg) {
    return normalize_angle_deg(to_deg);
  }
  const double step = delta < 0.0 ? -max_delta_deg : max_delta_deg;
  return normalize_angle_deg(from_deg + step);
}

}  // namespace robolocks
