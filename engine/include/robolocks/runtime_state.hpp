#pragma once

#include <robolocks/battle_config.hpp>
#include <robolocks/snapshot.hpp>

#include <cstdint>

namespace robolocks {

struct IntentChannelState {
  bool active = false;
  Vec2 target{};
  Tick started_tick = 0;
  Tick updated_tick = 0;
};

struct WeaponIntentState {
  bool active = false;
  double min_hit_chance = 0.0;
  Tick started_tick = 0;
  Tick updated_tick = 0;
};

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
  IntentChannelState mobility_intent;
  IntentChannelState turret_intent;
  IntentChannelState hull_intent;
  WeaponIntentState weapon_intent;
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
