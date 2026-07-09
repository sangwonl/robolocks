#include <robolocks/projectile_system.hpp>

#include <robolocks/combat_resolution.hpp>
#include <robolocks/intent_state.hpp>
#include <robolocks/math.hpp>

#include <algorithm>
#include <cmath>
#include <optional>
#include <string>

namespace robolocks {

namespace {

constexpr double kMinHitChance = 0.0;
constexpr double kMaxHitChance = 1.0;

enum class ArmorFacing {
  Front,
  Side,
  Rear,
};

struct MuzzleTransform {
  Vec2 position;
  double height_m = 0.0;
};

MuzzleTransform muzzle_transform_for_unit(const UnitState& unit) {
  const Vec2 direction = forward_vector(unit.turret.heading_deg);
  const Vec2 right = right_vector(unit.turret.heading_deg);
  return MuzzleTransform{
    .position = Vec2{
      unit.transform.position.x
        + direction.x * unit.weapon.muzzle_offset_m.x
        + right.x * unit.weapon.muzzle_offset_m.y,
      unit.transform.position.y
        + direction.y * unit.weapon.muzzle_offset_m.x
        + right.y * unit.weapon.muzzle_offset_m.y,
    },
    .height_m = unit.weapon.muzzle_offset_m.z,
  };
}

ArmorFacing armor_facing_from_projectile(Vec2 target_position, double target_hull_heading_deg, Vec2 projectile_previous_position) {
  const double projectile_bearing = angle_to(target_position, projectile_previous_position);
  const double delta = std::abs(shortest_angle_delta_deg(target_hull_heading_deg, projectile_bearing));
  if (delta <= 45.0) {
    return ArmorFacing::Front;
  }
  if (delta >= 135.0) {
    return ArmorFacing::Rear;
  }
  return ArmorFacing::Side;
}

double armor_thickness_mm(const ArmorSpec& armor, ArmorFacing facing) {
  switch (facing) {
    case ArmorFacing::Front:
      return armor.front_mm;
    case ArmorFacing::Side:
      return armor.side_mm;
    case ArmorFacing::Rear:
      return armor.rear_mm;
  }
  return armor.side_mm;
}

const char* armor_facing_name(ArmorFacing facing) {
  switch (facing) {
    case ArmorFacing::Front:
      return "front";
    case ArmorFacing::Side:
      return "side";
    case ArmorFacing::Rear:
      return "rear";
  }
  return "unknown";
}

double hit_chance_for_error(double error_deg, double aim_tolerance_deg) {
  if (aim_tolerance_deg <= 0.0) {
    return error_deg <= 0.0 ? kMaxHitChance : kMinHitChance;
  }
  return clamp(kMaxHitChance - (error_deg / aim_tolerance_deg), kMinHitChance, kMaxHitChance);
}

std::uint32_t team_for_unit(const std::vector<UnitState>& units, UnitId unit_id) {
  for (const auto& unit : units) {
    if (unit.unit_id == unit_id) {
      return unit.team_id;
    }
  }
  return 0;
}

Event destroyed_event(
  Tick tick,
  UnitId source_unit_id,
  std::uint32_t source_team_id,
  const UnitState& target
) {
  return Event{
    .tick = tick,
    .unit_id = target.unit_id,
    .code = "unit_destroyed",
    .message = "Unit armor integrity reached zero.",
    .payload = EventPayload{
      .source_unit_id = source_unit_id,
      .target_unit_id = target.unit_id,
      .source_team_id = source_team_id,
      .target_team_id = target.team_id,
      .damage_type = "",
      .armor_facing = "",
      .damage = 0.0,
      .remaining_armor = target.armor.integrity,
      .penetration_mm = 0.0,
      .armor_mm = 0.0,
      .impact_distance_m = 0.0,
      .blast_radius_m = 0.0,
    },
  };
}

}  // namespace

std::vector<Event> resolve_weapon_fire(
  Tick tick,
  double,
  const std::vector<UnitOrders>& orders_by_unit,
  std::vector<UnitState>& units,
  std::vector<ProjectileState>& projectiles,
  std::uint64_t& next_projectile_id
) {
  std::vector<Event> events;
  for (std::size_t i = 0; i < units.size(); i += 1) {
    auto& unit = units[i];
    if (unit.armor.integrity <= 0.0) {
      clear_intents(unit);
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

    if (fire_order_count > 1 || !unit.weapon_intent.active) {
      continue;
    }
    if (unit.weapon_cooldown_ticks > 0) {
      if (fire_order_count == 1) {
        events.push_back(Event{
          .tick = tick,
          .unit_id = unit.unit_id,
          .code = "weapon_reloading",
          .message = "Weapon order rejected because the gun is still reloading.",
          .payload = EventPayload{},
        });
      }
      continue;
    }

    const double min_hit_chance = unit.weapon_intent.min_hit_chance;
    if (fire_order_count == 1 && fire_if_solution.has_value()) {
      unit.weapon_intent.min_hit_chance = fire_if_solution->min_hit_chance;
    }

    std::optional<std::size_t> target_index;
    double best_aim_error = unit.weapon.aim_tolerance_deg;
    for (std::size_t j = 0; j < units.size(); j += 1) {
      if (j == i) {
        continue;
      }
      const auto& target = units[j];
      if (target.armor.integrity <= 0.0) {
        continue;
      }
      if (target.invulnerable_until_tick > tick) {
        continue;
      }
      const MuzzleTransform muzzle = muzzle_transform_for_unit(unit);
      const double target_distance = distance(muzzle.position, target.transform.position);
      if (target_distance > unit.weapon.range_m) {
        continue;
      }
      const double target_heading = angle_to(muzzle.position, target.transform.position);
      const double aim_error = std::abs(shortest_angle_delta_deg(unit.turret.heading_deg, target_heading));
      const double range_hit_chance = ballistic_range_hit_chance(
        unit.weapon,
        target_distance,
        collision_radius(target.body.shape)
      );
      if (range_hit_chance <= 0.0) {
        continue;
      }
      if (aim_error <= best_aim_error) {
        best_aim_error = aim_error;
        target_index = j;
      }
    }
    if (!target_index.has_value()) {
      if (fire_order_count == 1) {
        events.push_back(Event{
          .tick = tick,
          .unit_id = unit.unit_id,
          .code = "fire_no_solution",
          .message = "FireIfSolution rejected because no target is inside the weapon solution.",
          .payload = EventPayload{},
        });
      }
      continue;
    }

    auto& target = units[*target_index];
    const MuzzleTransform muzzle = muzzle_transform_for_unit(unit);
    const double target_heading = angle_to(muzzle.position, target.transform.position);
    const double aim_error = std::abs(shortest_angle_delta_deg(unit.turret.heading_deg, target_heading));
    const double hit_chance = hit_chance_for_error(aim_error, unit.weapon.aim_tolerance_deg)
      * ballistic_range_hit_chance(
        unit.weapon,
        distance(muzzle.position, target.transform.position),
        collision_radius(target.body.shape)
      );
    if (hit_chance < min_hit_chance) {
      if (fire_order_count == 1) {
        events.push_back(Event{
          .tick = tick,
          .unit_id = unit.unit_id,
          .code = "fire_solution_rejected",
          .message = "FireIfSolution rejected because hit chance is below the requested threshold.",
          .payload = EventPayload{},
        });
      }
      continue;
    }

    unit.weapon_cooldown_ticks = unit.weapon.reload_ticks;
    unit.weapon_intent.active = false;
    unit.weapon_intent.min_hit_chance = 0.0;
    unit.weapon_intent.updated_tick = tick;
    const Vec2 direction = forward_vector(unit.turret.heading_deg);
    const bool ballistic = unit.weapon.fire_mode == WeaponFireMode::Ballistic;
    const double launch_angle_rad = unit.weapon.launch_angle_deg * kPi / 180.0;
    const double horizontal_velocity_mps = ballistic
      ? unit.weapon.muzzle_velocity_mps * std::cos(launch_angle_rad)
      : unit.weapon.muzzle_velocity_mps;
    projectiles.push_back(ProjectileState{
      .projectile_id = next_projectile_id++,
      .owner_unit_id = unit.unit_id,
      .fire_mode = unit.weapon.fire_mode,
      .previous_position = muzzle.position,
      .position = muzzle.position,
      .velocity = Vec2{
        direction.x * horizontal_velocity_mps,
        direction.y * horizontal_velocity_mps,
      },
      .previous_height_m = muzzle.height_m,
      .height_m = muzzle.height_m,
      .vertical_velocity_mps = ballistic ? unit.weapon.muzzle_velocity_mps * std::sin(launch_angle_rad) : 0.0,
      .gravity_mps2 = unit.weapon.gravity_mps2,
      .damage = unit.weapon.damage,
      .penetration_mm = unit.weapon.penetration_mm,
      .blast_radius_m = unit.weapon.blast_radius_m,
      .radius_m = unit.weapon.projectile_radius_m,
      .remaining_range_m = unit.weapon.range_m,
    });
    events.push_back(Event{
      .tick = tick,
      .unit_id = unit.unit_id,
      .code = "weapon_fired",
      .message = "Weapon fired with a valid direct-fire solution.",
      .payload = EventPayload{},
    });
  }
  return events;
}

std::vector<Event> advance_projectiles(
  Tick tick,
  double tick_dt_sec,
  std::vector<UnitState>& units,
  std::vector<ProjectileState>& projectiles
) {
  std::vector<Event> events;
  std::vector<ProjectileState> active_projectiles;
  active_projectiles.reserve(projectiles.size());
  for (auto projectile : projectiles) {
    projectile.previous_position = projectile.position;
    projectile.previous_height_m = projectile.height_m;
    const double max_distance = std::max(0.0, projectile.remaining_range_m);
    const double requested_distance = length(projectile.velocity) * tick_dt_sec;
    const double travel_distance = std::min(requested_distance, max_distance);
    const Vec2 direction = requested_distance > 0.0
      ? Vec2{projectile.velocity.x / requested_distance * tick_dt_sec, projectile.velocity.y / requested_distance * tick_dt_sec}
      : Vec2{0.0, 0.0};
    projectile.position = Vec2{
      projectile.position.x + direction.x * travel_distance,
      projectile.position.y + direction.y * travel_distance,
    };
    projectile.remaining_range_m -= travel_distance;

    if (projectile.fire_mode == WeaponFireMode::Ballistic) {
      projectile.height_m = projectile.height_m
        + projectile.vertical_velocity_mps * tick_dt_sec
        - 0.5 * projectile.gravity_mps2 * tick_dt_sec * tick_dt_sec;
      projectile.vertical_velocity_mps -= projectile.gravity_mps2 * tick_dt_sec;

      if (projectile.height_m <= 0.0 && projectile.previous_height_m > 0.0) {
        const double impact_t = clamp(
          projectile.previous_height_m / (projectile.previous_height_m - projectile.height_m),
          0.0,
          1.0
        );
        const Vec2 impact_position{
          projectile.previous_position.x + (projectile.position.x - projectile.previous_position.x) * impact_t,
          projectile.previous_position.y + (projectile.position.y - projectile.previous_position.y) * impact_t,
        };
        for (auto& target : units) {
          if (target.unit_id == projectile.owner_unit_id || target.armor.integrity <= 0.0) {
            continue;
          }
          const double target_radius = collision_radius(target.body.shape);
          const double blast_radius = std::max(projectile.blast_radius_m, projectile.radius_m);
          const double impact_distance = std::max(
            0.0,
            distance(impact_position, target.transform.position) - target_radius
          );
          if (impact_distance > blast_radius) {
            continue;
          }
          const double damage = splash_damage_at_distance(projectile.damage, impact_distance, blast_radius);
          if (damage <= 0.0) {
            continue;
          }
          const double armor_before = target.armor.integrity;
          target.armor.integrity = std::max(0.0, target.armor.integrity - damage);
          if (target.armor.integrity <= 0.0) {
            clear_intents(target);
          }
          const auto source_team_id = team_for_unit(units, projectile.owner_unit_id);
          events.push_back(Event{
            .tick = tick,
            .unit_id = target.unit_id,
            .code = "armor_damage",
            .message = "Ballistic projectile blast reduced armor integrity.",
            .payload = EventPayload{
              .projectile_id = projectile.projectile_id,
              .source_unit_id = projectile.owner_unit_id,
              .target_unit_id = target.unit_id,
              .source_team_id = source_team_id,
              .target_team_id = target.team_id,
              .damage_type = "splash",
              .armor_facing = "",
              .damage = damage,
              .remaining_armor = target.armor.integrity,
              .penetration_mm = 0.0,
              .armor_mm = 0.0,
              .impact_distance_m = impact_distance,
              .blast_radius_m = blast_radius,
            },
          });
          if (armor_before > 0.0 && target.armor.integrity <= 0.0) {
            events.push_back(destroyed_event(tick, projectile.owner_unit_id, source_team_id, target));
          }
        }
        continue;
      }

      if (projectile.remaining_range_m > 0.0) {
        active_projectiles.push_back(projectile);
      }
      continue;
    }

    std::optional<std::size_t> hit_target_index;
    for (std::size_t i = 0; i < units.size(); i += 1) {
      auto& target = units[i];
      if (target.unit_id == projectile.owner_unit_id || target.armor.integrity <= 0.0) {
        continue;
      }
      if (target.invulnerable_until_tick > tick) {
        continue;
      }
      const double hit_radius = collision_radius(target.body.shape) + projectile.radius_m;
      if (segment_intersects_circle(projectile.previous_position, projectile.position, target.transform.position, hit_radius)) {
        hit_target_index = i;
        break;
      }
    }

    if (hit_target_index.has_value()) {
      auto& target = units[*hit_target_index];
      const auto facing = armor_facing_from_projectile(
        target.transform.position,
        target.transform.hull_heading_deg,
        projectile.previous_position
      );
      const double armor_mm = armor_thickness_mm(target.armor, facing);
      if (projectile.penetration_mm < armor_mm) {
        events.push_back(Event{
          .tick = tick,
          .unit_id = target.unit_id,
          .code = "armor_bounced",
          .message = std::string("Projectile failed to penetrate ") + armor_facing_name(facing) + " armor.",
          .payload = EventPayload{
            .projectile_id = projectile.projectile_id,
            .source_unit_id = projectile.owner_unit_id,
            .target_unit_id = target.unit_id,
            .source_team_id = team_for_unit(units, projectile.owner_unit_id),
            .target_team_id = target.team_id,
            .damage_type = "direct",
            .armor_facing = armor_facing_name(facing),
            .damage = 0.0,
            .remaining_armor = target.armor.integrity,
            .penetration_mm = projectile.penetration_mm,
            .armor_mm = armor_mm,
            .impact_distance_m = 0.0,
            .blast_radius_m = 0.0,
          },
        });
        continue;
      }

      const double damage = direct_damage_after_penetration(projectile.damage, projectile.penetration_mm, armor_mm);
      const double armor_before = target.armor.integrity;
      target.armor.integrity = std::max(0.0, target.armor.integrity - damage);
      if (target.armor.integrity <= 0.0) {
        clear_intents(target);
      }
      const auto source_team_id = team_for_unit(units, projectile.owner_unit_id);
      events.push_back(Event{
        .tick = tick,
        .unit_id = target.unit_id,
        .code = "armor_damage",
        .message = std::string("Projectile penetrated ") + armor_facing_name(facing) + " armor.",
        .payload = EventPayload{
          .projectile_id = projectile.projectile_id,
          .source_unit_id = projectile.owner_unit_id,
          .target_unit_id = target.unit_id,
          .source_team_id = source_team_id,
          .target_team_id = target.team_id,
          .damage_type = "direct",
          .armor_facing = armor_facing_name(facing),
          .damage = damage,
          .remaining_armor = target.armor.integrity,
          .penetration_mm = projectile.penetration_mm,
          .armor_mm = armor_mm,
        },
      });
      if (armor_before > 0.0 && target.armor.integrity <= 0.0) {
        events.push_back(destroyed_event(tick, projectile.owner_unit_id, source_team_id, target));
      }
      continue;
    }

    if (projectile.remaining_range_m > 0.0) {
      active_projectiles.push_back(projectile);
    }
  }
  projectiles = std::move(active_projectiles);
  return events;
}

}  // namespace robolocks
