#include <robolocks/battle_loader.hpp>
#include <robolocks/battle_runner.hpp>
#include <robolocks/controller_factory.hpp>
#include <robolocks/snapshot.hpp>

#include <charconv>
#include <cstdint>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <optional>
#include <string>
#include <string_view>
#include <type_traits>
#include <utility>
#include <vector>
#include <variant>

namespace {

struct CliOptions {
  std::optional<std::string> battle_path;
  std::optional<std::string> replay_out_path;
  robolocks::Tick ticks = 120;
  double tick_rate = 30.0;
  bool stream_json = false;
};

void print_usage(std::ostream& out) {
  out << "usage: robolocks run --battle path [--ticks N] [--stream-json] [--replay-out path]\n";
}

bool parse_tick_count(std::string_view text, robolocks::Tick& out) {
  const auto* begin = text.data();
  const auto* end = begin + text.size();
  std::uint64_t parsed = 0;
  const auto result = std::from_chars(begin, end, parsed);
  if (result.ec != std::errc{} || result.ptr != end) {
    return false;
  }
  out = parsed;
  return true;
}

bool parse_options(int argc, char** argv, CliOptions& options) {
  if (argc < 2 || std::string_view(argv[1]) != "run") {
    return false;
  }

  for (int i = 2; i < argc; i += 1) {
    const std::string_view arg(argv[i]);
    if (arg == "--battle" && i + 1 < argc) {
      options.battle_path = argv[++i];
      continue;
    }
    if (arg == "--ticks" && i + 1 < argc) {
      if (!parse_tick_count(argv[++i], options.ticks)) {
        return false;
      }
      continue;
    }
    if (arg == "--stream-json") {
      options.stream_json = true;
      continue;
    }
    if (arg == "--replay-out" && i + 1 < argc) {
      options.replay_out_path = argv[++i];
      continue;
    }
    return false;
  }

  return options.battle_path.has_value();
}

void print_body_shape_json(const robolocks::UnitSnapshot& unit, std::ostream& out);
void print_intents_json(const robolocks::UnitSnapshot& unit, std::ostream& out);
void print_modules_json(const robolocks::UnitSnapshot& unit, std::ostream& out);
void print_vec_json(const robolocks::Vec2& vec, std::ostream& out);
void print_vec3_json(const robolocks::Vec3& vec, std::ostream& out);
void print_projectiles_json_compact(const std::vector<robolocks::ProjectileSnapshot>& projectiles, std::ostream& out);
void print_event_payload_json_compact(const robolocks::EventPayload& payload, std::ostream& out);

void print_snapshot_json(const robolocks::WorldSnapshot& snapshot, std::ostream& out) {
  out << std::setprecision(15);
  out << "{\n";
  out << "  \"tick\": " << snapshot.tick << ",\n";
  out << "  \"units\": [\n";
  for (std::size_t i = 0; i < snapshot.units.size(); i += 1) {
    const auto& unit = snapshot.units[i];
    out << "    {";
    out << "\"unitId\": " << unit.unit_id.value << ", ";
    out << "\"position\": {\"x\": " << unit.position.x << ", \"y\": " << unit.position.y << "}, ";
    out << "\"hullHeadingDegrees\": " << unit.hull_heading_deg << ", ";
    out << "\"turretHeadingDegrees\": " << unit.turret_heading_deg << ", ";
    out << "\"armorIntegrity\": " << unit.armor_integrity << ", ";
    out << "\"bodyShape\": ";
    print_body_shape_json(unit, out);
    out << ", \"modules\": ";
    print_modules_json(unit, out);
    out << ", \"intents\": ";
    print_intents_json(unit, out);
    out << "}";
    if (i + 1 < snapshot.units.size()) {
      out << ",";
    }
    out << "\n";
  }
  out << "  ],\n";
  out << "  \"projectiles\": ";
  print_projectiles_json_compact(snapshot.projectiles, out);
  out << "\n";
  out << "}\n";
}

void print_events_json_compact(const std::vector<robolocks::Event>& events, std::ostream& out) {
  out << "[";
  for (std::size_t i = 0; i < events.size(); i += 1) {
    const auto& event = events[i];
    out << "{";
    out << "\"tick\":" << event.tick << ",";
    out << "\"unitId\":" << event.unit_id.value << ",";
    out << "\"code\":\"" << event.code << "\",";
    out << "\"message\":\"" << event.message << "\",";
    out << "\"payload\":";
    print_event_payload_json_compact(event.payload, out);
    out << "}";
    if (i + 1 < events.size()) {
      out << ",";
    }
  }
  out << "]";
}

void print_event_payload_json_compact(const robolocks::EventPayload& payload, std::ostream& out) {
  out << "{";
  out << "\"projectileId\":" << payload.projectile_id << ",";
  out << "\"damageType\":\"" << payload.damage_type << "\",";
  out << "\"armorFacing\":\"" << payload.armor_facing << "\",";
  out << "\"damage\":" << payload.damage << ",";
  out << "\"remainingArmor\":" << payload.remaining_armor << ",";
  out << "\"penetrationMillimeters\":" << payload.penetration_mm << ",";
  out << "\"armorMillimeters\":" << payload.armor_mm << ",";
  out << "\"impactDistanceMeters\":" << payload.impact_distance_m << ",";
  out << "\"blastRadiusMeters\":" << payload.blast_radius_m;
  out << "}";
}

std::string order_kind_name(robolocks::OrderKind kind) {
  switch (kind) {
    case robolocks::OrderKind::MoveTo:
      return "moveTo";
    case robolocks::OrderKind::AimAt:
      return "aimAt";
    case robolocks::OrderKind::FireIfSolution:
      return "fireIfSolution";
    case robolocks::OrderKind::ScanArc:
      return "scanArc";
    case robolocks::OrderKind::FaceArmorToward:
      return "faceArmorToward";
  }
  return "unknown";
}

std::string order_channel_name(robolocks::OrderKind kind) {
  switch (robolocks::order_channel(kind)) {
    case robolocks::OrderChannel::Mobility:
      return "mobility";
    case robolocks::OrderChannel::Turret:
      return "turret";
    case robolocks::OrderChannel::Weapon:
      return "weapon";
    case robolocks::OrderChannel::Sensor:
      return "sensor";
    case robolocks::OrderChannel::Hull:
      return "hull";
  }
  return "unknown";
}

void print_vec_json(const robolocks::Vec2& vec, std::ostream& out) {
  out << "{\"x\":" << vec.x << ",\"y\":" << vec.y << "}";
}

void print_vec3_json(const robolocks::Vec3& vec, std::ostream& out) {
  out << "{\"x\":" << vec.x << ",\"y\":" << vec.y << ",\"z\":" << vec.z << "}";
}

const char* fire_mode_json(robolocks::WeaponFireMode mode) {
  switch (mode) {
    case robolocks::WeaponFireMode::Direct:
      return "direct";
    case robolocks::WeaponFireMode::Ballistic:
      return "ballistic";
  }
  return "direct";
}

void print_body_shape_json(const robolocks::UnitSnapshot& unit, std::ostream& out) {
  out << "{";
  if (unit.body_shape_type == robolocks::BodyShapeType::Box) {
    out << "\"type\":\"box\",";
    out << "\"radiusMeters\":" << unit.body_radius_m << ",";
    out << "\"lengthMeters\":" << unit.body_length_m << ",";
    out << "\"widthMeters\":" << unit.body_width_m;
  } else {
    out << "\"type\":\"circle\",";
    out << "\"radiusMeters\":" << unit.body_radius_m;
  }
  out << "}";
}

void print_intent_target_json(const robolocks::Vec2& target, std::ostream& out) {
  out << "{\"x\":" << target.x << ",\"y\":" << target.y << "}";
}

void print_modules_json(const robolocks::UnitSnapshot& unit, std::ostream& out) {
  out << "{";
  out << "\"mobility\":{";
  out << "\"id\":\"" << unit.modules.mobility.id << "\",";
  out << "\"maxSpeedMetersPerSecond\":" << unit.modules.mobility.max_speed_mps << ",";
  out << "\"maxHullTurnDegreesPerSecond\":" << unit.modules.mobility.max_hull_turn_degps;
  out << "},";
  out << "\"turret\":{";
  out << "\"id\":\"" << unit.modules.turret.id << "\",";
  out << "\"maxTurnDegreesPerSecond\":" << unit.modules.turret.max_turn_degps;
  out << "},";
  out << "\"weapon\":{";
  out << "\"id\":\"" << unit.modules.weapon.id << "\",";
  out << "\"fireMode\":\"" << fire_mode_json(unit.modules.weapon.fire_mode) << "\",";
  out << "\"damage\":" << unit.modules.weapon.damage << ",";
  out << "\"penetrationMillimeters\":" << unit.modules.weapon.penetration_mm << ",";
  out << "\"rangeMeters\":" << unit.modules.weapon.range_m << ",";
  out << "\"muzzleVelocityMetersPerSecond\":" << unit.modules.weapon.muzzle_velocity_mps << ",";
  out << "\"muzzleOffsetMeters\":";
  print_vec3_json(unit.modules.weapon.muzzle_offset_m, out);
  out << ",";
  out << "\"launchAngleDegrees\":" << unit.modules.weapon.launch_angle_deg << ",";
  out << "\"gravityMetersPerSecondSquared\":" << unit.modules.weapon.gravity_mps2 << ",";
  out << "\"blastRadiusMeters\":" << unit.modules.weapon.blast_radius_m << ",";
  out << "\"projectileRadiusMeters\":" << unit.modules.weapon.projectile_radius_m << ",";
  out << "\"aimToleranceDegrees\":" << unit.modules.weapon.aim_tolerance_deg << ",";
  out << "\"reloadTicks\":" << unit.modules.weapon.reload_ticks;
  out << "},";
  out << "\"armor\":{";
  out << "\"id\":\"" << unit.modules.armor.id << "\",";
  out << "\"integrity\":" << unit.modules.armor.integrity << ",";
  out << "\"frontMillimeters\":" << unit.modules.armor.front_mm << ",";
  out << "\"sideMillimeters\":" << unit.modules.armor.side_mm << ",";
  out << "\"rearMillimeters\":" << unit.modules.armor.rear_mm;
  out << "},";
  out << "\"body\":{";
  out << "\"id\":\"" << unit.modules.body.id << "\",";
  out << "\"massKilograms\":" << unit.modules.body.mass_kg << ",";
  out << "\"shape\":";
  print_body_shape_json(unit, out);
  out << "},";
  out << "\"sensor\":{";
  out << "\"id\":\"" << unit.modules.sensor.id << "\",";
  out << "\"rangeMeters\":" << unit.modules.sensor.range_m << ",";
  out << "\"fovDegrees\":" << unit.modules.sensor.fov_deg << ",";
  out << "\"refreshTicks\":" << unit.modules.sensor.refresh_ticks;
  out << "}";
  out << "}";
}

void print_intents_json(const robolocks::UnitSnapshot& unit, std::ostream& out) {
  out << "{";
  out << "\"mobility\":{";
  out << "\"active\":" << (unit.mobility_intent_active ? "true" : "false") << ",";
  out << "\"target\":";
  print_intent_target_json(unit.mobility_intent_target, out);
  out << ",\"remainingMeters\":" << unit.mobility_intent_remaining_m << ",";
  out << "\"ageTicks\":" << unit.mobility_intent_age_ticks;
  out << "},";
  out << "\"turret\":{";
  out << "\"active\":" << (unit.turret_intent_active ? "true" : "false") << ",";
  out << "\"target\":";
  print_intent_target_json(unit.turret_intent_target, out);
  out << ",\"errorDegrees\":" << unit.turret_intent_error_deg << ",";
  out << "\"ageTicks\":" << unit.turret_intent_age_ticks;
  out << "},";
  out << "\"hull\":{";
  out << "\"active\":" << (unit.hull_intent_active ? "true" : "false") << ",";
  out << "\"target\":";
  print_intent_target_json(unit.hull_intent_target, out);
  out << ",\"errorDegrees\":" << unit.hull_intent_error_deg << ",";
  out << "\"ageTicks\":" << unit.hull_intent_age_ticks;
  out << "},";
  out << "\"weapon\":{";
  out << "\"active\":" << (unit.weapon_intent_active ? "true" : "false") << ",";
  out << "\"minHitChance\":" << unit.weapon_intent_min_hit_chance << ",";
  out << "\"ageTicks\":" << unit.weapon_intent_age_ticks;
  out << "}";
  out << "}";
}

void print_order_payload_json(const robolocks::Order& order, std::ostream& out) {
  std::visit([&out](const auto& payload) {
    using Payload = std::decay_t<decltype(payload)>;
    if constexpr (std::is_same_v<Payload, robolocks::MoveToOrder>) {
      out << "\"position\":";
      print_vec_json(payload.position, out);
    } else if constexpr (std::is_same_v<Payload, robolocks::AimAtOrder>) {
      out << "\"target\":";
      print_vec_json(payload.target, out);
    } else if constexpr (std::is_same_v<Payload, robolocks::FaceArmorTowardOrder>) {
      out << "\"target\":";
      print_vec_json(payload.target, out);
    } else if constexpr (std::is_same_v<Payload, robolocks::FireIfSolutionOrder>) {
      out << "\"minHitChance\":" << payload.min_hit_chance;
    } else if constexpr (std::is_same_v<Payload, robolocks::ScanArcOrder>) {
      out << "\"directionDegrees\":" << payload.direction_deg << ",\"widthDegrees\":" << payload.width_deg;
    }
  }, order.payload);
}

void print_actions_json_compact(const std::vector<robolocks::UnitOrders>& orders_by_unit, std::ostream& out) {
  out << "[";
  bool first = true;
  for (const auto& unit_orders : orders_by_unit) {
    for (const auto& order : unit_orders.orders) {
      if (!first) {
        out << ",";
      }
      first = false;
      out << "{";
      out << "\"unitId\":" << unit_orders.unit_id.value << ",";
      out << "\"type\":\"" << order_kind_name(order.kind) << "\",";
      out << "\"channel\":\"" << order_channel_name(order.kind) << "\",";
      print_order_payload_json(order, out);
      out << "}";
    }
  }
  out << "]";
}

void print_projectiles_json_compact(const std::vector<robolocks::ProjectileSnapshot>& projectiles, std::ostream& out) {
  out << "[";
  for (std::size_t i = 0; i < projectiles.size(); i += 1) {
    const auto& projectile = projectiles[i];
    out << "{";
    out << "\"projectileId\":" << projectile.projectile_id << ",";
    out << "\"ownerUnitId\":" << projectile.owner_unit_id.value << ",";
    out << "\"previousPosition\":";
    print_vec_json(projectile.previous_position, out);
    out << ",\"position\":";
    print_vec_json(projectile.position, out);
    out << ",\"radiusMeters\":" << projectile.radius_m << ",";
    out << "\"previousHeightMeters\":" << projectile.previous_height_m << ",";
    out << "\"heightMeters\":" << projectile.height_m;
    out << "}";
    if (i + 1 < projectiles.size()) {
      out << ",";
    }
  }
  out << "]";
}

void print_snapshot_json_compact(
  const robolocks::WorldSnapshot& snapshot,
  std::ostream& out,
  const std::vector<robolocks::Event>& events = {},
  const std::vector<robolocks::UnitOrders>& orders_by_unit = {}
) {
  out << std::setprecision(15);
  out << "{\"tick\":" << snapshot.tick << ",\"units\":[";
  for (std::size_t i = 0; i < snapshot.units.size(); i += 1) {
    const auto& unit = snapshot.units[i];
    out << "{";
    out << "\"unitId\":" << unit.unit_id.value << ",";
    out << "\"position\":{\"x\":" << unit.position.x << ",\"y\":" << unit.position.y << "},";
    out << "\"hullHeadingDegrees\":" << unit.hull_heading_deg << ",";
    out << "\"turretHeadingDegrees\":" << unit.turret_heading_deg << ",";
    out << "\"armorIntegrity\":" << unit.armor_integrity << ",";
    out << "\"weaponCooldownTicks\":" << unit.weapon_cooldown_ticks << ",";
    out << "\"bodyShape\":";
    print_body_shape_json(unit, out);
    out << ",\"modules\":";
    print_modules_json(unit, out);
    out << ",\"intents\":";
    print_intents_json(unit, out);
    out << "}";
    if (i + 1 < snapshot.units.size()) {
      out << ",";
    }
  }
  out << "],\"projectiles\":";
  print_projectiles_json_compact(snapshot.projectiles, out);
  out << ",\"events\":";
  print_events_json_compact(events, out);
  out << ",\"actions\":";
  print_actions_json_compact(orders_by_unit, out);
  out << "}";
}

void print_obstacles_json_compact(const std::vector<robolocks::StaticObstacle>& obstacles, std::ostream& out) {
  out << "[";
  for (std::size_t i = 0; i < obstacles.size(); i += 1) {
    const auto& obstacle = obstacles[i];
    out << "{";
    out << "\"id\":\"" << obstacle.id << "\",";
    out << "\"position\":{\"x\":" << obstacle.position.x << ",\"y\":" << obstacle.position.y << "},";
    out << "\"radiusMeters\":" << obstacle.radius_m << ",";
    out << "\"blocksMovement\":" << (obstacle.blocks_movement ? "true" : "false") << ",";
    out << "\"blocksLineOfSight\":" << (obstacle.blocks_line_of_sight ? "true" : "false");
    out << "}";
    if (i + 1 < obstacles.size()) {
      out << ",";
    }
  }
  out << "]";
}

void print_stream_frame(std::string_view type, const robolocks::WorldSnapshot& snapshot, std::ostream& out) {
  out << "{\"type\":\"" << type << "\",\"frame\":";
  print_snapshot_json_compact(snapshot, out);
  out << "}\n";
}

void print_snapshot_stream(robolocks::BattleRunner& runtime, robolocks::Tick ticks, std::ostream& out) {
  if (ticks == 0) {
    print_stream_frame("battleComplete", runtime.snapshot(), out);
    return;
  }

  print_stream_frame("battleFrame", runtime.snapshot(), out);
  for (robolocks::Tick tick = 0; tick < ticks; tick += 1) {
    const auto result = runtime.step_once();
    const auto type = result.snapshot.tick == ticks ? "battleComplete" : "battleFrame";
    print_stream_frame(type, result.snapshot, out);
  }
}

void write_replay_json(
  robolocks::BattleRunner& runtime,
  robolocks::Tick ticks,
  double tick_rate,
  const std::vector<robolocks::StaticObstacle>& obstacles,
  const std::string& path
) {
  std::ofstream out(path);
  if (!out) {
    throw std::runtime_error("Failed to open replay output: " + path);
  }

  out << "{\"type\":\"robolocks.replay.v1\",";
  out << "\"tickRate\":" << tick_rate << ",";
  out << "\"obstacles\":";
  print_obstacles_json_compact(obstacles, out);
  out << ",";
  out << "\"frames\":[";
  print_snapshot_json_compact(runtime.snapshot(), out);
  for (robolocks::Tick tick = 0; tick < ticks; tick += 1) {
    const auto result = runtime.step_once();
    out << ",";
    print_snapshot_json_compact(result.snapshot, out, result.events, result.orders_by_unit);
  }
  out << "]}\n";
}

}  // namespace

int main(int argc, char** argv) {
  CliOptions options;
  if (!parse_options(argc, argv, options)) {
    print_usage(std::cerr);
    return 2;
  }

  std::vector<robolocks::StaticObstacle> replay_obstacles;
  auto runtime = [&options, &replay_obstacles]() {
    auto loaded = robolocks::load_battle_from_file(*options.battle_path);
    options.tick_rate = 1.0 / loaded.config.tick_dt_sec;
    replay_obstacles = loaded.config.obstacles;
    return robolocks::BattleRunner(
      std::move(loaded.config),
      robolocks::create_controllers(loaded.controllers)
    );
  }();
  try {
    if (options.replay_out_path.has_value()) {
      write_replay_json(runtime, options.ticks, options.tick_rate, replay_obstacles, *options.replay_out_path);
    } else if (options.stream_json) {
    print_snapshot_stream(runtime, options.ticks, std::cout);
    } else {
      const auto snapshot = runtime.run_ticks(options.ticks);
      print_snapshot_json(snapshot, std::cout);
    }
  } catch (const std::exception& error) {
    std::cerr << error.what() << "\n";
    return 1;
  }
  return 0;
}
