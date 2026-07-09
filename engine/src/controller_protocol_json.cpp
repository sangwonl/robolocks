#include <robolocks/controller_protocol_json.hpp>

#include <robolocks/json_field.hpp>
#include <robolocks/snapshot_json.hpp>

#include <stdexcept>
#include <string>

#include <nlohmann/json.hpp>

namespace robolocks {

namespace {

constexpr const char* kOrderFieldLabel = "order field";

Order order_from_json(const nlohmann::json& json) {
  const auto type = required_string(json, "type", kOrderFieldLabel);
  const auto kind = order_kind_from_string(type);
  switch (kind) {
    case OrderKind::MoveTo:
      return Order{
        .kind = kind,
        .payload = MoveToOrder{required_vec2(json, "position", kOrderFieldLabel)},
      };
    case OrderKind::AimAt:
      return Order{
        .kind = kind,
        .payload = AimAtOrder{required_vec2(json, "target", kOrderFieldLabel)},
      };
    case OrderKind::FaceArmorToward:
      return Order{
        .kind = kind,
        .payload = FaceArmorTowardOrder{required_vec2(json, "target", kOrderFieldLabel)},
      };
    case OrderKind::FireIfSolution:
      return Order{
        .kind = kind,
        .payload = FireIfSolutionOrder{required_number(json, "minHitChance", kOrderFieldLabel)},
      };
    case OrderKind::ScanArc:
      return Order{
        .kind = kind,
        .payload = ScanArcOrder{
          .direction_deg = required_number(json, "directionDegrees", kOrderFieldLabel),
          .width_deg = required_number(json, "widthDegrees", kOrderFieldLabel),
          .range_m = optional_number(json, "rangeMeters", 0.0, kOrderFieldLabel),
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
