#include <robolocks/battlefield.hpp>

#include <robolocks/math.hpp>

#include <algorithm>
#include <cmath>
#include <optional>

namespace robolocks {

namespace {

constexpr double kPi = 3.14159265358979323846;
constexpr double kMoveTargetEpsilon = 1.0e-9;
constexpr double kMinHitChance = 0.0;
constexpr double kMaxHitChance = 1.0;

double distance_between(Vec2 from, Vec2 to) {
  return length(Vec2{to.x - from.x, to.y - from.y});
}

Vec2 forward_vector(double heading_deg) {
  const double radians = normalize_angle_deg(heading_deg) * kPi / 180.0;
  return Vec2{std::cos(radians), std::sin(radians)};
}

double hit_chance_for_error(double error_deg, double aim_tolerance_deg) {
  if (aim_tolerance_deg <= 0.0) {
    return error_deg <= 0.0 ? kMaxHitChance : kMinHitChance;
  }
  return clamp(kMaxHitChance - (error_deg / aim_tolerance_deg), kMinHitChance, kMaxHitChance);
}

Tick intent_age(Tick snapshot_tick, Tick updated_tick) {
  if (snapshot_tick <= updated_tick) {
    return 0;
  }
  return snapshot_tick - updated_tick;
}

}  // namespace

Battlefield::Battlefield(BattleConfig config)
    : tick_dt_sec_(config.tick_dt_sec), physics_(config.bounds, config.obstacles) {
  units_.reserve(config.tanks.size());
  for (const auto& tank : config.tanks) {
    units_.push_back(UnitState{
      .unit_id = tank.unit_id,
      .transform = tank.transform,
      .mobility = tank.mobility,
      .turret = tank.turret,
      .weapon = tank.weapon,
      .armor = tank.armor,
      .body = tank.body,
      .weapon_cooldown_ticks = 0,
      .mobility_intent_active = false,
      .mobility_intent_target = tank.transform.position,
      .mobility_intent_started_tick = 0,
      .mobility_intent_updated_tick = 0,
      .turret_intent_active = false,
      .turret_intent_target = tank.transform.position,
      .turret_intent_started_tick = 0,
      .turret_intent_updated_tick = 0,
      .hull_intent_active = false,
      .hull_intent_target = tank.transform.position,
      .hull_intent_started_tick = 0,
      .hull_intent_updated_tick = 0,
      .weapon_intent_active = false,
      .weapon_intent_min_hit_chance = 0.0,
      .weapon_intent_started_tick = 0,
      .weapon_intent_updated_tick = 0,
    });
  }
}

WorldSnapshot Battlefield::snapshot() const {
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
  return out;
}

void Battlefield::clear_intents(UnitState& unit) {
  unit.mobility_intent_active = false;
  unit.turret_intent_active = false;
  unit.hull_intent_active = false;
  unit.weapon_intent_active = false;
}

StepResult Battlefield::step(const std::vector<UnitOrders>& orders_by_unit) {
  tick_ += 1;
  std::vector<Event> events;

  for (auto& unit : units_) {
    if (unit.armor.integrity <= 0.0) {
      Battlefield::clear_intents(unit);
      continue;
    }

    std::optional<MoveToOrder> move_to;
    std::optional<AimAtOrder> aim_at;
    std::optional<FireIfSolutionOrder> fire_if_solution;
    std::optional<FaceArmorTowardOrder> face_armor_toward;
    bool duplicate_mobility = false;
    bool duplicate_turret = false;
    bool duplicate_weapon = false;
    bool duplicate_hull = false;

    for (const auto& unit_orders : orders_by_unit) {
      if (!(unit_orders.unit_id == unit.unit_id)) {
        continue;
      }

      for (const auto& order : unit_orders.orders) {
        if (!order_payload_matches_kind(order)) {
          events.push_back(Event{
            .tick = tick_,
            .unit_id = unit.unit_id,
            .code = "invalid_order_payload_kind",
            .message = "Order payload variant does not match the declared order kind.",
          });
          continue;
        }

        switch (order_channel(order.kind)) {
          case OrderChannel::Mobility:
            if (move_to.has_value()) {
              duplicate_mobility = true;
              continue;
            }
            if (const auto* payload = std::get_if<MoveToOrder>(&order.payload)) {
              move_to = *payload;
            }
            break;
          case OrderChannel::Turret:
            if (aim_at.has_value()) {
              duplicate_turret = true;
              continue;
            }
            if (const auto* payload = std::get_if<AimAtOrder>(&order.payload)) {
              aim_at = *payload;
            }
            break;
          case OrderChannel::Hull:
            if (face_armor_toward.has_value()) {
              duplicate_hull = true;
              continue;
            }
            if (const auto* payload = std::get_if<FaceArmorTowardOrder>(&order.payload)) {
              face_armor_toward = *payload;
            }
            break;
          case OrderChannel::Weapon:
            if (fire_if_solution.has_value()) {
              duplicate_weapon = true;
              continue;
            }
            if (const auto* payload = std::get_if<FireIfSolutionOrder>(&order.payload)) {
              fire_if_solution = *payload;
            }
            break;
          case OrderChannel::Sensor:
            break;
        }
      }
    }

    if (duplicate_mobility) {
      events.push_back(Event{
        .tick = tick_,
        .unit_id = unit.unit_id,
        .code = "duplicate_mobility_order",
        .message = "Mobility channel rejected because multiple orders were returned.",
      });
      move_to.reset();
    }
    if (duplicate_turret) {
      events.push_back(Event{
        .tick = tick_,
        .unit_id = unit.unit_id,
        .code = "duplicate_turret_order",
        .message = "Turret channel rejected because multiple orders were returned.",
      });
      aim_at.reset();
    }
    if (duplicate_hull) {
      events.push_back(Event{
        .tick = tick_,
        .unit_id = unit.unit_id,
        .code = "duplicate_hull_order",
        .message = "Hull channel rejected because multiple orders were returned.",
      });
      face_armor_toward.reset();
    }
    if (duplicate_weapon) {
      events.push_back(Event{
        .tick = tick_,
        .unit_id = unit.unit_id,
        .code = "duplicate_weapon_order",
        .message = "Weapon channel rejected because multiple orders were returned.",
      });
      fire_if_solution.reset();
    }

    if (move_to.has_value()) {
      if (!unit.mobility_intent_active ||
          distance_between(unit.mobility_intent_target, move_to->position) > kMoveTargetEpsilon) {
        unit.mobility_intent_started_tick = tick_;
      }
      unit.mobility_intent_active = true;
      unit.mobility_intent_target = move_to->position;
      unit.mobility_intent_updated_tick = tick_;
    }
    if (aim_at.has_value()) {
      if (!unit.turret_intent_active ||
          distance_between(unit.turret_intent_target, aim_at->target) > kMoveTargetEpsilon) {
        unit.turret_intent_started_tick = tick_;
      }
      unit.turret_intent_active = true;
      unit.turret_intent_target = aim_at->target;
      unit.turret_intent_updated_tick = tick_;
    }
    if (face_armor_toward.has_value()) {
      if (!unit.hull_intent_active ||
          distance_between(unit.hull_intent_target, face_armor_toward->target) > kMoveTargetEpsilon) {
        unit.hull_intent_started_tick = tick_;
      }
      unit.hull_intent_active = true;
      unit.hull_intent_target = face_armor_toward->target;
      unit.hull_intent_updated_tick = tick_;
    }
    if (fire_if_solution.has_value()) {
      unit.weapon_intent_active = true;
      unit.weapon_intent_min_hit_chance = fire_if_solution->min_hit_chance;
      unit.weapon_intent_started_tick = tick_;
      unit.weapon_intent_updated_tick = tick_;
    }

    const double move_remaining = unit.mobility_intent_active
      ? distance_between(unit.transform.position, unit.mobility_intent_target)
      : 0.0;
    if (unit.mobility_intent_active && move_remaining <= kMoveTargetEpsilon) {
      unit.mobility_intent_active = false;
    }

    // Move before turning: the old heading drives movement, then the new
    // position produces a stable target angle so the heading does not
    // oscillate across ticks.
    if (unit.mobility_intent_active && move_remaining > kMoveTargetEpsilon) {
      const double max_distance = unit.mobility.max_speed_mps * tick_dt_sec_;
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
      const double max_delta = unit.mobility.max_hull_turn_degps * tick_dt_sec_;
      unit.transform.hull_heading_deg = advance_angle_toward(
        unit.transform.hull_heading_deg,
        *hull_target_heading,
        max_delta
      );
    }

    if (unit.turret_intent_active) {
      const double target_heading = angle_to(unit.transform.position, unit.turret_intent_target);
      const double max_delta = unit.turret.max_turn_degps * tick_dt_sec_;
      unit.turret.heading_deg = advance_angle_toward(unit.turret.heading_deg, target_heading, max_delta);
    }

  }

  for (std::size_t i = 0; i < units_.size(); i += 1) {
    auto& unit = units_[i];
    if (unit.armor.integrity <= 0.0) {
      Battlefield::clear_intents(unit);
      continue;
    }
    if (unit.weapon_cooldown_ticks > 0) {
      unit.weapon_cooldown_ticks -= 1;
    }

    std::optional<FireIfSolutionOrder> fire_if_solution;
    std::size_t fire_order_count = 0;
    for (const auto& unit_orders : orders_by_unit) {
      if (!(unit_orders.unit_id == unit.unit_id)) {
        continue;
      }
      for (const auto& order : unit_orders.orders) {
        if (order.kind != OrderKind::FireIfSolution || !order_payload_matches_kind(order)) {
          continue;
        }
        if (const auto* payload = std::get_if<FireIfSolutionOrder>(&order.payload)) {
          fire_order_count += 1;
          fire_if_solution = *payload;
        }
      }
    }

    if (fire_order_count > 1) {
      continue;
    }
    if (!unit.weapon_intent_active) {
      continue;
    }
    if (unit.weapon_cooldown_ticks > 0) {
      if (fire_order_count == 1) {
        events.push_back(Event{
          .tick = tick_,
          .unit_id = unit.unit_id,
          .code = "weapon_reloading",
          .message = "Weapon order rejected because the gun is still reloading.",
        });
      }
      continue;
    }

    const double min_hit_chance = unit.weapon_intent_min_hit_chance;
    if (fire_order_count == 1 && fire_if_solution.has_value()) {
      unit.weapon_intent_min_hit_chance = fire_if_solution->min_hit_chance;
    }

    std::optional<std::size_t> target_index;
    double best_aim_error = unit.weapon.aim_tolerance_deg;
    for (std::size_t j = 0; j < units_.size(); j += 1) {
      if (j == i) {
        continue;
      }
      const auto& target = units_[j];
      if (target.armor.integrity <= 0.0) {
        continue;
      }
      const double distance = distance_between(unit.transform.position, target.transform.position);
      if (distance > unit.weapon.range_m) {
        continue;
      }
      const double target_heading = angle_to(unit.transform.position, target.transform.position);
      const double aim_error = std::abs(shortest_angle_delta_deg(unit.turret.heading_deg, target_heading));
      if (aim_error <= best_aim_error) {
        best_aim_error = aim_error;
        target_index = j;
      }
    }
    if (!target_index.has_value()) {
      if (fire_order_count == 1) {
        events.push_back(Event{
          .tick = tick_,
          .unit_id = unit.unit_id,
          .code = "fire_no_solution",
          .message = "FireIfSolution rejected because no target is inside the weapon solution.",
        });
      }
      continue;
    }

    auto& target = units_[*target_index];
    const double target_heading = angle_to(unit.transform.position, target.transform.position);
    const double aim_error = std::abs(shortest_angle_delta_deg(unit.turret.heading_deg, target_heading));
    const double hit_chance = hit_chance_for_error(aim_error, unit.weapon.aim_tolerance_deg);
    if (hit_chance < min_hit_chance) {
      if (fire_order_count == 1) {
        events.push_back(Event{
          .tick = tick_,
          .unit_id = unit.unit_id,
          .code = "fire_solution_rejected",
          .message = "FireIfSolution rejected because hit chance is below the requested threshold.",
        });
      }
      continue;
    }

    target.armor.integrity = std::max(0.0, target.armor.integrity - unit.weapon.damage);
    if (target.armor.integrity <= 0.0) {
      Battlefield::clear_intents(target);
    }
    unit.weapon_cooldown_ticks = unit.weapon.reload_ticks;
    unit.weapon_intent_active = false;
    unit.weapon_intent_min_hit_chance = 0.0;
    unit.weapon_intent_updated_tick = tick_;
    events.push_back(Event{
      .tick = tick_,
      .unit_id = unit.unit_id,
      .code = "weapon_fired",
      .message = "Weapon fired with a valid direct-fire solution.",
    });
    events.push_back(Event{
      .tick = tick_,
      .unit_id = target.unit_id,
      .code = "armor_damage",
      .message = "Armor integrity reduced by weapon damage.",
    });
  }

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
      if (post_physics_remaining > pre_physics_move_remaining[i] + kMoveTargetEpsilon) {
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
