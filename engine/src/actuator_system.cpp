#include <robolocks/actuator_system.hpp>

#include <robolocks/math.hpp>

#include <algorithm>
#include <cmath>
#include <optional>

namespace robolocks {

namespace {

constexpr double kMoveTargetEpsilon = 1.0e-9;

}  // namespace

void advance_unit_actuators(UnitState& unit, double tick_dt_sec) {
  const double move_remaining = unit.mobility_intent.active
    ? distance(unit.transform.position, unit.mobility_intent.target)
    : 0.0;
  if (unit.mobility_intent.active && move_remaining <= kMoveTargetEpsilon) {
    unit.mobility_intent.active = false;
  }

  if (unit.mobility_intent.active && move_remaining > kMoveTargetEpsilon) {
    const double max_distance = unit.mobility.max_speed_mps * tick_dt_sec;
    const double move_step = std::min(max_distance, move_remaining);
    const Vec2 forward = forward_vector(unit.transform.hull_heading_deg);
    unit.transform.position = Vec2{
      unit.transform.position.x + forward.x * move_step,
      unit.transform.position.y + forward.y * move_step,
    };
    if (distance(unit.transform.position, unit.mobility_intent.target) <= kMoveTargetEpsilon) {
      unit.mobility_intent.active = false;
    }
  }

  std::optional<double> hull_target_heading;
  if (unit.hull_intent.active) {
    hull_target_heading = angle_to(unit.transform.position, unit.hull_intent.target);
  } else if (unit.mobility_intent.active && move_remaining > kMoveTargetEpsilon) {
    hull_target_heading = angle_to(unit.transform.position, unit.mobility_intent.target);
  }

  if (hull_target_heading.has_value()) {
    const double max_delta = unit.mobility.max_hull_turn_degps * tick_dt_sec;
    unit.transform.hull_heading_deg = advance_angle_toward(
      unit.transform.hull_heading_deg,
      *hull_target_heading,
      max_delta
    );
  }

  if (unit.turret_intent.active) {
    const double target_heading = angle_to(unit.transform.position, unit.turret_intent.target);
    const double max_delta = unit.turret.max_turn_degps * tick_dt_sec;
    unit.turret.heading_deg = advance_angle_toward(unit.turret.heading_deg, target_heading, max_delta);
  }
}

}  // namespace robolocks
