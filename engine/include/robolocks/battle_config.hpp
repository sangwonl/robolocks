#pragma once

#include <robolocks/types.hpp>

#include <cstdint>
#include <string>
#include <vector>

namespace robolocks {

struct SensorComponent {
  std::string id;
  double range_m = 1000.0;
  double fov_deg = 360.0;
  Tick refresh_ticks = 1;
};

struct TransformComponent {
  Vec2 position;
  double hull_heading_deg = 0.0;
};

struct MobilityComponent {
  std::string id;
  double max_speed_mps = 8.0;
  double max_hull_turn_degps = 120.0;
};

struct TurretComponent {
  std::string id;
  double heading_deg = 0.0;
  double max_turn_degps = 180.0;
};

struct ArmorComponent {
  std::string id;
  double integrity = 100.0;
};

struct WeaponComponent {
  std::string id;
  double damage = 25.0;
  double range_m = 80.0;
  double muzzle_velocity_mps = 1000.0;
  double projectile_radius_m = 0.05;
  double aim_tolerance_deg = 5.0;
  Tick reload_ticks = 30;
};

enum class BodyShapeType {
  Circle,
  Box,
};

struct BodyShapeComponent {
  BodyShapeType type = BodyShapeType::Circle;
  double radius_m = 1.0;
  double length_m = 0.0;
  double width_m = 0.0;
};

struct BodyComponent {
  std::string id;
  BodyShapeComponent shape;
  double mass_kg = 30000.0;
};

struct BattleBounds {
  Vec2 min = Vec2{0.0, 0.0};
  Vec2 max = Vec2{40.0, 24.0};
};

struct StaticObstacle {
  std::string id;
  Vec2 position;
  double radius_m = 1.0;
  bool blocks_movement = true;
  bool blocks_line_of_sight = true;
};

struct TankPreset {
  UnitId unit_id;
  std::string name;
  TransformComponent transform;
  MobilityComponent mobility;
  TurretComponent turret;
  WeaponComponent weapon;
  ArmorComponent armor;
  BodyComponent body;
  SensorComponent sensor;
};

struct BattleConfig {
  std::string battle_id = "preset_duel_v0";
  std::uint32_t seed = 1;
  double tick_dt_sec = 1.0 / 30.0;
  Tick tick_limit = 9000;
  BattleBounds bounds;
  std::vector<StaticObstacle> obstacles;
  std::vector<TankPreset> tanks;
};

}  // namespace robolocks
