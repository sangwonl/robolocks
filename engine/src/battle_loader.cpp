#include <robolocks/battle_loader.hpp>

#include <filesystem>
#include <fstream>
#include <stdexcept>

#include <nlohmann/json.hpp>

namespace robolocks {

namespace {

double required_number(const nlohmann::json& object, const char* key) {
  if (!object.contains(key) || !object.at(key).is_number()) {
    throw std::runtime_error(std::string("Expected numeric field: ") + key);
  }
  return object.at(key).get<double>();
}

double required_positive_number(const nlohmann::json& object, const char* key) {
  const double value = required_number(object, key);
  if (value <= 0.0) {
    throw std::runtime_error(std::string("Expected positive numeric field: ") + key);
  }
  return value;
}

std::uint32_t required_u32(const nlohmann::json& object, const char* key) {
  if (!object.contains(key) || !object.at(key).is_number_unsigned()) {
    throw std::runtime_error(std::string("Expected unsigned integer field: ") + key);
  }
  return object.at(key).get<std::uint32_t>();
}

std::uint32_t optional_u32(const nlohmann::json& object, const char* key, std::uint32_t fallback) {
  if (!object.contains(key)) {
    return fallback;
  }
  if (!object.at(key).is_number_unsigned()) {
    throw std::runtime_error(std::string("Expected unsigned integer field: ") + key);
  }
  return object.at(key).get<std::uint32_t>();
}

std::string required_string(const nlohmann::json& object, const char* key) {
  if (!object.contains(key) || !object.at(key).is_string()) {
    throw std::runtime_error(std::string("Expected string field: ") + key);
  }
  return object.at(key).get<std::string>();
}

Vec2 required_vec2(const nlohmann::json& object, const char* key) {
  if (!object.contains(key) || !object.at(key).is_object()) {
    throw std::runtime_error(std::string("Expected vector field: ") + key);
  }
  const auto& vec = object.at(key);
  return Vec2{
    .x = required_number(vec, "x"),
    .y = required_number(vec, "y"),
  };
}

double optional_number(const nlohmann::json& object, const char* key, double fallback) {
  if (!object.contains(key)) {
    return fallback;
  }
  if (!object.at(key).is_number()) {
    throw std::runtime_error(std::string("Expected numeric field: ") + key);
  }
  return object.at(key).get<double>();
}

std::string optional_string(const nlohmann::json& object, const char* key) {
  if (!object.contains(key)) {
    return {};
  }
  if (!object.at(key).is_string()) {
    throw std::runtime_error(std::string("Expected string field: ") + key);
  }
  return object.at(key).get<std::string>();
}

bool optional_bool(const nlohmann::json& object, const char* key, bool fallback) {
  if (!object.contains(key)) {
    return fallback;
  }
  if (!object.at(key).is_boolean()) {
    throw std::runtime_error(std::string("Expected boolean field: ") + key);
  }
  return object.at(key).get<bool>();
}

Vec2 optional_vec2(const nlohmann::json& object, const char* key) {
  if (!object.contains(key)) {
    return Vec2{};
  }
  return required_vec2(object, key);
}

std::string resolve_relative_path(const std::filesystem::path& base_dir, const std::string& path) {
  if (path.empty()) {
    return {};
  }
  std::filesystem::path script_path(path);
  if (script_path.is_relative()) {
    script_path = base_dir / script_path;
  }
  return script_path.lexically_normal().string();
}

double optional_spawn_heading_deg(const nlohmann::json& tank) {
  if (!tank.contains("spawn") || !tank.at("spawn").is_object()) {
    throw std::runtime_error("Expected vector field: spawn");
  }
  return optional_number(tank.at("spawn"), "headingDeg", 0.0);
}

const nlohmann::json* optional_module(const nlohmann::json& tank, const char* module_key) {
  if (!tank.contains("modules")) {
    return nullptr;
  }
  const auto& modules = tank.at("modules");
  if (!modules.is_object()) {
    throw std::runtime_error("Expected modules object");
  }
  if (!modules.contains(module_key)) {
    return nullptr;
  }
  const auto& module = modules.at(module_key);
  if (!module.is_object()) {
    throw std::runtime_error(std::string("Expected modules.") + module_key + " object");
  }
  return &module;
}

MobilityComponent optional_mobility_component(const nlohmann::json& tank) {
  MobilityComponent mobility;
  const auto* mobility_json = optional_module(tank, "mobility");
  if (mobility_json == nullptr) {
    return mobility;
  }
  mobility.max_speed_mps = optional_number(*mobility_json, "maxSpeedMps", mobility.max_speed_mps);
  mobility.max_hull_turn_degps = optional_number(*mobility_json, "maxHullTurnDegps", mobility.max_hull_turn_degps);
  return mobility;
}

TurretComponent optional_turret_component(const nlohmann::json& tank, double spawn_heading_deg) {
  TurretComponent turret;
  turret.heading_deg = spawn_heading_deg;
  const auto* turret_json = optional_module(tank, "turret");
  if (turret_json == nullptr) {
    return turret;
  }
  turret.max_turn_degps = optional_number(*turret_json, "maxTurnDegps", turret.max_turn_degps);
  return turret;
}

WeaponComponent optional_weapon_component(const nlohmann::json& tank) {
  WeaponComponent weapon;
  const auto* weapon_json = optional_module(tank, "weapon");
  if (weapon_json == nullptr) {
    return weapon;
  }
  weapon.damage = optional_number(*weapon_json, "damage", weapon.damage);
  weapon.range_m = optional_number(*weapon_json, "rangeM", weapon.range_m);
  weapon.aim_tolerance_deg = optional_number(*weapon_json, "aimToleranceDeg", weapon.aim_tolerance_deg);
  weapon.reload_ticks = optional_u32(*weapon_json, "reloadTicks", weapon.reload_ticks);
  return weapon;
}

ArmorComponent optional_armor_component(const nlohmann::json& tank) {
  ArmorComponent armor;
  const auto* armor_json = optional_module(tank, "armor");
  if (armor_json == nullptr) {
    return armor;
  }
  armor.integrity = optional_number(*armor_json, "integrity", armor.integrity);
  return armor;
}

BodyShapeComponent required_body_shape_component(const nlohmann::json& body_json) {
  if (!body_json.contains("shape") || !body_json.at("shape").is_object()) {
    throw std::runtime_error("Expected modules.body.shape object");
  }

  const auto& shape_json = body_json.at("shape");
  const auto shape_type = required_string(shape_json, "type");

  BodyShapeComponent shape;
  shape.radius_m = required_positive_number(shape_json, "radiusM");

  if (shape_type == "circle") {
    shape.type = BodyShapeType::Circle;
    return shape;
  }

  if (shape_type == "box") {
    shape.type = BodyShapeType::Box;
    shape.length_m = required_positive_number(shape_json, "lengthM");
    shape.width_m = required_positive_number(shape_json, "widthM");
    return shape;
  }

  throw std::runtime_error("Unsupported modules.body.shape.type: " + shape_type);
}

BodyComponent optional_body_component(const nlohmann::json& tank) {
  BodyComponent body;
  const auto* body_json = optional_module(tank, "body");
  if (body_json == nullptr) {
    return body;
  }
  body.shape = required_body_shape_component(*body_json);
  body.mass_kg = optional_number(*body_json, "massKg", body.mass_kg);
  return body;
}

SensorComponent optional_sensor_component(const nlohmann::json& tank) {
  SensorComponent sensor;
  const auto* sensor_json = optional_module(tank, "sensor");
  if (sensor_json == nullptr) {
    return sensor;
  }
  sensor.range_m = optional_number(*sensor_json, "rangeM", sensor.range_m);
  sensor.fov_deg = optional_number(*sensor_json, "fovDeg", sensor.fov_deg);
  sensor.refresh_ticks = optional_u32(*sensor_json, "refreshTicks", sensor.refresh_ticks);
  return sensor;
}

std::vector<StaticObstacle> optional_obstacles(const nlohmann::json& data) {
  std::vector<StaticObstacle> obstacles;
  if (!data.contains("obstacles")) {
    return obstacles;
  }
  if (!data.at("obstacles").is_array()) {
    throw std::runtime_error("Expected obstacles array");
  }

  for (const auto& obstacle : data.at("obstacles")) {
    if (!obstacle.is_object()) {
      throw std::runtime_error("Expected obstacle object");
    }
    StaticObstacle parsed;
    parsed.id = required_string(obstacle, "id");
    parsed.position = required_vec2(obstacle, "position");
    parsed.radius_m = optional_number(obstacle, "radiusM", parsed.radius_m);
    parsed.blocks_movement = optional_bool(obstacle, "blocksMovement", parsed.blocks_movement);
    parsed.blocks_line_of_sight = optional_bool(
      obstacle,
      "blocksLineOfSight",
      parsed.blocks_line_of_sight
    );
    obstacles.push_back(parsed);
  }

  return obstacles;
}

}  // namespace

LoadedBattle load_battle_from_file(const std::string& path) {
  std::ifstream input(path);
  if (!input) {
    throw std::runtime_error("Failed to open battle config: " + path);
  }

  nlohmann::json data;
  input >> data;
  const auto base_dir = std::filesystem::path(path).parent_path();

  LoadedBattle loaded;
  loaded.config.battle_id = required_string(data, "matchId");
  loaded.config.seed = required_u32(data, "seed");

  const double tick_rate = required_number(data, "tickRate");
  if (tick_rate <= 0.0) {
    throw std::runtime_error("tickRate must be positive");
  }
  loaded.config.tick_dt_sec = 1.0 / tick_rate;
  loaded.config.tick_limit = required_u32(data, "tickLimit");
  loaded.config.obstacles = optional_obstacles(data);

  if (!data.contains("tanks") || !data.at("tanks").is_array()) {
    throw std::runtime_error("Expected tanks array");
  }

  loaded.config.tanks.clear();
  for (const auto& tank : data.at("tanks")) {
    const double spawn_heading_deg = optional_spawn_heading_deg(tank);
    loaded.config.tanks.push_back(TankPreset{
      .unit_id = UnitId{required_u32(tank, "unitId")},
      .name = required_string(tank, "name"),
      .transform = TransformComponent{
        .position = required_vec2(tank, "spawn"),
        .hull_heading_deg = spawn_heading_deg,
      },
      .mobility = optional_mobility_component(tank),
      .turret = optional_turret_component(tank, spawn_heading_deg),
      .weapon = optional_weapon_component(tank),
      .armor = optional_armor_component(tank),
      .body = optional_body_component(tank),
      .sensor = optional_sensor_component(tank),
    });
  }

  if (!data.contains("controllers") || !data.at("controllers").is_array()) {
    throw std::runtime_error("Expected controllers array");
  }

  loaded.controllers.clear();
  for (const auto& controller : data.at("controllers")) {
    const auto controller_path = optional_string(controller, "path");
    loaded.controllers.push_back(ControllerConfig{
      .unit_id = UnitId{required_u32(controller, "unitId")},
      .type = required_string(controller, "type"),
      .id = optional_string(controller, "id"),
      .path = controller_path,
      .resolved_path = resolve_relative_path(base_dir, controller_path),
      .hold_position = optional_vec2(controller, "hold"),
    });
  }

  return loaded;
}

BattleConfig load_battle_config_from_file(const std::string& path) {
  return load_battle_from_file(path).config;
}

}  // namespace robolocks
