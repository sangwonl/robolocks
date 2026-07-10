#include <robolocks/battle_loader.hpp>

#include <robolocks/json_field.hpp>

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <map>
#include <optional>
#include <stdexcept>

#include <nlohmann/json.hpp>

namespace robolocks {

namespace {

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

Vec2 required_inline_vec2(const nlohmann::json& object, const char* field_label) {
  if (!object.is_object()) {
    throw std::runtime_error(std::string("Expected vector field: ") + field_label);
  }
  return Vec2{
    .x = required_number(object, "x", field_label),
    .y = required_number(object, "y", field_label),
  };
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
  return weapon_fire_mode_from_string(required_string(object, "fireMode"));
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
  mobility.max_speed_mps = optional_number(*mobility_json, "maxSpeedMetersPerSecond", mobility.max_speed_mps);
  mobility.max_hull_turn_degps = optional_number(*mobility_json, "maxHullTurnDegreesPerSecond", mobility.max_hull_turn_degps);
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
  turret.max_turn_degps = optional_number(*turret_json, "maxTurnDegreesPerSecond", turret.max_turn_degps);
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
  weapon.penetration_mm = optional_number(*weapon_json, "penetrationMillimeters", weapon.penetration_mm);
  weapon.range_m = optional_number(*weapon_json, "rangeMeters", weapon.range_m);
  weapon.muzzle_velocity_mps = optional_number(*weapon_json, "muzzleVelocityMetersPerSecond", weapon.muzzle_velocity_mps);
  weapon.muzzle_offset_m = optional_vec3(*weapon_json, "muzzleOffsetMeters");
  weapon.launch_angle_deg = optional_number(*weapon_json, "launchAngleDegrees", weapon.launch_angle_deg);
  weapon.gravity_mps2 = optional_number(*weapon_json, "gravityMetersPerSecondSquared", weapon.gravity_mps2);
  weapon.blast_radius_m = optional_number(*weapon_json, "blastRadiusMeters", weapon.blast_radius_m);
  weapon.projectile_radius_m = optional_number(*weapon_json, "projectileRadiusMeters", weapon.projectile_radius_m);
  weapon.aim_tolerance_deg = optional_number(*weapon_json, "aimToleranceDegrees", weapon.aim_tolerance_deg);
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
  armor.front_mm = optional_number(*armor_json, "frontMillimeters", armor.front_mm);
  armor.side_mm = optional_number(*armor_json, "sideMillimeters", armor.side_mm);
  armor.rear_mm = optional_number(*armor_json, "rearMillimeters", armor.rear_mm);
  return armor;
}

BodyShapeSpec required_body_shape_component(const nlohmann::json& body_json) {
  if (!body_json.contains("shape") || !body_json.at("shape").is_object()) {
    throw std::runtime_error("Expected modules.body.shape object");
  }

  const auto& shape_json = body_json.at("shape");
  const auto shape_type = required_string(shape_json, "type");

  BodyShapeSpec shape;
  shape.radius_m = required_positive_number(shape_json, "radiusMeters");
  shape.type = body_shape_type_from_string(shape_type);

  if (shape.type == BodyShapeType::Box) {
    shape.length_m = required_positive_number(shape_json, "lengthMeters");
    shape.width_m = required_positive_number(shape_json, "widthMeters");
  }

  return shape;
}

BodySpec optional_body_component(const nlohmann::json& unit, const ModuleCatalog& catalog) {
  BodySpec body;
  const auto body_json = resolved_module_json(unit, "body", catalog.body);
  if (!body_json.has_value()) {
    return body;
  }
  body.id = optional_string(*body_json, "id");
  body.shape = required_body_shape_component(*body_json);
  body.mass_kg = optional_number(*body_json, "massKilograms", body.mass_kg);
  return body;
}

SensorSpec optional_sensor_component(const nlohmann::json& unit, const ModuleCatalog& catalog) {
  SensorSpec sensor;
  const auto sensor_json = resolved_module_json(unit, "sensor", catalog.sensor);
  if (!sensor_json.has_value()) {
    return sensor;
  }
  sensor.id = optional_string(*sensor_json, "id");
  sensor.range_m = optional_number(*sensor_json, "rangeMeters", sensor.range_m);
  sensor.fov_deg = optional_number(*sensor_json, "fovDegrees", sensor.fov_deg);
  sensor.refresh_ticks = optional_u32(*sensor_json, "refreshTicks", sensor.refresh_ticks);
  sensor.max_scan_slew_degps = optional_number(*sensor_json, "maxScanSlewDegps", sensor.max_scan_slew_degps);
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
    parsed.radius_m = optional_number(obstacle, "radiusMeters", parsed.radius_m);
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

BattleRuleMode rule_mode_from_string(const std::string& mode) {
  if (mode == "timed_deathmatch") {
    return BattleRuleMode::TimedDeathmatch;
  }
  if (mode == "kill_limit_deathmatch") {
    return BattleRuleMode::KillLimitDeathmatch;
  }
  if (mode == "capture_point") {
    return BattleRuleMode::CapturePoint;
  }
  return BattleRuleMode::None;
}

BattleTeamMode team_mode_from_string(const std::string& mode) {
  if (mode == "team") {
    return BattleTeamMode::Team;
  }
  return BattleTeamMode::Solo;
}

std::vector<SpawnPointSpec> optional_spawn_points(const nlohmann::json& respawn) {
  std::vector<SpawnPointSpec> spawn_points;
  if (!respawn.contains("spawnPoints")) {
    return spawn_points;
  }
  if (!respawn.at("spawnPoints").is_array()) {
    throw std::runtime_error("Expected rule.respawn.spawnPoints array");
  }

  for (const auto& spawn_point : respawn.at("spawnPoints")) {
    if (!spawn_point.is_object()) {
      throw std::runtime_error("Expected spawn point object");
    }
    spawn_points.push_back(SpawnPointSpec{
      .id = required_string(spawn_point, "id"),
      .team_id = optional_u32(spawn_point, "teamId", 0),
      .position = required_vec2(spawn_point, "position"),
      .radius_m = optional_number(spawn_point, "radiusMeters", 0.0),
      .heading_deg = optional_number(spawn_point, "headingDegrees", 0.0),
    });
  }
  return spawn_points;
}

std::vector<CaptureZoneSpec> optional_capture_zones(const nlohmann::json& rule_json) {
  std::vector<CaptureZoneSpec> capture_zones;
  if (!rule_json.contains("captureZones")) {
    return capture_zones;
  }
  if (!rule_json.at("captureZones").is_array()) {
    throw std::runtime_error("Expected rule.captureZones array");
  }

  for (const auto& zone : rule_json.at("captureZones")) {
    if (!zone.is_object()) {
      throw std::runtime_error("Expected capture zone object");
    }
    capture_zones.push_back(CaptureZoneSpec{
      .id = required_string(zone, "id"),
      .position = required_vec2(zone, "position"),
      .radius_m = optional_number(zone, "radiusMeters", 1.0),
      .hold_ticks = optional_u32(zone, "holdTicks", 0),
    });
  }
  return capture_zones;
}

BattleRuleConfig optional_rule(const nlohmann::json& data) {
  BattleRuleConfig rule;
  if (!data.contains("rule")) {
    return rule;
  }
  if (!data.at("rule").is_object()) {
    throw std::runtime_error("Expected rule object");
  }

  const auto& rule_json = data.at("rule");
  rule.mode = rule_mode_from_string(optional_string(rule_json, "mode"));
  rule.team_mode = team_mode_from_string(optional_string(rule_json, "teamMode"));
  rule.kill_limit = optional_u32(rule_json, "killLimit", rule.kill_limit);
  rule.time_limit_ticks = optional_u32(rule_json, "timeLimitTicks", rule.time_limit_ticks);
  rule.capture_zones = optional_capture_zones(rule_json);

  if (rule_json.contains("respawn")) {
    if (!rule_json.at("respawn").is_object()) {
      throw std::runtime_error("Expected rule.respawn object");
    }
    const auto& respawn_json = rule_json.at("respawn");
    rule.respawn.enabled = optional_bool(respawn_json, "enabled", rule.respawn.enabled);
    rule.respawn.cooldown_ticks = optional_u32(respawn_json, "cooldownTicks", rule.respawn.cooldown_ticks);
    rule.respawn.invulnerable_ticks = optional_u32(respawn_json, "invulnerableTicks", rule.respawn.invulnerable_ticks);
    rule.respawn.spawn_points = optional_spawn_points(respawn_json);
  }

  return rule;
}

const nlohmann::json& required_units_array(const nlohmann::json& data) {
  if (!data.contains("units") || !data.at("units").is_array()) {
    throw std::runtime_error("Expected units array");
  }
  return data.at("units");
}

// Optional play-field bounds. When omitted the engine keeps its built-in default
// (see BattleBounds). Shape: {"field": {"min": {x, y}, "max": {x, y}, "shape": ...}}.
std::optional<BattleBounds> optional_field_bounds(const nlohmann::json& data) {
  if (!data.contains("field")) {
    return std::nullopt;
  }
  const auto& field = data.at("field");
  if (!field.is_object()) {
    throw std::runtime_error("Expected object field: field");
  }
  const Vec2 min = required_vec2(field, "min", "field.min");
  const Vec2 max = required_vec2(field, "max", "field.max");
  if (max.x <= min.x || max.y <= min.y) {
    throw std::runtime_error("field.max must be greater than field.min on both axes");
  }
  BattleBounds bounds{
    .min = min,
    .max = max,
    .shape = BattleBoundsShape::Rect,
    .center = Vec2{(min.x + max.x) * 0.5, (min.y + max.y) * 0.5},
    .radius_m = std::min(max.x - min.x, max.y - min.y) * 0.5,
    .vertices = {},
  };
  if (!field.contains("shape")) {
    return bounds;
  }
  const auto& shape = field.at("shape");
  if (!shape.is_object()) {
    throw std::runtime_error("Expected object field: field.shape");
  }
  const std::string type = required_string(shape, "type", "field.shape");
  if (type == "rect") {
    bounds.shape = BattleBoundsShape::Rect;
    return bounds;
  }
  if (type == "circle") {
    bounds.shape = BattleBoundsShape::Circle;
    bounds.center = required_vec2(shape, "center", "field.shape.center");
    bounds.radius_m = required_positive_number(shape, "radiusMeters");
    return bounds;
  }
  if (type == "polygon") {
    if (!shape.contains("vertices") || !shape.at("vertices").is_array()) {
      throw std::runtime_error("Expected array field: field.shape.vertices");
    }
    for (const auto& vertex : shape.at("vertices")) {
      bounds.vertices.push_back(required_inline_vec2(vertex, "field.shape.vertices"));
    }
    if (bounds.vertices.size() < 3) {
      throw std::runtime_error("field.shape.vertices must contain at least three points");
    }
    bounds.shape = BattleBoundsShape::Polygon;
    return bounds;
  }
  throw std::runtime_error("Unknown field.shape.type: " + type);
}

}  // namespace

LoadedBattle load_battle_from_json(const nlohmann::json& data, const std::filesystem::path& base_dir) {
  LoadedBattle loaded;
  loaded.config.battle_id = required_string(data, "battleId");
  loaded.config.seed = required_u32(data, "seed");

  const double tick_rate = required_number(data, "tickRate");
  if (tick_rate <= 0.0) {
    throw std::runtime_error("tickRate must be positive");
  }
  loaded.config.tick_dt_sec = 1.0 / tick_rate;
  loaded.config.tick_limit = required_u32(data, "tickLimit");
  if (const auto field_bounds = optional_field_bounds(data)) {
    loaded.config.bounds = *field_bounds;
  }
  loaded.config.obstacles = optional_obstacles(data);
  loaded.config.rule = optional_rule(data);
  const auto module_catalog = load_module_catalog(base_dir, data);

  loaded.config.units.clear();
  for (const auto& unit : required_units_array(data)) {
    const double spawn_heading_deg = optional_spawn_heading_deg(unit);
    const UnitId unit_id{required_u32(unit, "unitId")};
    loaded.config.units.push_back(UnitSpec{
      .unit_id = unit_id,
      .team_id = optional_u32(unit, "teamId", unit_id.value),
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
    });
  }

  return loaded;
}

LoadedBattle load_battle_from_file(const std::string& path) {
  std::ifstream input(path);
  if (!input) {
    throw std::runtime_error("Failed to open battle config: " + path);
  }

  nlohmann::json data;
  input >> data;
  return load_battle_from_json(data, std::filesystem::path(path).parent_path());
}

LoadedBattle load_battle_from_json_string(const std::string& json) {
  return load_battle_from_json(nlohmann::json::parse(json), {});
}

BattleConfig load_battle_config_from_file(const std::string& path) {
  return load_battle_from_file(path).config;
}

}  // namespace robolocks
