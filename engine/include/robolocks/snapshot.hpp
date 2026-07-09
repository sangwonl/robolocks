#pragma once

#include <robolocks/battle_config.hpp>
#include <robolocks/types.hpp>

#include <cstdint>
#include <string>
#include <vector>

namespace robolocks {

struct UnitModulesSnapshot {
  MobilitySpec mobility;
  TurretSpec turret;
  WeaponSpec weapon;
  ArmorSpec armor;
  BodySpec body;
  SensorSpec sensor;
};

struct MobilityIntentSnapshot {
  bool active = false;
  Vec2 target{};
  double remaining_m = 0.0;
  Tick age_ticks = 0;
};

struct AimIntentSnapshot {
  bool active = false;
  Vec2 target{};
  double error_deg = 0.0;
  Tick age_ticks = 0;
};

struct WeaponIntentSnapshot {
  bool active = false;
  double min_hit_chance = 0.0;
  Tick age_ticks = 0;
};

struct UnitSnapshot {
  UnitId unit_id;
  std::uint32_t team_id = 0;
  std::string name;
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
  Tick invulnerable_until_tick = 0;
  MobilityIntentSnapshot mobility_intent;
  AimIntentSnapshot turret_intent;
  AimIntentSnapshot hull_intent;
  WeaponIntentSnapshot weapon_intent;
};

struct ProjectileSnapshot {
  std::uint64_t projectile_id = 0;
  UnitId owner_unit_id;
  Vec2 previous_position;
  Vec2 position;
  double radius_m = 0.05;
  double previous_height_m = 0.0;
  double height_m = 0.0;
};

struct EventPayload {
  std::uint64_t projectile_id = 0;
  UnitId source_unit_id;
  UnitId target_unit_id;
  std::uint32_t source_team_id = 0;
  std::uint32_t target_team_id = 0;
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
  BattleBounds bounds;
  std::vector<UnitSnapshot> units;
  std::vector<ProjectileSnapshot> projectiles;
};

}  // namespace robolocks
