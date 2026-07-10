#include <robolocks/snapshot_json.hpp>

#include <variant>
#include <vector>

#include <nlohmann/json.hpp>

namespace robolocks {

namespace {

nlohmann::ordered_json vec3_to_json(Vec3 vec) {
  return nlohmann::ordered_json{
    {"x", vec.x},
    {"y", vec.y},
    {"z", vec.z},
  };
}

nlohmann::ordered_json body_shape_to_json(
  BodyShapeType type,
  double radius_m,
  double length_m,
  double width_m
) {
  if (type == BodyShapeType::Box) {
    return nlohmann::ordered_json{
      {"type", to_string(type)},
      {"radiusMeters", radius_m},
      {"lengthMeters", length_m},
      {"widthMeters", width_m},
    };
  }

  return nlohmann::ordered_json{
    {"type", to_string(type)},
    {"radiusMeters", radius_m},
  };
}

nlohmann::ordered_json body_shape_spec_to_json(const BodyShapeSpec& shape) {
  return body_shape_to_json(shape.type, shape.radius_m, shape.length_m, shape.width_m);
}

nlohmann::ordered_json mobility_spec_to_json(const MobilitySpec& mobility) {
  return nlohmann::ordered_json{
    {"id", mobility.id},
    {"maxSpeedMetersPerSecond", mobility.max_speed_mps},
    {"maxHullTurnDegreesPerSecond", mobility.max_hull_turn_degps},
  };
}

nlohmann::ordered_json turret_spec_to_json(const TurretSpec& turret) {
  return nlohmann::ordered_json{
    {"id", turret.id},
    {"headingDegrees", turret.heading_deg},
    {"maxTurnDegreesPerSecond", turret.max_turn_degps},
  };
}

nlohmann::ordered_json weapon_spec_to_json(const WeaponSpec& weapon) {
  return nlohmann::ordered_json{
    {"id", weapon.id},
    {"fireMode", to_string(weapon.fire_mode)},
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

nlohmann::ordered_json armor_spec_to_json(const ArmorSpec& armor) {
  return nlohmann::ordered_json{
    {"id", armor.id},
    {"integrity", armor.integrity},
    {"frontMillimeters", armor.front_mm},
    {"sideMillimeters", armor.side_mm},
    {"rearMillimeters", armor.rear_mm},
  };
}

nlohmann::ordered_json body_spec_to_json(const BodySpec& body) {
  return nlohmann::ordered_json{
    {"id", body.id},
    {"massKilograms", body.mass_kg},
    {"shape", body_shape_spec_to_json(body.shape)},
  };
}

nlohmann::ordered_json sensor_spec_to_json(const SensorSpec& sensor) {
  return nlohmann::ordered_json{
    {"id", sensor.id},
    {"rangeMeters", sensor.range_m},
    {"fovDegrees", sensor.fov_deg},
    {"refreshTicks", sensor.refresh_ticks},
  };
}

nlohmann::ordered_json event_payload_to_json(const EventPayload& payload) {
  return nlohmann::ordered_json{
    {"projectileId", payload.projectile_id},
    {"sourceUnitId", payload.source_unit_id.value},
    {"targetUnitId", payload.target_unit_id.value},
    {"sourceTeamId", payload.source_team_id},
    {"targetTeamId", payload.target_team_id},
    {"damageType", payload.damage_type},
    {"armorFacing", payload.armor_facing},
    {"damage", payload.damage},
    {"remainingArmor", payload.remaining_armor},
    {"penetrationMillimeters", payload.penetration_mm},
    {"armorMillimeters", payload.armor_mm},
    {"impactDistanceMeters", payload.impact_distance_m},
    {"blastRadiusMeters", payload.blast_radius_m},
  };
}

nlohmann::ordered_json order_payload_to_json(const Order& order) {
  nlohmann::ordered_json json = nlohmann::ordered_json::object();
  std::visit([&json](const auto& payload) {
    using Payload = std::decay_t<decltype(payload)>;
    if constexpr (std::is_same_v<Payload, MoveToOrder>) {
      json["position"] = vec2_to_json(payload.position);
    } else if constexpr (std::is_same_v<Payload, AimAtOrder>) {
      json["target"] = vec2_to_json(payload.target);
    } else if constexpr (std::is_same_v<Payload, FaceArmorTowardOrder>) {
      json["target"] = vec2_to_json(payload.target);
    } else if constexpr (std::is_same_v<Payload, FireIfSolutionOrder>) {
      json["minHitChance"] = payload.min_hit_chance;
    } else if constexpr (std::is_same_v<Payload, ScanArcOrder>) {
      json["directionDegrees"] = payload.direction_deg;
      json["widthDegrees"] = payload.width_deg;
      json["rangeMeters"] = payload.range_m;
    }
  }, order.payload);
  return json;
}

}  // namespace

nlohmann::ordered_json vec2_to_json(Vec2 vec) {
  return nlohmann::ordered_json{
    {"x", vec.x},
    {"y", vec.y},
  };
}

nlohmann::ordered_json unit_modules_to_json(const UnitModulesSnapshot& modules) {
  return nlohmann::ordered_json{
    {"mobility", mobility_spec_to_json(modules.mobility)},
    {"turret", turret_spec_to_json(modules.turret)},
    {"weapon", weapon_spec_to_json(modules.weapon)},
    {"armor", armor_spec_to_json(modules.armor)},
    {"body", body_spec_to_json(modules.body)},
    {"sensor", sensor_spec_to_json(modules.sensor)},
  };
}

nlohmann::ordered_json unit_snapshot_to_json(const UnitSnapshot& unit) {
  return nlohmann::ordered_json{
    {"unitId", unit.unit_id.value},
    {"teamId", unit.team_id},
    {"name", unit.name},
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
    {"modules", unit_modules_to_json(unit.modules)},
    {"intents", {
      {"mobility", {
        {"active", unit.mobility_intent.active},
        {"target", vec2_to_json(unit.mobility_intent.target)},
        {"remainingMeters", unit.mobility_intent.remaining_m},
        {"ageTicks", unit.mobility_intent.age_ticks},
      }},
      {"turret", {
        {"active", unit.turret_intent.active},
        {"target", vec2_to_json(unit.turret_intent.target)},
        {"errorDegrees", unit.turret_intent.error_deg},
        {"ageTicks", unit.turret_intent.age_ticks},
      }},
      {"hull", {
        {"active", unit.hull_intent.active},
        {"target", vec2_to_json(unit.hull_intent.target)},
        {"errorDegrees", unit.hull_intent.error_deg},
        {"ageTicks", unit.hull_intent.age_ticks},
      }},
      {"weapon", {
        {"active", unit.weapon_intent.active},
        {"minHitChance", unit.weapon_intent.min_hit_chance},
        {"ageTicks", unit.weapon_intent.age_ticks},
      }},
    }},
  };
}

nlohmann::ordered_json contact_to_json(const ContactObservation& contact) {
  return nlohmann::ordered_json{
    {"unitId", contact.unit_id.value},
    {"teamId", contact.team_id},
    {"isEnemy", contact.is_enemy},
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

nlohmann::ordered_json obstacle_to_json(const StaticObstacle& obstacle) {
  return nlohmann::ordered_json{
    {"id", obstacle.id},
    {"position", vec2_to_json(obstacle.position)},
    {"radiusMeters", obstacle.radius_m},
    {"blocksMovement", obstacle.blocks_movement},
    {"blocksLineOfSight", obstacle.blocks_line_of_sight},
  };
}

nlohmann::ordered_json projectile_to_json(const ProjectileSnapshot& projectile) {
  return nlohmann::ordered_json{
    {"projectileId", projectile.projectile_id},
    {"ownerUnitId", projectile.owner_unit_id.value},
    {"previousPosition", vec2_to_json(projectile.previous_position)},
    {"position", vec2_to_json(projectile.position)},
    {"radiusMeters", projectile.radius_m},
    {"previousHeightMeters", projectile.previous_height_m},
    {"heightMeters", projectile.height_m},
  };
}

nlohmann::ordered_json event_to_json(const Event& event) {
  return nlohmann::ordered_json{
    {"tick", event.tick},
    {"unitId", event.unit_id.value},
    {"code", event.code},
    {"message", event.message},
    {"payload", event_payload_to_json(event.payload)},
  };
}

nlohmann::ordered_json action_to_json(UnitId unit_id, const Order& order) {
  nlohmann::ordered_json json{
    {"unitId", unit_id.value},
    {"type", to_string(order.kind)},
    {"channel", to_string(order_channel(order.kind))},
  };
  json.update(order_payload_to_json(order));
  return json;
}

nlohmann::ordered_json rule_state_to_json(const BattleRuleState* rule_state) {
  if (rule_state == nullptr) {
    return nlohmann::ordered_json{
      {"scores", nlohmann::ordered_json::array()},
      {"captureZones", nlohmann::ordered_json::array()},
      {"outcome", {
        {"finished", false},
        {"reason", ""},
        {"winnerUnitId", 0},
        {"winnerTeamId", 0},
      }},
    };
  }

  nlohmann::ordered_json scores = nlohmann::ordered_json::array();
  for (const auto& score : rule_state->scores) {
    scores.push_back(nlohmann::ordered_json{
      {"unitId", score.unit_id.value},
      {"teamId", score.team_id},
      {"kills", score.kills},
      {"deaths", score.deaths},
      {"damageDealt", score.damage_dealt},
    });
  }

  nlohmann::ordered_json capture_zones = nlohmann::ordered_json::array();
  for (const auto& zone : rule_state->capture_zones) {
    capture_zones.push_back(nlohmann::ordered_json{
      {"id", zone.id},
      {"position", vec2_to_json(zone.position)},
      {"radiusMeters", zone.radius_m},
      {"holdTicksRequired", zone.hold_ticks_required},
      {"heldTicks", zone.held_ticks},
      {"ownerUnitId", zone.owner_unit_id.value},
      {"ownerTeamId", zone.owner_team_id},
      {"contested", zone.contested},
    });
  }

  return nlohmann::ordered_json{
    {"scores", std::move(scores)},
    {"captureZones", std::move(capture_zones)},
    {"outcome", {
      {"finished", rule_state->outcome.finished},
      {"reason", rule_state->outcome.reason},
      {"winnerUnitId", rule_state->outcome.winner_unit_id.value},
      {"winnerTeamId", rule_state->outcome.winner_team_id},
    }},
  };
}

nlohmann::ordered_json snapshot_to_json(const WorldSnapshot& snapshot) {
  nlohmann::ordered_json units = nlohmann::ordered_json::array();
  for (const auto& unit : snapshot.units) {
    units.push_back(unit_snapshot_to_json(unit));
  }

  nlohmann::ordered_json projectiles = nlohmann::ordered_json::array();
  for (const auto& projectile : snapshot.projectiles) {
    projectiles.push_back(projectile_to_json(projectile));
  }

  nlohmann::ordered_json field = {
    {"min", {{"x", snapshot.bounds.min.x}, {"y", snapshot.bounds.min.y}}},
    {"max", {{"x", snapshot.bounds.max.x}, {"y", snapshot.bounds.max.y}}},
  };
  if (snapshot.bounds.shape == BattleBoundsShape::Circle) {
    field["shape"] = {
      {"type", "circle"},
      {"center", {{"x", snapshot.bounds.center.x}, {"y", snapshot.bounds.center.y}}},
      {"radiusMeters", snapshot.bounds.radius_m},
    };
  } else if (snapshot.bounds.shape == BattleBoundsShape::Polygon) {
    nlohmann::ordered_json vertices = nlohmann::ordered_json::array();
    for (const auto& vertex : snapshot.bounds.vertices) {
      vertices.push_back({{"x", vertex.x}, {"y", vertex.y}});
    }
    field["shape"] = {
      {"type", "polygon"},
      {"vertices", std::move(vertices)},
    };
  }

  return nlohmann::ordered_json{
    {"tick", snapshot.tick},
    {"field", std::move(field)},
    {"units", std::move(units)},
    {"projectiles", std::move(projectiles)},
    {"events", nlohmann::ordered_json::array()},
    {"actions", nlohmann::ordered_json::array()},
    {"ruleState", rule_state_to_json(nullptr)},
  };
}

nlohmann::ordered_json frame_to_json(
  const WorldSnapshot& snapshot,
  const std::vector<Event>& events,
  const std::vector<UnitOrders>& orders_by_unit,
  const BattleRuleState* rule_state
) {
  auto frame = snapshot_to_json(snapshot);

  auto events_json = nlohmann::ordered_json::array();
  for (const auto& event : events) {
    events_json.push_back(event_to_json(event));
  }
  frame["events"] = std::move(events_json);

  auto actions_json = nlohmann::ordered_json::array();
  for (const auto& unit_orders : orders_by_unit) {
    for (const auto& order : unit_orders.orders) {
      actions_json.push_back(action_to_json(unit_orders.unit_id, order));
    }
  }
  frame["actions"] = std::move(actions_json);

  frame["ruleState"] = rule_state_to_json(rule_state);
  return frame;
}

}  // namespace robolocks
