#include <robolocks/sensor_system.hpp>

#include <robolocks/math.hpp>

#include <algorithm>
#include <cmath>
#include <utility>

namespace robolocks {

namespace {

const UnitSnapshot* find_unit(const WorldSnapshot& snapshot, UnitId unit_id) {
  for (const auto& unit : snapshot.units) {
    if (unit.unit_id == unit_id) {
      return &unit;
    }
  }
  return nullptr;
}

Vec2 rotate_local(Vec2 local, double heading_deg) {
  const double radians = heading_deg * kPi / 180.0;
  const double c = std::cos(radians);
  const double s = std::sin(radians);
  return Vec2{
    local.x * c - local.y * s,
    local.x * s + local.y * c,
  };
}

double body_length_for_sensor_mount(const UnitSnapshot& unit) {
  if (unit.body_shape_type == BodyShapeType::Box && unit.body_length_m > 0.0) {
    return unit.body_length_m;
  }
  return std::max(0.0, unit.body_radius_m * 2.0);
}

Vec2 sensor_origin_for_unit(const UnitSnapshot& unit) {
  const double body_length = body_length_for_sensor_mount(unit);
  const Vec2 local_origin{
    -body_length * 0.16 + 0.18,
    0.0,
  };
  // The sensor is mounted on the turret (hull -> turret -> sensor), so its origin
  // rotates with the turret heading, not the hull.
  const Vec2 rotated = rotate_local(local_origin, unit.turret_heading_deg);
  return Vec2{
    unit.position.x + rotated.x,
    unit.position.y + rotated.y,
  };
}

bool is_in_fov(Vec2 sensor_origin, Vec2 target_position, double direction_deg, double width_deg) {
  if (width_deg >= 360.0) {
    return true;
  }
  const double target_heading = angle_to(sensor_origin, target_position);
  const double delta = std::abs(shortest_angle_delta_deg(direction_deg, target_heading));
  return delta <= width_deg * 0.5;
}

bool line_of_sight_blocked(
  Vec2 start,
  Vec2 end,
  const std::vector<StaticObstacle>& obstacles,
  const StaticObstacle* ignored_obstacle = nullptr
) {
  for (const auto& obstacle : obstacles) {
    if (&obstacle == ignored_obstacle || !obstacle.blocks_line_of_sight) {
      continue;
    }
    if (segment_intersects_circle(start, end, obstacle.position, obstacle.radius_m)) {
      return true;
    }
  }
  return false;
}

bool is_inside_scan_volume(
  Vec2 sensor_origin,
  Vec2 target_position,
  double effective_range_m,
  double scan_direction_deg,
  double scan_width_deg
) {
  return distance(sensor_origin, target_position) <= effective_range_m
    && is_in_fov(sensor_origin, target_position, scan_direction_deg, scan_width_deg);
}

bool is_enemy_contact(const UnitSnapshot& self, const UnitSnapshot& contact) {
  if (self.team_id != 0 && contact.team_id != 0) {
    return self.team_id != contact.team_id;
  }
  return self.unit_id != contact.unit_id;
}

ContactObservation contact_from_snapshot(const UnitSnapshot& self, const UnitSnapshot& unit) {
  return ContactObservation{
    .unit_id = unit.unit_id,
    .team_id = unit.team_id,
    .is_enemy = is_enemy_contact(self, unit),
    .position = unit.position,
    .hull_heading_deg = unit.hull_heading_deg,
    .turret_heading_deg = unit.turret_heading_deg,
    .armor_integrity = unit.armor_integrity,
    .weapon_cooldown_ticks = unit.weapon_cooldown_ticks,
    .body_shape_type = unit.body_shape_type,
    .body_radius_m = unit.body_radius_m,
    .body_length_m = unit.body_length_m,
    .body_width_m = unit.body_width_m,
  };
}

}  // namespace

SensorSystem::SensorSystem(std::vector<UnitSensorComponent> sensors) : sensors_(std::move(sensors)) {}

SensorSystem::SensorSystem(std::vector<UnitSensorComponent> sensors, std::vector<StaticObstacle> obstacles)
    : sensors_(std::move(sensors)), obstacles_(std::move(obstacles)) {}

Observation SensorSystem::build_observation(const WorldSnapshot& snapshot, UnitId self_id) {
  Observation observation;
  observation.tick = snapshot.tick;
  observation.self_id = self_id;

  const auto* self = find_unit(snapshot, self_id);
  if (self == nullptr) {
    return observation;
  }
  observation.self = *self;  // own state is always fresh

  const UnitScanArcState* scan_state = scan_arc_state_for(self_id);
  if (scan_state == nullptr || !scan_state->initialized) {
    return observation;  // no active scan yet
  }

  const SensorSpec sensor = sensor_for(self_id);
  UnitSensorCache& cache = cache_for(self_id);
  const Tick refresh_ticks = sensor.refresh_ticks > 0 ? sensor.refresh_ticks : 1;
  const bool refresh_due = !cache.has_cache || (snapshot.tick - cache.last_refresh_tick) >= refresh_ticks;

  if (refresh_due) {
    ContactSetObservation contacts;
    const Vec2 sensor_origin = sensor_origin_for_unit(*self);
    const double scan_direction_deg = normalize_angle_deg(scan_state->current_direction_deg);  // slew-limited
    const double scan_width_deg = std::min(std::abs(scan_state->scan_arc.width_deg), sensor.fov_deg);
    const double effective_range_m = scan_state->scan_arc.range_m > 0.0
      ? std::min(scan_state->scan_arc.range_m, sensor.range_m)
      : sensor.range_m;
    for (const auto& unit : snapshot.units) {
      if (unit.unit_id == self_id) {
        continue;
      }
      if (!is_inside_scan_volume(sensor_origin, unit.position, effective_range_m, scan_direction_deg, scan_width_deg)) {
        continue;
      }
      if (line_of_sight_blocked(sensor_origin, unit.position, obstacles_)) {
        continue;
      }
      contacts.units.push_back(contact_from_snapshot(*self, unit));
    }
    for (const auto& obstacle : obstacles_) {
      if (!is_inside_scan_volume(sensor_origin, obstacle.position, effective_range_m, scan_direction_deg, scan_width_deg)) {
        continue;
      }
      if (line_of_sight_blocked(sensor_origin, obstacle.position, obstacles_, &obstacle)) {
        continue;
      }
      contacts.obstacles.push_back(obstacle);
    }
    for (const auto& projectile : snapshot.projectiles) {
      if (!is_inside_scan_volume(sensor_origin, projectile.position, effective_range_m, scan_direction_deg, scan_width_deg)) {
        continue;
      }
      if (line_of_sight_blocked(sensor_origin, projectile.position, obstacles_)) {
        continue;
      }
      contacts.projectiles.push_back(projectile);
    }
    std::sort(contacts.units.begin(), contacts.units.end(),
      [&](const ContactObservation& a, const ContactObservation& b) {
        return distance(sensor_origin, a.position) < distance(sensor_origin, b.position);
      });
    std::sort(contacts.obstacles.begin(), contacts.obstacles.end(),
      [&](const StaticObstacle& a, const StaticObstacle& b) {
        return distance(sensor_origin, a.position) < distance(sensor_origin, b.position);
      });
    std::sort(contacts.projectiles.begin(), contacts.projectiles.end(),
      [&](const ProjectileSnapshot& a, const ProjectileSnapshot& b) {
        return distance(sensor_origin, a.position) < distance(sensor_origin, b.position);
      });
    cache.contacts = std::move(contacts);
    cache.has_cache = true;
    cache.last_refresh_tick = snapshot.tick;
  }

  observation.contacts = cache.contacts;  // fresh this tick, or held since last refresh
  return observation;
}

void SensorSystem::advance_scan(double tick_dt_sec) {
  for (auto& state : scan_arcs_) {
    if (!state.initialized) {
      continue;
    }
    const SensorSpec sensor = sensor_for(state.unit_id);
    const double max_delta = sensor.max_scan_slew_degps * tick_dt_sec;
    // Slew linearly toward the unwrapped target. Because both values are
    // unwrapped, a request rotating faster than the slew rate lags smoothly at
    // max rate instead of reversing when the error passes 180 degrees.
    const double diff = state.target_direction_deg - state.current_direction_deg;
    if (std::abs(diff) <= max_delta) {
      state.current_direction_deg = state.target_direction_deg;
    } else {
      state.current_direction_deg += diff > 0.0 ? max_delta : -max_delta;
    }
  }
}

SensorSystem::ScanState SensorSystem::scan_state_for(UnitId unit_id) const {
  const UnitScanArcState* state = scan_arc_state_for(unit_id);
  if (state == nullptr || !state->initialized) {
    return ScanState{};
  }
  return ScanState{.active = true, .direction_deg = normalize_angle_deg(state->current_direction_deg)};
}

void SensorSystem::set_scan_arc(UnitId unit_id, const ScanArcOrder& scan_arc) {
  const double requested_norm = normalize_angle_deg(scan_arc.direction_deg);
  UnitScanArcState* state = scan_arc_state_for(unit_id);
  if (state == nullptr) {
    // First scan for this unit orients instantly (initial mounting).
    scan_arcs_.push_back(UnitScanArcState{
      .unit_id = unit_id,
      .scan_arc = scan_arc,
      .current_direction_deg = requested_norm,
      .target_direction_deg = requested_norm,
      .prev_requested_deg = requested_norm,
      .initialized = true,
    });
    return;
  }
  // Accumulate the shortest change in the requested direction into the unwrapped
  // target; the current direction slews toward it in advance_scan.
  state->target_direction_deg += shortest_angle_delta_deg(state->prev_requested_deg, requested_norm);
  state->prev_requested_deg = requested_norm;
  state->scan_arc = scan_arc;  // width/range
}

SensorSpec SensorSystem::sensor_for(UnitId unit_id) const {
  for (const auto& sensor : sensors_) {
    if (sensor.unit_id == unit_id) {
      return sensor.component;
    }
  }
  return SensorSpec{};
}

SensorSystem::UnitScanArcState* SensorSystem::scan_arc_state_for(UnitId unit_id) {
  for (auto& scan_arc : scan_arcs_) {
    if (scan_arc.unit_id == unit_id) {
      return &scan_arc;
    }
  }
  return nullptr;
}

const SensorSystem::UnitScanArcState* SensorSystem::scan_arc_state_for(UnitId unit_id) const {
  for (const auto& scan_arc : scan_arcs_) {
    if (scan_arc.unit_id == unit_id) {
      return &scan_arc;
    }
  }
  return nullptr;
}

SensorSystem::UnitSensorCache& SensorSystem::cache_for(UnitId unit_id) {
  for (auto& cache : caches_) {
    if (cache.unit_id == unit_id) {
      return cache;
    }
  }
  caches_.push_back(UnitSensorCache{.unit_id = unit_id, .last_refresh_tick = 0, .has_cache = false, .contacts = {}});
  return caches_.back();
}

std::vector<UnitSensorComponent> sensor_components_from_battle_config(const BattleConfig& config) {
  std::vector<UnitSensorComponent> sensors;
  sensors.reserve(config.units.size());
  for (const auto& unit_spec : config.units) {
    sensors.push_back(UnitSensorComponent{
      .unit_id = unit_spec.unit_id,
      .component = unit_spec.sensor,
    });
  }
  return sensors;
}

}  // namespace robolocks
