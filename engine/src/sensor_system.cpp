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

bool is_in_range(const UnitSnapshot& self, const UnitSnapshot& contact, const SensorSpec& sensor) {
  return distance(self.position, contact.position) <= sensor.range_m;
}

bool is_in_fov(const UnitSnapshot& self, const UnitSnapshot& contact, double direction_deg, double width_deg) {
  if (width_deg >= 360.0) {
    return true;
  }
  const double target_heading = angle_to(self.position, contact.position);
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

ContactObservation contact_from_snapshot(const UnitSnapshot& unit) {
  return ContactObservation{
    .unit_id = unit.unit_id,
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
    const double scan_direction_deg = scan_arc->direction_deg;
    const double scan_width_deg = std::min(std::abs(scan_arc->width_deg), sensor.fov_deg);
    const double effective_range_m = scan_arc->range_m > 0.0
      ? std::min(scan_arc->range_m, sensor.range_m)
      : sensor.range_m;
    for (const auto& unit : snapshot.units) {
      if (unit.unit_id == self_id) {
        continue;
      }
      if (distance(self->position, unit.position) > effective_range_m) {
        continue;
      }
      if (!is_in_fov(*self, unit, scan_direction_deg, scan_width_deg)) {
        continue;
      }
      bool blocked = false;
      for (const auto& obstacle : obstacles_) {
        if (!obstacle.blocks_line_of_sight) {
          continue;
        }
        if (segment_intersects_circle(self->position, unit.position, obstacle.position, obstacle.radius_m)) {
          blocked = true;
          break;
        }
      }
      if (blocked) {
        continue;
      }
      observation.contacts.push_back(contact_from_snapshot(unit));
    }
    std::sort(observation.contacts.begin(), observation.contacts.end(),
      [&](const ContactObservation& a, const ContactObservation& b) {
        return distance(self->position, a.position) < distance(self->position, b.position);
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
