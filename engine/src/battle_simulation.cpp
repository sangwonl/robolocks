#include <robolocks/battle_simulation.hpp>

#include <robolocks/actuator_system.hpp>
#include <robolocks/intent_state.hpp>
#include <robolocks/math.hpp>
#include <robolocks/order_resolution.hpp>
#include <robolocks/projectile_system.hpp>

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <utility>
#include <variant>
#include <vector>

namespace robolocks {

namespace {

constexpr double kPhysicsBlockedEpsilonM = 1.0e-3;

// The web renderer draws each tracked hull with drive tracks that sit outside
// the bare hull box (see web/src/ui/battleSceneThreeScene.ts: createMobilityModule).
// The physics footprint must cover those tracks, otherwise two units separated
// to touching hulls still render with their tracks overlapping. These constants
// mirror the renderer's track geometry and must stay in sync with it.
constexpr double kRenderMinTrackWidthM = 0.28;
constexpr double kRenderTrackWidthRatio = 0.18;
// Outer track edge, measured from hull centerline, is width/2 + trackWidth*0.82
// (trackOffsetZ = width/2 + trackWidth*0.32, plus half the track's own width).
// Full collision width therefore adds 2 * 0.82 = 1.64 track widths.
constexpr double kRenderTrackWidthOuterFactor = 1.64;
// Tracks are drawn 2% longer than the hull, so extend the collision length to match.
constexpr double kRenderTrackLengthFactor = 1.02;

// Returns the body shape inflated to the full drawn vehicle footprint (hull +
// tracks) so collision separation matches what the renderer shows. Circles are
// returned unchanged.
BodyShapeSpec collision_footprint(const BodyShapeSpec& shape) {
  if (shape.type != BodyShapeType::Box || shape.length_m <= 0.0 || shape.width_m <= 0.0) {
    return shape;
  }
  const double track_width = std::max(kRenderMinTrackWidthM, shape.width_m * kRenderTrackWidthRatio);
  BodyShapeSpec inflated = shape;
  inflated.width_m = shape.width_m + kRenderTrackWidthOuterFactor * track_width;
  inflated.length_m = shape.length_m * kRenderTrackLengthFactor;
  return inflated;
}

}  // namespace

BattleSimulation::BattleSimulation(BattleConfig config)
    : tick_dt_sec_(config.tick_dt_sec),
      tick_limit_(config.tick_limit),
      bounds_(config.bounds),
      physics_(config.bounds, config.obstacles),
      rule_(config.rule),
      obstacles_(config.obstacles) {
  units_.reserve(config.units.size());
  for (const auto& unit_spec : config.units) {
    const auto team_id = unit_spec.team_id == 0 ? unit_spec.unit_id.value : unit_spec.team_id;
    units_.push_back(UnitState{
      .unit_id = unit_spec.unit_id,
      .team_id = team_id,
      .name = unit_spec.name,
      .spawn_transform = unit_spec.transform,
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
      .max_armor_integrity = unit_spec.armor.integrity,
      .weapon_cooldown_ticks = 0,
      .mobility_intent = IntentChannelState{.target = unit_spec.transform.position},
      .turret_intent = IntentChannelState{.target = unit_spec.transform.position},
      .hull_intent = IntentChannelState{.target = unit_spec.transform.position},
      .weapon_intent = WeaponIntentState{},
    });
    rule_state_.scores.push_back(BattleScore{
      .unit_id = unit_spec.unit_id,
      .team_id = team_id,
    });
  }
  rule_state_.capture_zones.reserve(rule_.capture_zones.size());
  for (const auto& zone : rule_.capture_zones) {
    rule_state_.capture_zones.push_back(CaptureZoneState{
      .id = zone.id,
      .position = zone.position,
      .radius_m = zone.radius_m,
      .hold_ticks_required = zone.hold_ticks,
      .held_ticks = 0,
      .owner_unit_id = UnitId{},
      .owner_team_id = 0,
      .contested = false,
    });
  }
}

WorldSnapshot BattleSimulation::snapshot() const {
  WorldSnapshot out;
  out.tick = tick_;
  out.bounds = bounds_;
  out.units.reserve(units_.size());
  for (const auto& unit : units_) {
    const double mobility_remaining = unit.mobility_intent.active
      ? distance(unit.transform.position, unit.mobility_intent.target)
      : 0.0;
    const double turret_error = unit.turret_intent.active
      ? std::abs(shortest_angle_delta_deg(
          unit.turret.heading_deg,
          angle_to(unit.transform.position, unit.turret_intent.target)
        ))
      : 0.0;
    const double hull_error = unit.hull_intent.active
      ? std::abs(shortest_angle_delta_deg(
          unit.transform.hull_heading_deg,
          angle_to(unit.transform.position, unit.hull_intent.target)
        ))
      : 0.0;
    out.units.push_back(UnitSnapshot{
      .unit_id = unit.unit_id,
      .team_id = unit.team_id,
      .name = unit.name,
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
      .invulnerable_until_tick = unit.invulnerable_until_tick,
      .mobility_intent = MobilityIntentSnapshot{
        .active = unit.mobility_intent.active,
        .target = unit.mobility_intent.target,
        .remaining_m = mobility_remaining,
        .age_ticks = intent_age(tick_, unit.mobility_intent.updated_tick),
      },
      .turret_intent = AimIntentSnapshot{
        .active = unit.turret_intent.active,
        .target = unit.turret_intent.target,
        .error_deg = turret_error,
        .age_ticks = intent_age(tick_, unit.turret_intent.updated_tick),
      },
      .hull_intent = AimIntentSnapshot{
        .active = unit.hull_intent.active,
        .target = unit.hull_intent.target,
        .error_deg = hull_error,
        .age_ticks = intent_age(tick_, unit.hull_intent.updated_tick),
      },
      .weapon_intent = WeaponIntentSnapshot{
        .active = unit.weapon_intent.active,
        .min_hit_chance = unit.weapon_intent.min_hit_chance,
        .age_ticks = intent_age(tick_, unit.weapon_intent.updated_tick),
      },
    });
  }
  out.projectiles.reserve(projectiles_.projectiles().size());
  for (const auto& projectile : projectiles_.projectiles()) {
    out.projectiles.push_back(ProjectileSnapshot{
      .projectile_id = projectile.projectile_id,
      .owner_unit_id = projectile.owner_unit_id,
      .previous_position = projectile.previous_position,
      .position = projectile.position,
      .radius_m = projectile.radius_m,
      .previous_height_m = projectile.previous_height_m,
      .height_m = projectile.height_m,
    });
  }
  return out;
}

StepResult BattleSimulation::step(const std::vector<UnitOrders>& orders_by_unit) {
  tick_ += 1;
  std::vector<Event> events;
  process_respawns(events);
  apply_unit_orders(orders_by_unit, events);
  run_projectile_phase(orders_by_unit, events);
  apply_rule_events(events);
  run_physics_phase(events);
  update_capture_zones();
  evaluate_outcome();
  return StepResult{snapshot(), events, filter_visible_orders(orders_by_unit), rule_state_};
}

void BattleSimulation::apply_unit_orders(
  const std::vector<UnitOrders>& orders_by_unit,
  std::vector<Event>& events
) {
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
}

void BattleSimulation::run_projectile_phase(
  const std::vector<UnitOrders>& orders_by_unit,
  std::vector<Event>& events
) {
  // Count each unit's FireIfSolution orders this tick, aligned with units_.
  // The order resolution step collapses duplicate weapon orders away, so the
  // projectile system needs this count to reject a unit that submitted more
  // than one fire order.
  std::vector<std::size_t> fire_order_counts;
  fire_order_counts.reserve(units_.size());
  for (const auto& unit : units_) {
    std::size_t fire_order_count = 0;
    for (const auto& unit_orders : orders_by_unit) {
      if (!(unit_orders.unit_id == unit.unit_id)) {
        continue;
      }
      for (const auto& order : unit_orders.orders) {
        if (order.kind != OrderKind::FireIfSolution || !order_payload_matches_kind(order)) {
          continue;
        }
        if (std::get_if<FireIfSolutionOrder>(&order.payload)) {
          fire_order_count += 1;
        }
      }
    }
    fire_order_counts.push_back(fire_order_count);
  }

  auto weapon_events = projectiles_.resolve_weapon_fire(tick_, units_, fire_order_counts);
  events.insert(events.end(), weapon_events.begin(), weapon_events.end());

  auto projectile_events = projectiles_.advance_projectiles(tick_, tick_dt_sec_, units_);
  events.insert(events.end(), projectile_events.begin(), projectile_events.end());
}

void BattleSimulation::run_physics_phase(std::vector<Event>& events) {
  std::vector<PhysicsBody> physics_bodies;
  physics_bodies.reserve(units_.size());
  std::vector<double> pre_physics_move_remaining;
  pre_physics_move_remaining.reserve(units_.size());
  for (const auto& unit : units_) {
    pre_physics_move_remaining.push_back(unit.mobility_intent.active
      ? distance(unit.transform.position, unit.mobility_intent.target)
      : 0.0);
    physics_bodies.push_back(PhysicsBody{
      .unit_id = unit.unit_id,
      .position = unit.transform.position,
      .shape = collision_footprint(unit.body.shape),
      .heading_deg = unit.transform.hull_heading_deg,
      .mass_kg = unit.body.mass_kg,
    });
  }
  auto physics_events = physics_.resolve(tick_, physics_bodies);
  events.insert(events.end(), physics_events.begin(), physics_events.end());
  for (std::size_t i = 0; i < units_.size(); i += 1) {
    units_[i].transform.position = physics_bodies[i].position;
    if (units_[i].mobility_intent.active) {
      const double post_physics_remaining = distance(
        units_[i].transform.position,
        units_[i].mobility_intent.target
      );
      if (post_physics_remaining > pre_physics_move_remaining[i] + kPhysicsBlockedEpsilonM) {
        units_[i].mobility_intent.active = false;
      }
    }
  }
}

std::vector<UnitOrders> BattleSimulation::filter_visible_orders(
  const std::vector<UnitOrders>& orders_by_unit
) const {
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
  return visible_orders_by_unit;
}

void BattleSimulation::apply_rule_events(const std::vector<Event>& events) {
  for (const auto& event : events) {
    if (event.code == "armor_damage" && event.payload.source_unit_id.value != 0) {
      for (auto& score : rule_state_.scores) {
        if (score.unit_id == event.payload.source_unit_id) {
          score.damage_dealt += event.payload.damage;
          break;
        }
      }
    }
    if (event.code != "unit_destroyed") {
      continue;
    }

    for (auto& score : rule_state_.scores) {
      if (score.unit_id == event.payload.source_unit_id && !(event.payload.source_unit_id == event.payload.target_unit_id)) {
        score.kills += 1;
      }
      if (score.unit_id == event.payload.target_unit_id) {
        score.deaths += 1;
      }
    }

    if (rule_.respawn.enabled) {
      const auto already_scheduled = std::find_if(
        rule_state_.respawns.begin(),
        rule_state_.respawns.end(),
        [&event](const RespawnState& respawn) {
          return respawn.unit_id == event.payload.target_unit_id;
        }
      );
      if (already_scheduled == rule_state_.respawns.end()) {
        rule_state_.respawns.push_back(RespawnState{
          .unit_id = event.payload.target_unit_id,
          .ready_tick = tick_ + rule_.respawn.cooldown_ticks,
        });
      }
    }
  }
}

void BattleSimulation::process_respawns(std::vector<Event>& events) {
  if (!rule_.respawn.enabled || rule_state_.respawns.empty()) {
    return;
  }

  std::vector<RespawnState> pending;
  pending.reserve(rule_state_.respawns.size());
  for (const auto& respawn : rule_state_.respawns) {
    if (respawn.ready_tick > tick_) {
      pending.push_back(respawn);
      continue;
    }

    auto unit_it = std::find_if(units_.begin(), units_.end(), [&respawn](const UnitState& unit) {
      return unit.unit_id == respawn.unit_id;
    });
    if (unit_it == units_.end()) {
      continue;
    }

    UnitState& unit = *unit_it;
    TransformSpec spawn = unit.spawn_transform;
    for (const auto& spawn_point : rule_.respawn.spawn_points) {
      if (spawn_point.team_id != 0 && spawn_point.team_id != unit.team_id) {
        continue;
      }
      spawn.position = spawn_point.position;
      spawn.hull_heading_deg = spawn_point.heading_deg;
      break;
    }

    const double unit_radius = collision_radius(unit.body.shape);
    bool blocked = false;
    for (const auto& other : units_) {
      if (other.unit_id == unit.unit_id || other.armor.integrity <= 0.0) {
        continue;
      }
      const double other_radius = collision_radius(other.body.shape);
      if (distance(spawn.position, other.transform.position) < unit_radius + other_radius) {
        blocked = true;
        break;
      }
    }
    for (const auto& obstacle : obstacles_) {
      if (distance(spawn.position, obstacle.position) < unit_radius + obstacle.radius_m) {
        blocked = true;
        break;
      }
    }
    if (blocked) {
      pending.push_back(respawn);
      events.push_back(Event{
        .tick = tick_,
        .unit_id = unit.unit_id,
        .code = "respawn_blocked",
        .message = "Respawn delayed because the spawn position is occupied.",
        .payload = EventPayload{},
      });
      continue;
    }

    unit.transform = spawn;
    unit.turret.heading_deg = spawn.hull_heading_deg;
    unit.armor.integrity = unit.max_armor_integrity;
    unit.weapon_cooldown_ticks = 0;
    unit.invulnerable_until_tick = tick_ + rule_.respawn.invulnerable_ticks;
    clear_intents(unit);
    events.push_back(Event{
      .tick = tick_,
      .unit_id = unit.unit_id,
      .code = "unit_respawned",
      .message = "Unit respawned after cooldown.",
      .payload = EventPayload{},
    });
  }
  rule_state_.respawns = std::move(pending);
}

void BattleSimulation::update_capture_zones() {
  if (rule_.mode != BattleRuleMode::CapturePoint || rule_state_.outcome.finished) {
    return;
  }

  for (auto& zone : rule_state_.capture_zones) {
    UnitId occupying_unit;
    std::uint32_t occupying_team_id = 0;
    bool has_occupier = false;
    bool contested = false;

    for (const auto& unit : units_) {
      if (unit.armor.integrity <= 0.0) {
        continue;
      }
      if (distance(unit.transform.position, zone.position) > zone.radius_m) {
        continue;
      }

      const auto capture_team_id = unit.team_id == 0 ? unit.unit_id.value : unit.team_id;
      const bool same_owner = rule_.team_mode == BattleTeamMode::Team
        ? occupying_team_id == capture_team_id
        : occupying_unit == unit.unit_id;
      if (!has_occupier) {
        has_occupier = true;
        occupying_unit = unit.unit_id;
        occupying_team_id = capture_team_id;
        continue;
      }
      if (!same_owner) {
        contested = true;
        break;
      }
    }

    zone.contested = contested;
    if (!has_occupier || contested) {
      zone.held_ticks = 0;
      zone.owner_unit_id = UnitId{};
      zone.owner_team_id = 0;
      continue;
    }

    const bool same_holder = rule_.team_mode == BattleTeamMode::Team
      ? zone.owner_team_id == occupying_team_id
      : zone.owner_unit_id == occupying_unit;
    zone.owner_unit_id = occupying_unit;
    zone.owner_team_id = occupying_team_id;
    zone.held_ticks = same_holder ? zone.held_ticks + 1 : 1;
  }
}

void BattleSimulation::evaluate_outcome() {
  if (rule_state_.outcome.finished || rule_.mode == BattleRuleMode::None) {
    return;
  }

  auto score_kills = [&](const BattleScore& score) {
    if (rule_.team_mode == BattleTeamMode::Solo) {
      return score.kills;
    }
    std::uint32_t kills = 0;
    for (const auto& candidate : rule_state_.scores) {
      if (candidate.team_id == score.team_id) {
        kills += candidate.kills;
      }
    }
    return kills;
  };

  const BattleScore* leader = nullptr;
  for (const auto& score : rule_state_.scores) {
    if (leader == nullptr || score_kills(score) > score_kills(*leader)) {
      leader = &score;
    }
  }

  if (leader == nullptr) {
    return;
  }

  if (
    rule_.mode == BattleRuleMode::CapturePoint
  ) {
    for (const auto& zone : rule_state_.capture_zones) {
      if (zone.hold_ticks_required == 0 || zone.held_ticks < zone.hold_ticks_required) {
        continue;
      }
      rule_state_.outcome.finished = true;
      rule_state_.outcome.reason = "capture_point";
      if (rule_.team_mode == BattleTeamMode::Team) {
        rule_state_.outcome.winner_team_id = zone.owner_team_id;
      } else {
        rule_state_.outcome.winner_unit_id = zone.owner_unit_id;
      }
      return;
    }
  }

  if (
    rule_.mode == BattleRuleMode::KillLimitDeathmatch
    && rule_.kill_limit > 0
    && score_kills(*leader) >= rule_.kill_limit
  ) {
    rule_state_.outcome.finished = true;
    rule_state_.outcome.reason = "kill_limit";
    if (rule_.team_mode == BattleTeamMode::Team) {
      rule_state_.outcome.winner_team_id = leader->team_id;
    } else {
      rule_state_.outcome.winner_unit_id = leader->unit_id;
    }
    return;
  }

  if (
    rule_.mode == BattleRuleMode::TimedDeathmatch
    && rule_.time_limit_ticks > 0
    && tick_ >= rule_.time_limit_ticks
  ) {
    rule_state_.outcome.finished = true;
    rule_state_.outcome.reason = "time_limit";
    if (rule_.team_mode == BattleTeamMode::Team) {
      rule_state_.outcome.winner_team_id = leader->team_id;
    } else {
      rule_state_.outcome.winner_unit_id = leader->unit_id;
    }
    return;
  }

  // Universal deadline backstop: if the battle reaches the configured tick limit
  // without its own rule resolving, settle it on the current score instead of
  // leaving it undecided. The side with the most kills wins; an exact tie
  // (including a scoreless battle) is a draw — finished with no winner set.
  if (tick_limit_ > 0 && tick_ >= tick_limit_) {
    rule_state_.outcome.finished = true;
    rule_state_.outcome.reason = "tick_limit";
    if (rule_.team_mode == BattleTeamMode::Team) {
      std::vector<std::pair<std::uint32_t, std::uint32_t>> team_kills;  // (team_id, kills)
      for (const auto& score : rule_state_.scores) {
        auto entry = std::find_if(team_kills.begin(), team_kills.end(),
          [&](const auto& candidate) { return candidate.first == score.team_id; });
        if (entry == team_kills.end()) {
          team_kills.emplace_back(score.team_id, score.kills);
        } else {
          entry->second += score.kills;
        }
      }
      std::uint32_t best = 0;
      for (const auto& entry : team_kills) {
        best = std::max(best, entry.second);
      }
      std::uint32_t leaders = 0;
      std::uint32_t winning_team = 0;
      for (const auto& entry : team_kills) {
        if (entry.second == best) {
          leaders += 1;
          winning_team = entry.first;
        }
      }
      if (best > 0 && leaders == 1) {
        rule_state_.outcome.winner_team_id = winning_team;
      }
    } else {
      std::uint32_t best = 0;
      for (const auto& score : rule_state_.scores) {
        best = std::max(best, score.kills);
      }
      std::uint32_t leaders = 0;
      UnitId winning_unit{};
      for (const auto& score : rule_state_.scores) {
        if (score.kills == best) {
          leaders += 1;
          winning_unit = score.unit_id;
        }
      }
      if (best > 0 && leaders == 1) {
        rule_state_.outcome.winner_unit_id = winning_unit;
      }
    }
  }
}

}  // namespace robolocks
