#include <robolocks/controller_protocol_json.hpp>

#include <robolocks/snapshot_json.hpp>

#include <stdexcept>
#include <string>

#include <nlohmann/json.hpp>

namespace robolocks {

namespace {

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
  nlohmann::ordered_json contacts = nlohmann::ordered_json::array();
  for (const auto& contact : observation.contacts.units) {
    contacts.push_back(contact_to_json(contact));
  }
  nlohmann::ordered_json obstacle_contacts = nlohmann::ordered_json::array();
  for (const auto& obstacle : observation.contacts.obstacles) {
    obstacle_contacts.push_back(obstacle_to_json(obstacle));
  }
  nlohmann::ordered_json projectile_contacts = nlohmann::ordered_json::array();
  for (const auto& projectile : observation.contacts.projectiles) {
    projectile_contacts.push_back(projectile_to_json(projectile));
  }
  nlohmann::ordered_json obstacles = nlohmann::ordered_json::array();
  for (const auto& obstacle : observation.obstacles) {
    obstacles.push_back(obstacle_to_json(obstacle));
  }

  return nlohmann::json{
    {"tick", observation.tick},
    {"selfId", observation.self_id.value},
    {"self", unit_snapshot_to_json(observation.self)},
    {"contacts", {
      {"units", std::move(contacts)},
      {"obstacles", std::move(obstacle_contacts)},
      {"projectiles", std::move(projectile_contacts)},
    }},
    {"map", {
      {"obstacles", std::move(obstacles)},
    }},
  };
}

nlohmann::json unit_spec_to_json(const UnitSpec& spec) {
  return nlohmann::json{
    {"unitId", spec.unit_id.value},
    {"teamId", spec.team_id == 0 ? spec.unit_id.value : spec.team_id},
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
