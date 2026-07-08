#include <robolocks/battle_loader.hpp>

#include <filesystem>
#include <fstream>
#include <map>
#include <optional>
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

Vec3 required_vec3(const nlohmann::json& object, const char* key) {
  if (!object.contains(key) || !object.at(key).is_object()) {
    throw std::runtime_error(std::string("Expected vector field: ") + key);
  }
  const auto& vec = object.at(key);
  return Vec3{
    .x = required_number(vec, "x"),
    .y = required_number(vec, "y"),
    .z = required_number(vec, "z"),
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

WeaponFireMode optional_weapon_fire_mode(const nlohmann::json& object, WeaponFireMode fallback) {
  if (!object.contains("fireMode")) {
    return fallback;
  }
  const auto mode = required_string(object, "fireMode");
  if (mode == "direct") {
    return WeaponFireMode::Direct;
  }
  if (mode == "ballistic") {
    return WeaponFireMode::Ballistic;
  }
  throw std::runtime_error("Expected weapon fireMode to be direct or ballistic");
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

Vec3 optional_vec3(const nlohmann::json& object, const char* key) {
  if (!object.contains(key)) {
    return Vec3{};
  }
  return required_vec3(object, key);
}

struct ModuleCatalog {
  std::map<std::string, nlohmann::json> mobility;
  std::map<std::string, nlohmann::json> turret;
  std::map<std::string, nlohmann::json> weapon;
  std::map<std::string, nlohmann::json> armor;
  std::map<std::string, nlohmann::json> body;
  std::map<std::string, nlohmann::json> sensor;
};

const nlohmann::json* optional_module(const nlohmann::json& unit, const char* module_key);

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

void load_catalog_section(
  const nlohmann::json& catalog,
  const char* key,
  std::map<std::string, nlohmann::json>& out
) {
  if (!catalog.contains(key)) {
    return;
  }
  if (!catalog.at(key).is_array()) {
    throw std::runtime_error(std::string("Expected module catalog array: ") + key);
  }
  for (const auto& module : catalog.at(key)) {
    if (!module.is_object()) {
      throw std::runtime_error(std::string("Expected module catalog object: ") + key);
    }
    out.emplace(required_string(module, "id"), module);
  }
}

ModuleCatalog load_module_catalog(const std::filesystem::path& battle_dir, const nlohmann::json& data) {
  ModuleCatalog catalog;
  if (!data.contains("moduleCatalog")) {
    return catalog;
  }
  if (!data.at("moduleCatalog").is_string()) {
    throw std::runtime_error("Expected string field: moduleCatalog");
  }

  const auto catalog_path = resolve_relative_path(battle_dir, data.at("moduleCatalog").get<std::string>());
  std::ifstream input(catalog_path);
  if (!input) {
    throw std::runtime_error("Failed to open module catalog: " + catalog_path);
  }

  nlohmann::json catalog_json;
  input >> catalog_json;
  load_catalog_section(catalog_json, "mobility", catalog.mobility);
  load_catalog_section(catalog_json, "turret", catalog.turret);
  load_catalog_section(catalog_json, "weapon", catalog.weapon);
  load_catalog_section(catalog_json, "armor", catalog.armor);
  load_catalog_section(catalog_json, "body", catalog.body);
  load_catalog_section(catalog_json, "sensor", catalog.sensor);
  return catalog;
}

const nlohmann::json* catalog_module_by_id(
  const std::map<std::string, nlohmann::json>& modules,
  const std::string& module_key,
  const std::string& id
) {
  const auto found = modules.find(id);
  if (found == modules.end()) {
    throw std::runtime_error("Unknown " + module_key + " module id: " + id);
  }
  return &found->second;
}

std::optional<nlohmann::json> resolved_module_json(
  const nlohmann::json& unit,
  const char* module_key,
  const std::map<std::string, nlohmann::json>& catalog_modules
) {
  const auto* inline_module = optional_module(unit, module_key);
  if (inline_module == nullptr) {
    return std::nullopt;
  }

  if (!inline_module->contains("id")) {
    return *inline_module;
  }

  const auto id = required_string(*inline_module, "id");
  if (catalog_modules.empty()) {
    return *inline_module;
  }

  auto resolved = *catalog_module_by_id(catalog_modules, module_key, id);
  for (auto it = inline_module->begin(); it != inline_module->end(); ++it) {
    resolved[it.key()] = it.value();
  }
  return resolved;
}

double optional_spawn_heading_deg(const nlohmann::json& unit) {
  if (!unit.contains("spawn") || !unit.at("spawn").is_object()) {
    throw std::runtime_error("Expected vector field: spawn");
  }
  return optional_number(unit.at("spawn"), "headingDeg", 0.0);
}

const nlohmann::json* optional_module(const nlohmann::json& unit, const char* module_key) {
  if (!unit.contains("modules")) {
    return nullptr;
  }
  const auto& modules = unit.at("modules");
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

MobilitySpec optional_mobility_component(const nlohmann::json& unit, const ModuleCatalog& catalog) {
  MobilitySpec mobility;
  const auto mobility_json = resolved_module_json(unit, "mobility", catalog.mobility);
  if (!mobility_json.has_value()) {
    return mobility;
  }
  mobility.id = optional_string(*mobility_json, "id");
  mobility.max_speed_mps = optional_number(*mobility_json, "maxSpeedMps", mobility.max_speed_mps);
  mobility.max_hull_turn_degps = optional_number(*mobility_json, "maxHullTurnDegps", mobility.max_hull_turn_degps);
  return mobility;
}

TurretSpec optional_turret_component(
  const nlohmann::json& unit,
  const ModuleCatalog& catalog,
  double spawn_heading_deg
) {
  TurretSpec turret;
  turret.heading_deg = spawn_heading_deg;
  const auto turret_json = resolved_module_json(unit, "turret", catalog.turret);
  if (!turret_json.has_value()) {
    return turret;
  }
  turret.id = optional_string(*turret_json, "id");
  turret.max_turn_degps = optional_number(*turret_json, "maxTurnDegps", turret.max_turn_degps);
  return turret;
}

WeaponSpec optional_weapon_component(const nlohmann::json& unit, const ModuleCatalog& catalog) {
  WeaponSpec weapon;
  const auto weapon_json = resolved_module_json(unit, "weapon", catalog.weapon);
  if (!weapon_json.has_value()) {
    return weapon;
  }
  weapon.id = optional_string(*weapon_json, "id");
  weapon.fire_mode = optional_weapon_fire_mode(*weapon_json, weapon.fire_mode);
  weapon.damage = optional_number(*weapon_json, "damage", weapon.damage);
  weapon.penetration_mm = optional_number(*weapon_json, "penetrationMm", weapon.penetration_mm);
  weapon.range_m = optional_number(*weapon_json, "rangeM", weapon.range_m);
  weapon.muzzle_velocity_mps = optional_number(*weapon_json, "muzzleVelocityMps", weapon.muzzle_velocity_mps);
  weapon.muzzle_offset_m = optional_vec3(*weapon_json, "muzzleOffsetM");
  weapon.launch_angle_deg = optional_number(*weapon_json, "launchAngleDeg", weapon.launch_angle_deg);
  weapon.gravity_mps2 = optional_number(*weapon_json, "gravityMps2", weapon.gravity_mps2);
  weapon.blast_radius_m = optional_number(*weapon_json, "blastRadiusM", weapon.blast_radius_m);
  weapon.projectile_radius_m = optional_number(*weapon_json, "projectileRadiusM", weapon.projectile_radius_m);
  weapon.aim_tolerance_deg = optional_number(*weapon_json, "aimToleranceDeg", weapon.aim_tolerance_deg);
  weapon.reload_ticks = optional_u32(*weapon_json, "reloadTicks", weapon.reload_ticks);
  return weapon;
}

ArmorSpec optional_armor_component(const nlohmann::json& unit, const ModuleCatalog& catalog) {
  ArmorSpec armor;
  const auto armor_json = resolved_module_json(unit, "armor", catalog.armor);
  if (!armor_json.has_value()) {
    return armor;
  }
  armor.id = optional_string(*armor_json, "id");
  armor.integrity = optional_number(*armor_json, "integrity", armor.integrity);
  armor.front_mm = optional_number(*armor_json, "frontMm", armor.front_mm);
  armor.side_mm = optional_number(*armor_json, "sideMm", armor.side_mm);
  armor.rear_mm = optional_number(*armor_json, "rearMm", armor.rear_mm);
  return armor;
}

BodyShapeSpec required_body_shape_component(const nlohmann::json& body_json) {
  if (!body_json.contains("shape") || !body_json.at("shape").is_object()) {
    throw std::runtime_error("Expected modules.body.shape object");
  }

  const auto& shape_json = body_json.at("shape");
  const auto shape_type = required_string(shape_json, "type");

  BodyShapeSpec shape;
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

BodySpec optional_body_component(const nlohmann::json& unit, const ModuleCatalog& catalog) {
  BodySpec body;
  const auto body_json = resolved_module_json(unit, "body", catalog.body);
  if (!body_json.has_value()) {
    return body;
  }
  body.id = optional_string(*body_json, "id");
  body.shape = required_body_shape_component(*body_json);
  body.mass_kg = optional_number(*body_json, "massKg", body.mass_kg);
  return body;
}

SensorSpec optional_sensor_component(const nlohmann::json& unit, const ModuleCatalog& catalog) {
  SensorSpec sensor;
  const auto sensor_json = resolved_module_json(unit, "sensor", catalog.sensor);
  if (!sensor_json.has_value()) {
    return sensor;
  }
  sensor.id = optional_string(*sensor_json, "id");
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

const nlohmann::json& required_units_array(const nlohmann::json& data) {
  if (!data.contains("units") || !data.at("units").is_array()) {
    throw std::runtime_error("Expected units array");
  }
  return data.at("units");
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
  loaded.config.battle_id = required_string(data, "battleId");
  loaded.config.seed = required_u32(data, "seed");

  const double tick_rate = required_number(data, "tickRate");
  if (tick_rate <= 0.0) {
    throw std::runtime_error("tickRate must be positive");
  }
  loaded.config.tick_dt_sec = 1.0 / tick_rate;
  loaded.config.tick_limit = required_u32(data, "tickLimit");
  loaded.config.obstacles = optional_obstacles(data);
  const auto module_catalog = load_module_catalog(base_dir, data);

  loaded.config.units.clear();
  for (const auto& unit : required_units_array(data)) {
    const double spawn_heading_deg = optional_spawn_heading_deg(unit);
    loaded.config.units.push_back(UnitSpec{
      .unit_id = UnitId{required_u32(unit, "unitId")},
      .name = required_string(unit, "name"),
      .transform = TransformSpec{
        .position = required_vec2(unit, "spawn"),
        .hull_heading_deg = spawn_heading_deg,
      },
      .mobility = optional_mobility_component(unit, module_catalog),
      .turret = optional_turret_component(unit, module_catalog, spawn_heading_deg),
      .weapon = optional_weapon_component(unit, module_catalog),
      .armor = optional_armor_component(unit, module_catalog),
      .body = optional_body_component(unit, module_catalog),
      .sensor = optional_sensor_component(unit, module_catalog),
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
