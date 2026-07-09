#pragma once

#include <robolocks/battle_config.hpp>
#include <robolocks/snapshot.hpp>

#include <cstdint>

namespace robolocks {

struct UnitState {
  UnitId unit_id;
  std::uint32_t team_id = 0;
  std::string name;
  TransformSpec spawn_transform;
  TransformSpec transform;
  MobilitySpec mobility;
  TurretSpec turret;
  WeaponSpec weapon;
  ArmorSpec armor;
  BodySpec body;
  SensorSpec sensor;
  UnitModulesSnapshot module_specs;
  double max_armor_integrity = 100.0;
  Tick invulnerable_until_tick = 0;
  Tick weapon_cooldown_ticks = 0;
  bool mobility_intent_active = false;
  Vec2 mobility_intent_target;
  Tick mobility_intent_started_tick = 0;
  Tick mobility_intent_updated_tick = 0;
  bool turret_intent_active = false;
  Vec2 turret_intent_target;
  Tick turret_intent_started_tick = 0;
  Tick turret_intent_updated_tick = 0;
  bool hull_intent_active = false;
  Vec2 hull_intent_target;
  Tick hull_intent_started_tick = 0;
  Tick hull_intent_updated_tick = 0;
  bool weapon_intent_active = false;
  double weapon_intent_min_hit_chance = 0.0;
  Tick weapon_intent_started_tick = 0;
  Tick weapon_intent_updated_tick = 0;
};

struct ProjectileState {
  std::uint64_t projectile_id = 0;
  UnitId owner_unit_id;
  WeaponFireMode fire_mode = WeaponFireMode::Direct;
  Vec2 previous_position;
  Vec2 position;
  Vec2 velocity;
  double previous_height_m = 0.0;
  double height_m = 0.0;
  double vertical_velocity_mps = 0.0;
  double gravity_mps2 = 9.81;
  double damage = 0.0;
  double penetration_mm = 0.0;
  double blast_radius_m = 0.0;
  double radius_m = 0.05;
  double remaining_range_m = 0.0;
};

}  // namespace robolocks
