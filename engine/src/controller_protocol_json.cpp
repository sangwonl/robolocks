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

double required_number(const nlohmann::json& object, const char* key) {
  if (!object.contains(key) || !object.at(key).is_number()) {
    throw std::runtime_error(std::string("Expected numeric order field: ") + key);
  }
  return object.at(key).get<double>();
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
        .center_deg = required_number(json, "centerDegrees"),
        .width_deg = required_number(json, "widthDegrees"),
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
