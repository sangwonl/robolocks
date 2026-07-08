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

constexpr double kPi = 3.14159265358979323846;
constexpr double kMinHitChance = 0.0;
constexpr double kMaxHitChance = 1.0;

enum class ArmorFacing {
  Front,
  Side,
  Rear,
};

double distance_between(Vec2 from, Vec2 to) {
  return length(Vec2{to.x - from.x, to.y - from.y});
}

double dot(Vec2 a, Vec2 b) {
  return a.x * b.x + a.y * b.y;
}

Vec2 forward_vector(double heading_deg) {
  const double radians = normalize_angle_deg(heading_deg) * kPi / 180.0;
  return Vec2{std::cos(radians), std::sin(radians)};
}

double collision_radius_for_shape(const BodyShapeSpec& shape) {
  if (shape.type == BodyShapeType::Box) {
    return std::max(shape.radius_m, std::hypot(shape.length_m * 0.5, shape.width_m * 0.5));
  }
  return shape.radius_m;
}

bool segment_intersects_circle(Vec2 from, Vec2 to, Vec2 center, double radius) {
  const Vec2 segment{to.x - from.x, to.y - from.y};
  const double length_sq = dot(segment, segment);
  if (length_sq <= 0.0) {
    return distance_between(from, center) <= radius;
  }
  const Vec2 from_to_center{center.x - from.x, center.y - from.y};
  const double t = clamp(dot(from_to_center, segment) / length_sq, 0.0, 1.0);
  const Vec2 closest{from.x + segment.x * t, from.y + segment.y * t};
  return distance_between(closest, center) <= radius;
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

    if (fire_order_count > 1 || !unit.weapon_intent_active) {
      continue;
    }
    if (unit.weapon_cooldown_ticks > 0) {
      if (fire_order_count == 1) {
        events.push_back(Event{
          .tick = tick,
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
    for (std::size_t j = 0; j < units.size(); j += 1) {
      if (j == i) {
        continue;
      }
      const auto& target = units[j];
      if (target.armor.integrity <= 0.0) {
        continue;
      }
      const double distance = distance_between(unit.transform.position, target.transform.position);
      if (distance > unit.weapon.range_m) {
        continue;
      }
      const double target_heading = angle_to(unit.transform.position, target.transform.position);
      const double aim_error = std::abs(shortest_angle_delta_deg(unit.turret.heading_deg, target_heading));
      const double range_hit_chance = ballistic_range_hit_chance(
        unit.weapon,
        distance,
        collision_radius_for_shape(target.body.shape)
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
        });
      }
      continue;
    }

    auto& target = units[*target_index];
    const double target_heading = angle_to(unit.transform.position, target.transform.position);
    const double aim_error = std::abs(shortest_angle_delta_deg(unit.turret.heading_deg, target_heading));
    const double hit_chance = hit_chance_for_error(aim_error, unit.weapon.aim_tolerance_deg)
      * ballistic_range_hit_chance(
        unit.weapon,
        distance_between(unit.transform.position, target.transform.position),
        collision_radius_for_shape(target.body.shape)
      );
    if (hit_chance < min_hit_chance) {
      if (fire_order_count == 1) {
        events.push_back(Event{
          .tick = tick,
          .unit_id = unit.unit_id,
          .code = "fire_solution_rejected",
          .message = "FireIfSolution rejected because hit chance is below the requested threshold.",
        });
      }
      continue;
    }

    unit.weapon_cooldown_ticks = unit.weapon.reload_ticks;
    unit.weapon_intent_active = false;
    unit.weapon_intent_min_hit_chance = 0.0;
    unit.weapon_intent_updated_tick = tick;
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
      .previous_position = unit.transform.position,
      .position = unit.transform.position,
      .velocity = Vec2{
        direction.x * horizontal_velocity_mps,
        direction.y * horizontal_velocity_mps,
      },
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
    const double distance = std::min(requested_distance, max_distance);
    const Vec2 direction = requested_distance > 0.0
      ? Vec2{projectile.velocity.x / requested_distance * tick_dt_sec, projectile.velocity.y / requested_distance * tick_dt_sec}
      : Vec2{0.0, 0.0};
    projectile.position = Vec2{
      projectile.position.x + direction.x * distance,
      projectile.position.y + direction.y * distance,
    };
    projectile.remaining_range_m -= distance;

    if (projectile.fire_mode == WeaponFireMode::Ballistic) {
      projectile.height_m = projectile.height_m
        + projectile.vertical_velocity_mps * tick_dt_sec
        - 0.5 * projectile.gravity_mps2 * tick_dt_sec * tick_dt_sec;
      projectile.vertical_velocity_mps -= projectile.gravity_mps2 * tick_dt_sec;

      if (projectile.height_m <= 0.0 && projectile.previous_height_m > 0.0) {
        for (auto& target : units) {
          if (target.unit_id == projectile.owner_unit_id || target.armor.integrity <= 0.0) {
            continue;
          }
          const double target_radius = collision_radius_for_shape(target.body.shape);
          const double blast_radius = std::max(projectile.blast_radius_m, projectile.radius_m);
          const double impact_distance = std::max(
            0.0,
            distance_between(projectile.position, target.transform.position) - target_radius
          );
          if (impact_distance > blast_radius) {
            continue;
          }
          const double damage = splash_damage_at_distance(projectile.damage, impact_distance, blast_radius);
          if (damage <= 0.0) {
            continue;
          }
          target.armor.integrity = std::max(0.0, target.armor.integrity - damage);
          if (target.armor.integrity <= 0.0) {
            clear_intents(target);
          }
          events.push_back(Event{
            .tick = tick,
            .unit_id = target.unit_id,
            .code = "armor_damage",
            .message = "Ballistic projectile blast reduced armor integrity.",
            .payload = EventPayload{
              .projectile_id = projectile.projectile_id,
              .damage_type = "splash",
              .damage = damage,
              .remaining_armor = target.armor.integrity,
              .impact_distance_m = impact_distance,
              .blast_radius_m = blast_radius,
            },
          });
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
      const double hit_radius = collision_radius_for_shape(target.body.shape) + projectile.radius_m;
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
            .damage_type = "direct",
            .armor_facing = armor_facing_name(facing),
            .penetration_mm = projectile.penetration_mm,
            .armor_mm = armor_mm,
          },
        });
        continue;
      }

      const double damage = direct_damage_after_penetration(projectile.damage, projectile.penetration_mm, armor_mm);
      target.armor.integrity = std::max(0.0, target.armor.integrity - damage);
      if (target.armor.integrity <= 0.0) {
        clear_intents(target);
      }
      events.push_back(Event{
        .tick = tick,
        .unit_id = target.unit_id,
        .code = "armor_damage",
        .message = std::string("Projectile penetrated ") + armor_facing_name(facing) + " armor.",
        .payload = EventPayload{
          .projectile_id = projectile.projectile_id,
          .damage_type = "direct",
          .armor_facing = armor_facing_name(facing),
          .damage = damage,
          .remaining_armor = target.armor.integrity,
          .penetration_mm = projectile.penetration_mm,
          .armor_mm = armor_mm,
        },
      });
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
