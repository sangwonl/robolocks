#include <robolocks/intent_state.hpp>

#include <robolocks/math.hpp>

namespace robolocks {

namespace {

constexpr double kMoveTargetEpsilon = 1.0e-9;

void apply_target_intent(IntentChannelState& channel, const Vec2& target, Tick tick) {
  if (!channel.active || distance(channel.target, target) > kMoveTargetEpsilon) {
    channel.started_tick = tick;
  }
  channel.active = true;
  channel.target = target;
  channel.updated_tick = tick;
}

}  // namespace

void clear_intents(UnitState& unit) {
  unit.mobility_intent.active = false;
  unit.turret_intent.active = false;
  unit.hull_intent.active = false;
  unit.weapon_intent.active = false;
}

void apply_resolved_orders_to_intents(UnitState& unit, const ResolvedUnitOrders& resolved_orders, Tick tick) {
  if (resolved_orders.move_to.has_value()) {
    apply_target_intent(unit.mobility_intent, resolved_orders.move_to->position, tick);
  }
  if (resolved_orders.aim_at.has_value()) {
    apply_target_intent(unit.turret_intent, resolved_orders.aim_at->target, tick);
  }
  if (resolved_orders.face_armor_toward.has_value()) {
    apply_target_intent(unit.hull_intent, resolved_orders.face_armor_toward->target, tick);
  }
  if (resolved_orders.fire_if_solution.has_value()) {
    unit.weapon_intent.active = true;
    unit.weapon_intent.min_hit_chance = resolved_orders.fire_if_solution->min_hit_chance;
    unit.weapon_intent.started_tick = tick;
    unit.weapon_intent.updated_tick = tick;
  }
}

Tick intent_age(Tick snapshot_tick, Tick updated_tick) {
  if (snapshot_tick <= updated_tick) {
    return 0;
  }
  return snapshot_tick - updated_tick;
}

}  // namespace robolocks
