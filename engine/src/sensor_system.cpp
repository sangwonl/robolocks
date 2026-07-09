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

double distance(Vec2 a, Vec2 b) {
  return length(Vec2{b.x - a.x, b.y - a.y});
}

Vec2 rotate_local(Vec2 local, double heading_deg) {
  constexpr double kPi = 3.14159265358979323846;
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
  const Vec2 rotated = rotate_local(local_origin, unit.hull_heading_deg);
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

bool segment_intersects_circle(Vec2 start, Vec2 end, Vec2 center, double radius) {
  const Vec2 segment{end.x - start.x, end.y - start.y};
  const double length_squared = segment.x * segment.x + segment.y * segment.y;
  if (length_squared <= 0.0) {
    return distance(start, center) <= radius;
  }

  const Vec2 start_to_center{center.x - start.x, center.y - start.y};
  const double projection =
    (start_to_center.x * segment.x + start_to_center.y * segment.y) / length_squared;
  const double clamped_projection = clamp(projection, 0.0, 1.0);
  const Vec2 closest{
    start.x + segment.x * clamped_projection,
    start.y + segment.y * clamped_projection,
  };
  return distance(closest, center) <= radius;
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

Observation SensorSystem::build_observation(const WorldSnapshot& snapshot, UnitId self_id) const {
  Observation observation;
  observation.tick = snapshot.tick;
  observation.self_id = self_id;

  const auto* self = find_unit(snapshot, self_id);
  if (self == nullptr) {
    return observation;
  }
  observation.self = *self;

  const SensorSpec sensor = sensor_for(self_id);
  const ScanArcOrder* scan_arc = scan_arc_for(self_id);
  if (scan_arc != nullptr) {
    const Vec2 sensor_origin = sensor_origin_for_unit(*self);
    const double scan_direction_deg = scan_arc->direction_deg;
    const double scan_width_deg = std::min(std::abs(scan_arc->width_deg), sensor.fov_deg);
    const double effective_range_m = scan_arc->range_m > 0.0
      ? std::min(scan_arc->range_m, sensor.range_m)
      : sensor.range_m;
    for (const auto& unit : snapshot.units) {
      if (unit.unit_id == self_id) {
        continue;
      }
      if (!is_inside_scan_volume(
        sensor_origin,
        unit.position,
        effective_range_m,
        scan_direction_deg,
        scan_width_deg
      )) {
        continue;
      }
      if (line_of_sight_blocked(sensor_origin, unit.position, obstacles_)) {
        continue;
      }
      observation.contacts.units.push_back(contact_from_snapshot(*self, unit));
    }
    for (const auto& obstacle : obstacles_) {
      if (!is_inside_scan_volume(
        sensor_origin,
        obstacle.position,
        effective_range_m,
        scan_direction_deg,
        scan_width_deg
      )) {
        continue;
      }
      if (line_of_sight_blocked(sensor_origin, obstacle.position, obstacles_, &obstacle)) {
        continue;
      }
      observation.contacts.obstacles.push_back(obstacle);
    }
    for (const auto& projectile : snapshot.projectiles) {
      if (!is_inside_scan_volume(
        sensor_origin,
        projectile.position,
        effective_range_m,
        scan_direction_deg,
        scan_width_deg
      )) {
        continue;
      }
      if (line_of_sight_blocked(sensor_origin, projectile.position, obstacles_)) {
        continue;
      }
      observation.contacts.projectiles.push_back(projectile);
    }
    std::sort(observation.contacts.units.begin(), observation.contacts.units.end(),
      [&](const ContactObservation& a, const ContactObservation& b) {
        return distance(sensor_origin, a.position) < distance(sensor_origin, b.position);
      });
    std::sort(observation.contacts.obstacles.begin(), observation.contacts.obstacles.end(),
      [&](const StaticObstacle& a, const StaticObstacle& b) {
        return distance(sensor_origin, a.position) < distance(sensor_origin, b.position);
      });
    std::sort(observation.contacts.projectiles.begin(), observation.contacts.projectiles.end(),
      [&](const ProjectileSnapshot& a, const ProjectileSnapshot& b) {
        return distance(sensor_origin, a.position) < distance(sensor_origin, b.position);
      });
  }

  return observation;
}

void SensorSystem::set_scan_arc(UnitId unit_id, const ScanArcOrder& scan_arc) {
  for (auto& active_scan_arc : scan_arcs_) {
    if (active_scan_arc.unit_id == unit_id) {
      active_scan_arc.scan_arc = scan_arc;
      return;
    }
  }
  scan_arcs_.push_back(UnitScanArcState{
    .unit_id = unit_id,
    .scan_arc = scan_arc,
  });
}

SensorSpec SensorSystem::sensor_for(UnitId unit_id) const {
  for (const auto& sensor : sensors_) {
    if (sensor.unit_id == unit_id) {
      return sensor.component;
    }
  }
  return SensorSpec{};
}

const ScanArcOrder* SensorSystem::scan_arc_for(UnitId unit_id) const {
  for (const auto& scan_arc : scan_arcs_) {
    if (scan_arc.unit_id == unit_id) {
      return &scan_arc.scan_arc;
    }
  }
  return nullptr;
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
