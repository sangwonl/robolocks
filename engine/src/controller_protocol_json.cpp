#include <robolocks/controller_protocol_json.hpp>

#include <stdexcept>
#include <string>

#include <nlohmann/json.hpp>

namespace robolocks {

namespace {

nlohmann::json vec2_to_json(Vec2 vec) {
  return nlohmann::json{
    {"x", vec.x},
    {"y", vec.y},
  };
}

nlohmann::json body_shape_to_json(
  BodyShapeType type,
  double radius_m,
  double length_m,
  double width_m
) {
  if (type == BodyShapeType::Box) {
    return nlohmann::json{
      {"type", "box"},
      {"radiusMeters", radius_m},
      {"lengthMeters", length_m},
      {"widthMeters", width_m},
    };
  }

  return nlohmann::json{
    {"type", "circle"},
    {"radiusMeters", radius_m},
  };
}

nlohmann::json unit_snapshot_to_json(const UnitSnapshot& unit) {
  return nlohmann::json{
    {"unitId", unit.unit_id.value},
    {"position", vec2_to_json(unit.position)},
    {"hullHeadingDegrees", unit.hull_heading_deg},
    {"turretHeadingDegrees", unit.turret_heading_deg},
    {"armorIntegrity", unit.armor_integrity},
    {"weaponCooldownTicks", unit.weapon_cooldown_ticks},
    {"bodyShape", body_shape_to_json(
      unit.body_shape_type,
      unit.body_radius_m,
      unit.body_length_m,
      unit.body_width_m
    )},
    {"intents", {
      {"mobility", {
        {"active", unit.mobility_intent_active},
        {"target", vec2_to_json(unit.mobility_intent_target)},
        {"remainingMeters", unit.mobility_intent_remaining_m},
        {"ageTicks", unit.mobility_intent_age_ticks},
      }},
      {"turret", {
        {"active", unit.turret_intent_active},
        {"target", vec2_to_json(unit.turret_intent_target)},
        {"errorDegrees", unit.turret_intent_error_deg},
        {"ageTicks", unit.turret_intent_age_ticks},
      }},
      {"hull", {
        {"active", unit.hull_intent_active},
        {"target", vec2_to_json(unit.hull_intent_target)},
        {"errorDegrees", unit.hull_intent_error_deg},
        {"ageTicks", unit.hull_intent_age_ticks},
      }},
      {"weapon", {
        {"active", unit.weapon_intent_active},
        {"minHitChance", unit.weapon_intent_min_hit_chance},
        {"ageTicks", unit.weapon_intent_age_ticks},
      }},
    }},
  };
}

nlohmann::json contact_to_json(const ContactObservation& contact) {
  return nlohmann::json{
    {"unitId", contact.unit_id.value},
    {"position", vec2_to_json(contact.position)},
    {"hullHeadingDegrees", contact.hull_heading_deg},
    {"turretHeadingDegrees", contact.turret_heading_deg},
    {"armorIntegrity", contact.armor_integrity},
    {"weaponCooldownTicks", contact.weapon_cooldown_ticks},
    {"bodyShape", body_shape_to_json(
      contact.body_shape_type,
      contact.body_radius_m,
      contact.body_length_m,
      contact.body_width_m
    )},
  };
}

nlohmann::json obstacle_to_json(const StaticObstacle& obstacle) {
  return nlohmann::json{
    {"id", obstacle.id},
    {"position", vec2_to_json(obstacle.position)},
    {"radiusMeters", obstacle.radius_m},
    {"blocksMovement", obstacle.blocks_movement},
    {"blocksLineOfSight", obstacle.blocks_line_of_sight},
  };
}

nlohmann::json vec3_to_json(Vec3 vec) {
  return nlohmann::json{
    {"x", vec.x},
    {"y", vec.y},
    {"z", vec.z},
  };
}

std::string fire_mode_to_string(WeaponFireMode mode) {
  switch (mode) {
    case WeaponFireMode::Direct:
      return "direct";
    case WeaponFireMode::Ballistic:
      return "ballistic";
  }
  return "direct";
}

nlohmann::json body_shape_spec_to_json(const BodyShapeSpec& shape) {
  if (shape.type == BodyShapeType::Box) {
    return nlohmann::json{
      {"type", "box"},
      {"radiusMeters", shape.radius_m},
      {"lengthMeters", shape.length_m},
      {"widthMeters", shape.width_m},
    };
  }
  return nlohmann::json{
    {"type", "circle"},
    {"radiusMeters", shape.radius_m},
  };
}

nlohmann::json mobility_spec_to_json(const MobilitySpec& mobility) {
  return nlohmann::json{
    {"id", mobility.id},
    {"maxSpeedMetersPerSecond", mobility.max_speed_mps},
    {"maxHullTurnDegreesPerSecond", mobility.max_hull_turn_degps},
  };
}

nlohmann::json turret_spec_to_json(const TurretSpec& turret) {
  return nlohmann::json{
    {"id", turret.id},
    {"headingDegrees", turret.heading_deg},
    {"maxTurnDegreesPerSecond", turret.max_turn_degps},
  };
}

nlohmann::json weapon_spec_to_json(const WeaponSpec& weapon) {
  return nlohmann::json{
    {"id", weapon.id},
    {"fireMode", fire_mode_to_string(weapon.fire_mode)},
    {"damage", weapon.damage},
    {"penetrationMillimeters", weapon.penetration_mm},
    {"rangeMeters", weapon.range_m},
    {"muzzleVelocityMetersPerSecond", weapon.muzzle_velocity_mps},
    {"muzzleOffsetMeters", vec3_to_json(weapon.muzzle_offset_m)},
    {"launchAngleDegrees", weapon.launch_angle_deg},
    {"gravityMetersPerSecondSquared", weapon.gravity_mps2},
    {"blastRadiusMeters", weapon.blast_radius_m},
    {"projectileRadiusMeters", weapon.projectile_radius_m},
    {"aimToleranceDegrees", weapon.aim_tolerance_deg},
    {"reloadTicks", weapon.reload_ticks},
  };
}

nlohmann::json armor_spec_to_json(const ArmorSpec& armor) {
  return nlohmann::json{
    {"id", armor.id},
    {"integrity", armor.integrity},
    {"frontMillimeters", armor.front_mm},
    {"sideMillimeters", armor.side_mm},
    {"rearMillimeters", armor.rear_mm},
  };
}

nlohmann::json body_spec_to_json(const BodySpec& body) {
  return nlohmann::json{
    {"id", body.id},
    {"massKilograms", body.mass_kg},
    {"shape", body_shape_spec_to_json(body.shape)},
  };
}

nlohmann::json sensor_spec_to_json(const SensorSpec& sensor) {
  return nlohmann::json{
    {"id", sensor.id},
    {"rangeMeters", sensor.range_m},
    {"fovDegrees", sensor.fov_deg},
    {"refreshTicks", sensor.refresh_ticks},
  };
}

double required_number(const nlohmann::json& object, const char* key) {
  if (!object.contains(key) || !object.at(key).is_number()) {
    throw std::runtime_error(std::string("Expected numeric order field: ") + key);
  }
  return object.at(key).get<double>();
}

double optional_number(const nlohmann::json& object, const char* key, double fallback) {
  if (!object.contains(key)) {
    return fallback;
  }
  return required_number(object, key);
}

std::string required_string(const nlohmann::json& object, const char* key) {
  if (!object.contains(key) || !object.at(key).is_string()) {
    throw std::runtime_error(std::string("Expected string order field: ") + key);
  }
  return object.at(key).get<std::string>();
}

Vec2 required_vec2(const nlohmann::json& object, const char* key) {
  if (!object.contains(key) || !object.at(key).is_object()) {
    throw std::runtime_error(std::string("Expected vector order field: ") + key);
  }
  const auto& vec = object.at(key);
  return Vec2{
    .x = required_number(vec, "x"),
    .y = required_number(vec, "y"),
  };
}

Order order_from_json(const nlohmann::json& json) {
  const auto type = required_string(json, "type");
  if (type == "moveTo") {
    return Order{
      .kind = OrderKind::MoveTo,
      .payload = MoveToOrder{required_vec2(json, "position")},
    };
  }
  if (type == "aimAt") {
    return Order{
      .kind = OrderKind::AimAt,
      .payload = AimAtOrder{required_vec2(json, "target")},
    };
  }
  if (type == "faceArmorToward") {
    return Order{
      .kind = OrderKind::FaceArmorToward,
      .payload = FaceArmorTowardOrder{required_vec2(json, "target")},
    };
  }
  if (type == "fireIfSolution") {
    return Order{
      .kind = OrderKind::FireIfSolution,
      .payload = FireIfSolutionOrder{required_number(json, "minHitChance")},
    };
  }
  if (type == "scanArc") {
    return Order{
      .kind = OrderKind::ScanArc,
      .payload = ScanArcOrder{
        .direction_deg = required_number(json, "directionDegrees"),
        .width_deg = required_number(json, "widthDegrees"),
        .range_m = optional_number(json, "rangeMeters", 0.0),
      },
    };
  }
  throw std::runtime_error("Unsupported order type: " + type);
}

}  // namespace

nlohmann::json observation_to_json(const Observation& observation) {
  nlohmann::json contacts = nlohmann::json::array();
  for (const auto& contact : observation.contacts) {
    contacts.push_back(contact_to_json(contact));
  }
  nlohmann::json obstacles = nlohmann::json::array();
  for (const auto& obstacle : observation.obstacles) {
    obstacles.push_back(obstacle_to_json(obstacle));
  }

  return nlohmann::json{
    {"tick", observation.tick},
    {"selfId", observation.self_id.value},
    {"self", unit_snapshot_to_json(observation.self)},
    {"contacts", std::move(contacts)},
    {"map", {
      {"obstacles", std::move(obstacles)},
    }},
  };
}

nlohmann::json unit_spec_to_json(const UnitSpec& spec) {
  return nlohmann::json{
    {"unitId", spec.unit_id.value},
    {"name", spec.name},
    {"transform", {
      {"position", vec2_to_json(spec.transform.position)},
      {"hullHeadingDegrees", spec.transform.hull_heading_deg},
    }},
    {"modules", unit_modules_to_json(UnitModulesSnapshot{
      .mobility = spec.mobility,
      .turret = spec.turret,
      .weapon = spec.weapon,
      .armor = spec.armor,
      .body = spec.body,
      .sensor = spec.sensor,
    })},
  };
}

nlohmann::json unit_modules_to_json(const UnitModulesSnapshot& modules) {
  return nlohmann::json{
    {"mobility", mobility_spec_to_json(modules.mobility)},
    {"turret", turret_spec_to_json(modules.turret)},
    {"weapon", weapon_spec_to_json(modules.weapon)},
    {"armor", armor_spec_to_json(modules.armor)},
    {"body", body_spec_to_json(modules.body)},
    {"sensor", sensor_spec_to_json(modules.sensor)},
  };
}

OrderList orders_from_json(const nlohmann::json& json) {
  if (!json.contains("orders") || !json.at("orders").is_array()) {
    throw std::runtime_error("Expected orders array");
  }

  OrderList orders;
  for (const auto& order_json : json.at("orders")) {
    orders.push_back(order_from_json(order_json));
  }
  return orders;
}

}  // namespace robolocks
