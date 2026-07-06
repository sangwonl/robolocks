#include <robolocks/math.hpp>

#include <cmath>

namespace robolocks {

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

}  // namespace robolocks
