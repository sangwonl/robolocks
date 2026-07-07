#pragma once

#include <robolocks/snapshot.hpp>

#include <vector>

namespace robolocks {

struct ContactObservation {
  UnitId unit_id;
  Vec2 position;
  double hull_heading_deg = 0.0;
  double turret_heading_deg = 0.0;
  double armor_integrity = 100.0;
  Tick weapon_cooldown_ticks = 0;
  BodyShapeType body_shape_type = BodyShapeType::Circle;
  double body_radius_m = 1.0;
  double body_length_m = 5.6;
  double body_width_m = 2.8;
};

struct Observation {
  Tick tick = 0;
  UnitId self_id;
  UnitSnapshot self;
  std::vector<ContactObservation> contacts;
  std::vector<StaticObstacle> obstacles;
};

}  // namespace robolocks
