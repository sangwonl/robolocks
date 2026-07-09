#include <robolocks/math.hpp>

#include <algorithm>
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

double distance(Vec2 from, Vec2 to) {
  return length(Vec2{to.x - from.x, to.y - from.y});
}

double dot(Vec2 a, Vec2 b) {
  return a.x * b.x + a.y * b.y;
}

Vec2 forward_vector(double heading_deg) {
  const double radians = normalize_angle_deg(heading_deg) * kPi / 180.0;
  return Vec2{std::cos(radians), std::sin(radians)};
}

Vec2 right_vector(double heading_deg) {
  const Vec2 forward = forward_vector(heading_deg);
  return Vec2{-forward.y, forward.x};
}

bool segment_intersects_circle(Vec2 a, Vec2 b, Vec2 center, double radius) {
  const Vec2 segment{b.x - a.x, b.y - a.y};
  const double length_sq = dot(segment, segment);
  if (length_sq <= 0.0) {
    return distance(a, center) <= radius;
  }
  const Vec2 a_to_center{center.x - a.x, center.y - a.y};
  const double t = clamp(dot(a_to_center, segment) / length_sq, 0.0, 1.0);
  const Vec2 closest{a.x + segment.x * t, a.y + segment.y * t};
  return distance(closest, center) <= radius;
}

double collision_radius(const BodyShapeSpec& shape) {
  if (shape.type == BodyShapeType::Box) {
    return std::max(shape.radius_m, std::hypot(shape.length_m * 0.5, shape.width_m * 0.5));
  }
  return shape.radius_m;
}

}  // namespace robolocks
