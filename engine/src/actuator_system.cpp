#include <robolocks/actuator_system.hpp>

#include <robolocks/math.hpp>

#include <algorithm>
#include <cmath>
#include <optional>

namespace robolocks {

namespace {

constexpr double kPi = 3.14159265358979323846;
constexpr double kMoveTargetEpsilon = 1.0e-9;

double distance_between(Vec2 from, Vec2 to) {
  return length(Vec2{to.x - from.x, to.y - from.y});
}

Vec2 forward_vector(double heading_deg) {
  const double radians = normalize_angle_deg(heading_deg) * kPi / 180.0;
  return Vec2{std::cos(radians), std::sin(radians)};
}

}  // namespace

void advance_unit_actuators(UnitState& unit, double tick_dt_sec) {
  const double move_remaining = unit.mobility_intent_active
    ? distance_between(unit.transform.position, unit.mobility_intent_target)
    : 0.0;
  if (unit.mobility_intent_active && move_remaining <= kMoveTargetEpsilon) {
    unit.mobility_intent_active = false;
  }

  if (unit.mobility_intent_active && move_remaining > kMoveTargetEpsilon) {
    const double max_distance = unit.mobility.max_speed_mps * tick_dt_sec;
    const double distance = std::min(max_distance, move_remaining);
    const Vec2 forward = forward_vector(unit.transform.hull_heading_deg);
    unit.transform.position = Vec2{
      unit.transform.position.x + forward.x * distance,
      unit.transform.position.y + forward.y * distance,
    };
    if (distance_between(unit.transform.position, unit.mobility_intent_target) <= kMoveTargetEpsilon) {
      unit.mobility_intent_active = false;
    }
  }

  std::optional<double> hull_target_heading;
  if (unit.hull_intent_active) {
    hull_target_heading = angle_to(unit.transform.position, unit.hull_intent_target);
  } else if (unit.mobility_intent_active && move_remaining > kMoveTargetEpsilon) {
    hull_target_heading = angle_to(unit.transform.position, unit.mobility_intent_target);
  }

  if (hull_target_heading.has_value()) {
    const double max_delta = unit.mobility.max_hull_turn_degps * tick_dt_sec;
    unit.transform.hull_heading_deg = advance_angle_toward(
      unit.transform.hull_heading_deg,
      *hull_target_heading,
      max_delta
    );
  }

  if (unit.turret_intent_active) {
    const double target_heading = angle_to(unit.transform.position, unit.turret_intent_target);
    const double max_delta = unit.turret.max_turn_degps * tick_dt_sec;
    unit.turret.heading_deg = advance_angle_toward(unit.turret.heading_deg, target_heading, max_delta);
  }
}

}  // namespace robolocks
