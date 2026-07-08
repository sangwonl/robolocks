#include <robolocks/battle_simulation.hpp>

#include <robolocks/actuator_system.hpp>
#include <robolocks/intent_state.hpp>
#include <robolocks/math.hpp>
#include <robolocks/order_resolution.hpp>
#include <robolocks/projectile_system.hpp>

#include <algorithm>
#include <cmath>
#include <utility>

namespace robolocks {

namespace {

constexpr double kPhysicsBlockedEpsilonM = 1.0e-3;

double distance_between(Vec2 from, Vec2 to) {
  return length(Vec2{to.x - from.x, to.y - from.y});
}

}  // namespace

BattleSimulation::BattleSimulation(BattleConfig config)
    : tick_dt_sec_(config.tick_dt_sec), physics_(config.bounds, config.obstacles) {
  units_.reserve(config.units.size());
  for (const auto& unit_spec : config.units) {
    units_.push_back(UnitState{
      .unit_id = unit_spec.unit_id,
      .transform = unit_spec.transform,
      .mobility = unit_spec.mobility,
      .turret = unit_spec.turret,
      .weapon = unit_spec.weapon,
      .armor = unit_spec.armor,
      .body = unit_spec.body,
      .sensor = unit_spec.sensor,
      .module_specs = UnitModulesSnapshot{
        .mobility = unit_spec.mobility,
        .turret = unit_spec.turret,
        .weapon = unit_spec.weapon,
        .armor = unit_spec.armor,
        .body = unit_spec.body,
        .sensor = unit_spec.sensor,
      },
      .weapon_cooldown_ticks = 0,
      .mobility_intent_active = false,
      .mobility_intent_target = unit_spec.transform.position,
      .mobility_intent_started_tick = 0,
      .mobility_intent_updated_tick = 0,
      .turret_intent_active = false,
      .turret_intent_target = unit_spec.transform.position,
      .turret_intent_started_tick = 0,
      .turret_intent_updated_tick = 0,
      .hull_intent_active = false,
      .hull_intent_target = unit_spec.transform.position,
      .hull_intent_started_tick = 0,
      .hull_intent_updated_tick = 0,
      .weapon_intent_active = false,
      .weapon_intent_min_hit_chance = 0.0,
      .weapon_intent_started_tick = 0,
      .weapon_intent_updated_tick = 0,
    });
  }
}

WorldSnapshot BattleSimulation::snapshot() const {
  WorldSnapshot out;
  out.tick = tick_;
  out.units.reserve(units_.size());
  for (const auto& unit : units_) {
    const double mobility_remaining = unit.mobility_intent_active
      ? distance_between(unit.transform.position, unit.mobility_intent_target)
      : 0.0;
    const double turret_error = unit.turret_intent_active
      ? std::abs(shortest_angle_delta_deg(
          unit.turret.heading_deg,
          angle_to(unit.transform.position, unit.turret_intent_target)
        ))
      : 0.0;
    const double hull_error = unit.hull_intent_active
      ? std::abs(shortest_angle_delta_deg(
          unit.transform.hull_heading_deg,
          angle_to(unit.transform.position, unit.hull_intent_target)
        ))
      : 0.0;
    out.units.push_back(UnitSnapshot{
      .unit_id = unit.unit_id,
      .position = unit.transform.position,
      .hull_heading_deg = unit.transform.hull_heading_deg,
      .turret_heading_deg = unit.turret.heading_deg,
      .armor_integrity = unit.armor.integrity,
      .weapon_cooldown_ticks = unit.weapon_cooldown_ticks,
      .body_shape_type = unit.body.shape.type,
      .body_radius_m = unit.body.shape.radius_m,
      .body_length_m = unit.body.shape.length_m,
      .body_width_m = unit.body.shape.width_m,
      .modules = unit.module_specs,
      .mobility_intent_active = unit.mobility_intent_active,
      .mobility_intent_target = unit.mobility_intent_target,
      .mobility_intent_remaining_m = mobility_remaining,
      .mobility_intent_age_ticks = intent_age(tick_, unit.mobility_intent_updated_tick),
      .turret_intent_active = unit.turret_intent_active,
      .turret_intent_target = unit.turret_intent_target,
      .turret_intent_error_deg = turret_error,
      .turret_intent_age_ticks = intent_age(tick_, unit.turret_intent_updated_tick),
      .hull_intent_active = unit.hull_intent_active,
      .hull_intent_target = unit.hull_intent_target,
      .hull_intent_error_deg = hull_error,
      .hull_intent_age_ticks = intent_age(tick_, unit.hull_intent_updated_tick),
      .weapon_intent_active = unit.weapon_intent_active,
      .weapon_intent_min_hit_chance = unit.weapon_intent_min_hit_chance,
      .weapon_intent_age_ticks = intent_age(tick_, unit.weapon_intent_updated_tick),
    });
  }
  out.projectiles.reserve(projectiles_.size());
  for (const auto& projectile : projectiles_) {
    out.projectiles.push_back(ProjectileSnapshot{
      .projectile_id = projectile.projectile_id,
      .owner_unit_id = projectile.owner_unit_id,
      .previous_position = projectile.previous_position,
      .position = projectile.position,
      .radius_m = projectile.radius_m,
      .height_m = projectile.height_m,
    });
  }
  return out;
}

StepResult BattleSimulation::step(const std::vector<UnitOrders>& orders_by_unit) {
  tick_ += 1;
  std::vector<Event> events;

  for (auto& unit : units_) {
    if (unit.armor.integrity <= 0.0) {
      clear_intents(unit);
      continue;
    }

    const auto resolved_orders = resolve_unit_orders(unit.unit_id, tick_, orders_by_unit);
    events.insert(events.end(), resolved_orders.events.begin(), resolved_orders.events.end());
    apply_resolved_orders_to_intents(unit, resolved_orders, tick_);
    advance_unit_actuators(unit, tick_dt_sec_);
  }

  auto weapon_events = resolve_weapon_fire(
    tick_,
    tick_dt_sec_,
    orders_by_unit,
    units_,
    projectiles_,
    next_projectile_id_
  );
  events.insert(events.end(), weapon_events.begin(), weapon_events.end());

  auto projectile_events = advance_projectiles(tick_, tick_dt_sec_, units_, projectiles_);
  events.insert(events.end(), projectile_events.begin(), projectile_events.end());

  std::vector<PhysicsBody> physics_bodies;
  physics_bodies.reserve(units_.size());
  std::vector<double> pre_physics_move_remaining;
  pre_physics_move_remaining.reserve(units_.size());
  for (const auto& unit : units_) {
    pre_physics_move_remaining.push_back(unit.mobility_intent_active
      ? distance_between(unit.transform.position, unit.mobility_intent_target)
      : 0.0);
    physics_bodies.push_back(PhysicsBody{
      .unit_id = unit.unit_id,
      .position = unit.transform.position,
      .shape = unit.body.shape,
      .heading_deg = unit.transform.hull_heading_deg,
      .mass_kg = unit.body.mass_kg,
    });
  }
  auto physics_events = physics_.resolve(tick_, physics_bodies);
  events.insert(events.end(), physics_events.begin(), physics_events.end());
  for (std::size_t i = 0; i < units_.size(); i += 1) {
    units_[i].transform.position = physics_bodies[i].position;
    if (units_[i].mobility_intent_active) {
      const double post_physics_remaining = distance_between(
        units_[i].transform.position,
        units_[i].mobility_intent_target
      );
      if (post_physics_remaining > pre_physics_move_remaining[i] + kPhysicsBlockedEpsilonM) {
        units_[i].mobility_intent_active = false;
      }
    }
  }

  std::vector<UnitOrders> visible_orders_by_unit;
  visible_orders_by_unit.reserve(orders_by_unit.size());
  for (const auto& unit_orders : orders_by_unit) {
    const auto alive = std::find_if(units_.begin(), units_.end(), [&unit_orders](const UnitState& unit) {
      return unit.unit_id == unit_orders.unit_id && unit.armor.integrity > 0.0;
    });
    if (alive != units_.end()) {
      visible_orders_by_unit.push_back(unit_orders);
    }
  }

  return StepResult{snapshot(), events, visible_orders_by_unit};
}

}  // namespace robolocks
