#pragma once

#include <robolocks/battle_config.hpp>
#include <robolocks/types.hpp>

#include <cstdint>
#include <string>
#include <vector>

namespace robolocks {

struct UnitModulesSnapshot {
  MobilityComponent mobility;
  TurretComponent turret;
  WeaponComponent weapon;
  ArmorComponent armor;
  BodyComponent body;
  SensorComponent sensor;
};

struct UnitSnapshot {
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
  UnitModulesSnapshot modules;
  bool mobility_intent_active = false;
  Vec2 mobility_intent_target;
  double mobility_intent_remaining_m = 0.0;
  Tick mobility_intent_age_ticks = 0;
  bool turret_intent_active = false;
  Vec2 turret_intent_target;
  double turret_intent_error_deg = 0.0;
  Tick turret_intent_age_ticks = 0;
  bool hull_intent_active = false;
  Vec2 hull_intent_target;
  double hull_intent_error_deg = 0.0;
  Tick hull_intent_age_ticks = 0;
  bool weapon_intent_active = false;
  double weapon_intent_min_hit_chance = 0.0;
  Tick weapon_intent_age_ticks = 0;
};

struct ProjectileSnapshot {
  std::uint64_t projectile_id = 0;
  UnitId owner_unit_id;
  Vec2 previous_position;
  Vec2 position;
  double radius_m = 0.05;
  double height_m = 0.0;
};

struct EventPayload {
  std::uint64_t projectile_id = 0;
  std::string damage_type;
  std::string armor_facing;
  double damage = 0.0;
  double remaining_armor = 0.0;
  double penetration_mm = 0.0;
  double armor_mm = 0.0;
  double impact_distance_m = 0.0;
  double blast_radius_m = 0.0;
};

struct Event {
  Tick tick = 0;
  UnitId unit_id;
  std::string code;
  std::string message;
  EventPayload payload;
};

struct WorldSnapshot {
  Tick tick = 0;
  std::vector<UnitSnapshot> units;
  std::vector<ProjectileSnapshot> projectiles;
};

}  // namespace robolocks
