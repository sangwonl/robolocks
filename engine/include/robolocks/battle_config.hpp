#pragma once

#include <robolocks/types.hpp>

#include <cstdint>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace robolocks {

struct SensorSpec {
  std::string id;
  double range_m = 1000.0;
  double fov_deg = 360.0;
  Tick refresh_ticks = 1;
};

struct TransformSpec {
  Vec2 position;
  double hull_heading_deg = 0.0;
};

struct MobilitySpec {
  std::string id;
  double max_speed_mps = 8.0;
  double max_hull_turn_degps = 120.0;
};

struct TurretSpec {
  std::string id;
  double heading_deg = 0.0;
  double max_turn_degps = 180.0;
};

struct ArmorSpec {
  std::string id;
  double integrity = 100.0;
  double front_mm = 60.0;
  double side_mm = 40.0;
  double rear_mm = 30.0;
};

enum class WeaponFireMode {
  Direct,
  Ballistic,
};

inline const char* to_string(WeaponFireMode mode) {
  switch (mode) {
    case WeaponFireMode::Direct:
      return "direct";
    case WeaponFireMode::Ballistic:
      return "ballistic";
  }
  return "direct";
}

inline WeaponFireMode weapon_fire_mode_from_string(std::string_view mode) {
  if (mode == "direct") {
    return WeaponFireMode::Direct;
  }
  if (mode == "ballistic") {
    return WeaponFireMode::Ballistic;
  }
  throw std::runtime_error("Expected weapon fireMode to be direct or ballistic");
}

struct WeaponSpec {
  std::string id;
  WeaponFireMode fire_mode = WeaponFireMode::Direct;
  double damage = 25.0;
  double penetration_mm = 100.0;
  double range_m = 80.0;
  double muzzle_velocity_mps = 1000.0;
  Vec3 muzzle_offset_m;
  double launch_angle_deg = 0.0;
  double gravity_mps2 = 9.81;
  double blast_radius_m = 0.0;
  double projectile_radius_m = 0.05;
  double aim_tolerance_deg = 5.0;
  Tick reload_ticks = 30;
};

enum class BodyShapeType {
  Circle,
  Box,
};

inline const char* to_string(BodyShapeType type) {
  switch (type) {
    case BodyShapeType::Circle:
      return "circle";
    case BodyShapeType::Box:
      return "box";
  }
  return "circle";
}

inline BodyShapeType body_shape_type_from_string(std::string_view type) {
  if (type == "circle") {
    return BodyShapeType::Circle;
  }
  if (type == "box") {
    return BodyShapeType::Box;
  }
  throw std::runtime_error(std::string("Unsupported modules.body.shape.type: ") + std::string(type));
}

struct BodyShapeSpec {
  BodyShapeType type = BodyShapeType::Circle;
  double radius_m = 1.0;
  double length_m = 0.0;
  double width_m = 0.0;
};

struct BodySpec {
  std::string id;
  BodyShapeSpec shape;
  double mass_kg = 30000.0;
};

enum class BattleBoundsShape {
  Rect,
  Circle,
  Polygon,
};

struct BattleBounds {
  Vec2 min = Vec2{0.0, 0.0};
  Vec2 max = Vec2{40.0, 24.0};
  BattleBoundsShape shape = BattleBoundsShape::Rect;
  Vec2 center = Vec2{20.0, 12.0};
  double radius_m = 12.0;
  std::vector<Vec2> vertices;
};

struct StaticObstacle {
  std::string id;
  Vec2 position;
  double radius_m = 1.0;
  bool blocks_movement = true;
  bool blocks_line_of_sight = true;
};

enum class BattleRuleMode {
  None,
  TimedDeathmatch,
  KillLimitDeathmatch,
  CapturePoint,
};

enum class BattleTeamMode {
  Solo,
  Team,
};

struct SpawnPointSpec {
  std::string id;
  std::uint32_t team_id = 0;
  Vec2 position;
  double radius_m = 0.0;
  double heading_deg = 0.0;
};

struct CaptureZoneSpec {
  std::string id;
  Vec2 position;
  double radius_m = 1.0;
  Tick hold_ticks = 0;
};

struct RespawnRuleConfig {
  bool enabled = false;
  Tick cooldown_ticks = 0;
  Tick invulnerable_ticks = 0;
  std::vector<SpawnPointSpec> spawn_points;
};

struct BattleRuleConfig {
  BattleRuleMode mode = BattleRuleMode::None;
  BattleTeamMode team_mode = BattleTeamMode::Solo;
  Tick time_limit_ticks = 0;
  std::uint32_t kill_limit = 0;
  RespawnRuleConfig respawn;
  std::vector<CaptureZoneSpec> capture_zones;
};

struct UnitSpec {
  UnitId unit_id;
  std::uint32_t team_id = 0;
  std::string name;
  TransformSpec transform;
  MobilitySpec mobility;
  TurretSpec turret;
  WeaponSpec weapon;
  ArmorSpec armor;
  BodySpec body;
  SensorSpec sensor;
};

struct BattleConfig {
  std::string battle_id = "preset_duel_v0";
  std::uint32_t seed = 1;
  double tick_dt_sec = 1.0 / 30.0;
  Tick tick_limit = 9000;
  BattleBounds bounds;
  std::vector<StaticObstacle> obstacles;
  std::vector<UnitSpec> units;
  BattleRuleConfig rule;
};

}  // namespace robolocks
