#include <robolocks/intent_state.hpp>

#include <robolocks/math.hpp>

namespace robolocks {

namespace {

constexpr double kMoveTargetEpsilon = 1.0e-9;

}  // namespace

void clear_intents(UnitState& unit) {
  unit.mobility_intent_active = false;
  unit.turret_intent_active = false;
  unit.hull_intent_active = false;
  unit.weapon_intent_active = false;
}

void apply_resolved_orders_to_intents(UnitState& unit, const ResolvedUnitOrders& resolved_orders, Tick tick) {
  if (resolved_orders.move_to.has_value()) {
    if (!unit.mobility_intent_active ||
        distance(unit.mobility_intent_target, resolved_orders.move_to->position) > kMoveTargetEpsilon) {
      unit.mobility_intent_started_tick = tick;
    }
    unit.mobility_intent_active = true;
    unit.mobility_intent_target = resolved_orders.move_to->position;
    unit.mobility_intent_updated_tick = tick;
  }
  if (resolved_orders.aim_at.has_value()) {
    if (!unit.turret_intent_active ||
        distance(unit.turret_intent_target, resolved_orders.aim_at->target) > kMoveTargetEpsilon) {
      unit.turret_intent_started_tick = tick;
    }
    unit.turret_intent_active = true;
    unit.turret_intent_target = resolved_orders.aim_at->target;
    unit.turret_intent_updated_tick = tick;
  }
  if (resolved_orders.face_armor_toward.has_value()) {
    if (!unit.hull_intent_active ||
        distance(unit.hull_intent_target, resolved_orders.face_armor_toward->target) > kMoveTargetEpsilon) {
      unit.hull_intent_started_tick = tick;
    }
    unit.hull_intent_active = true;
    unit.hull_intent_target = resolved_orders.face_armor_toward->target;
    unit.hull_intent_updated_tick = tick;
  }
  if (resolved_orders.fire_if_solution.has_value()) {
    unit.weapon_intent_active = true;
    unit.weapon_intent_min_hit_chance = resolved_orders.fire_if_solution->min_hit_chance;
    unit.weapon_intent_started_tick = tick;
    unit.weapon_intent_updated_tick = tick;
  }
}

Tick intent_age(Tick snapshot_tick, Tick updated_tick) {
  if (snapshot_tick <= updated_tick) {
    return 0;
  }
  return snapshot_tick - updated_tick;
}

}  // namespace robolocks
