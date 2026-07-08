#include <robolocks/c_api.h>

#include <robolocks/battle_loader.hpp>
#include <robolocks/battle_runner.hpp>
#include <robolocks/controller_protocol_json.hpp>
#include <robolocks/json_callback_bot_controller.hpp>

#include <memory>
#include <stdexcept>
#include <string>
#include <utility>
#include <variant>
#include <vector>

#include <nlohmann/json.hpp>

namespace {

RobolocksJsonBotCallback g_json_bot_callback = nullptr;
RobolocksJsonBotReleaseCallback g_json_bot_release_callback = nullptr;
void* g_json_bot_callback_user_data = nullptr;

struct RobolocksBattleRunner {
  robolocks::BattleRunner runner;
  robolocks::WorldSnapshot snapshot;
  robolocks::StepResult last_result;

  explicit RobolocksBattleRunner(robolocks::BattleRunner battle_runner)
      : runner(std::move(battle_runner)), snapshot(runner.snapshot()) {}
};

RobolocksBattleRunner* as_runner(RobolocksBattleRunnerHandle handle) {
  return static_cast<RobolocksBattleRunner*>(handle);
}

const robolocks::UnitSnapshot* unit_at(RobolocksBattleRunnerHandle handle, size_t unit_index) {
  const auto* runner = as_runner(handle);
  if (runner == nullptr || unit_index >= runner->snapshot.units.size()) {
    return nullptr;
  }
  return &runner->snapshot.units[unit_index];
}

const robolocks::StaticObstacle* obstacle_at(RobolocksBattleRunnerHandle handle, size_t obstacle_index) {
  const auto* runner = as_runner(handle);
  if (runner == nullptr || obstacle_index >= runner->runner.obstacles().size()) {
    return nullptr;
  }
  return &runner->runner.obstacles()[obstacle_index];
}

const robolocks::Event* event_at(RobolocksBattleRunnerHandle handle, size_t event_index) {
  const auto* runner = as_runner(handle);
  if (runner == nullptr || event_index >= runner->last_result.events.size()) {
    return nullptr;
  }
  return &runner->last_result.events[event_index];
}

const robolocks::ProjectileSnapshot* projectile_at(RobolocksBattleRunnerHandle handle, size_t projectile_index) {
  const auto* runner = as_runner(handle);
  if (runner == nullptr || projectile_index >= runner->snapshot.projectiles.size()) {
    return nullptr;
  }
  return &runner->snapshot.projectiles[projectile_index];
}

struct ActionRef {
  robolocks::UnitId unit_id;
  const robolocks::Order* order = nullptr;
};

ActionRef action_at(RobolocksBattleRunnerHandle handle, size_t action_index) {
  const auto* runner = as_runner(handle);
  if (runner == nullptr) {
    return {};
  }

  size_t offset = 0;
  for (const auto& unit_orders : runner->last_result.orders_by_unit) {
    if (action_index < offset + unit_orders.orders.size()) {
      return ActionRef{
        .unit_id = unit_orders.unit_id,
        .order = &unit_orders.orders[action_index - offset],
      };
    }
    offset += unit_orders.orders.size();
  }

  return {};
}

const char* order_kind_name(robolocks::OrderKind kind) {
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

const char* order_channel_name(robolocks::OrderKind kind) {
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

}  // namespace

namespace {

std::string call_registered_json_bot(robolocks::UnitId bot_id, const std::string& observation_json) {
  if (g_json_bot_callback == nullptr) {
    throw std::runtime_error("JSON bot callback is not registered");
  }
  const char* response = g_json_bot_callback(
    bot_id.value,
    observation_json.c_str(),
    g_json_bot_callback_user_data
  );
  if (response == nullptr) {
    throw std::runtime_error("JSON bot callback returned null");
  }
  std::string response_json(response);
  if (g_json_bot_release_callback != nullptr) {
    g_json_bot_release_callback(response, g_json_bot_callback_user_data);
  }
  return response_json;
}

robolocks::BattleRunner runner_from_loaded(robolocks::LoadedBattle& loaded) {
  std::vector<robolocks::ControllerBinding> controllers;
  for (auto& cfg : loaded.controllers) {
    if (cfg.type == "json_callback") {
      controllers.push_back(robolocks::ControllerBinding{
        cfg.unit_id,
        std::make_unique<robolocks::JsonCallbackBotController>(cfg.unit_id, call_registered_json_bot),
      });
    } else {
      throw std::runtime_error("Unsupported controller type: " + cfg.type);
    }
  }
  return robolocks::BattleRunner(std::move(loaded.config), std::move(controllers));
}

}  // namespace

extern "C" {

RobolocksBattleRunnerHandle robolocks_battle_runner_create_from_json(const char* json_config) {
  auto loaded = robolocks::load_battle_from_json_string(json_config);
  return new RobolocksBattleRunner(runner_from_loaded(loaded));
}

void robolocks_battle_runner_set_json_bot_callback(
  RobolocksJsonBotCallback callback,
  RobolocksJsonBotReleaseCallback release_callback,
  void* user_data
) {
  g_json_bot_callback = callback;
  g_json_bot_release_callback = release_callback;
  g_json_bot_callback_user_data = user_data;
}

void robolocks_battle_runner_destroy(RobolocksBattleRunnerHandle handle) {
  delete as_runner(handle);
}

void robolocks_battle_runner_step(RobolocksBattleRunnerHandle handle) {
  auto* runner = as_runner(handle);
  if (runner == nullptr) {
    return;
  }
  runner->last_result = runner->runner.step_once();
  runner->snapshot = runner->last_result.snapshot;
}

void robolocks_battle_runner_run(RobolocksBattleRunnerHandle handle, uint64_t tick_count) {
  auto* runner = as_runner(handle);
  if (runner == nullptr) {
    return;
  }
  for (uint64_t i = 0; i < tick_count; i += 1) {
    runner->last_result = runner->runner.step_once();
  }
  runner->snapshot = runner->runner.snapshot();
}

uint64_t robolocks_battle_runner_tick(RobolocksBattleRunnerHandle handle) {
  const auto* runner = as_runner(handle);
  if (runner == nullptr) {
    return 0;
  }
  return runner->snapshot.tick;
}

size_t robolocks_battle_runner_unit_count(RobolocksBattleRunnerHandle handle) {
  const auto* runner = as_runner(handle);
  if (runner == nullptr) {
    return 0;
  }
  return runner->snapshot.units.size();
}

uint32_t robolocks_battle_runner_unit_id(RobolocksBattleRunnerHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  if (unit == nullptr) {
    return 0;
  }
  return unit->unit_id.value;
}

double robolocks_battle_runner_unit_x(RobolocksBattleRunnerHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  if (unit == nullptr) {
    return 0.0;
  }
  return unit->position.x;
}

double robolocks_battle_runner_unit_y(RobolocksBattleRunnerHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  if (unit == nullptr) {
    return 0.0;
  }
  return unit->position.y;
}

double robolocks_battle_runner_unit_hull_heading(RobolocksBattleRunnerHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  if (unit == nullptr) {
    return 0.0;
  }
  return unit->hull_heading_deg;
}

double robolocks_battle_runner_unit_turret_heading(RobolocksBattleRunnerHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  if (unit == nullptr) {
    return 0.0;
  }
  return unit->turret_heading_deg;
}

double robolocks_battle_runner_unit_armor(RobolocksBattleRunnerHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  if (unit == nullptr) {
    return 0.0;
  }
  return unit->armor_integrity;
}

uint64_t robolocks_battle_runner_unit_weapon_cooldown(
  RobolocksBattleRunnerHandle handle,
  size_t unit_index
) {
  const auto* unit = unit_at(handle, unit_index);
  if (unit == nullptr) {
    return 0;
  }
  return unit->weapon_cooldown_ticks;
}

int robolocks_battle_runner_unit_body_shape_type(RobolocksBattleRunnerHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  if (unit == nullptr) {
    return 0;
  }
  switch (unit->body_shape_type) {
    case robolocks::BodyShapeType::Circle:
      return 0;
    case robolocks::BodyShapeType::Box:
      return 1;
  }
  return 0;
}

double robolocks_battle_runner_unit_body_radius(RobolocksBattleRunnerHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  if (unit == nullptr) {
    return 0.0;
  }
  return unit->body_radius_m;
}

double robolocks_battle_runner_unit_body_length(RobolocksBattleRunnerHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  if (unit == nullptr) {
    return 0.0;
  }
  return unit->body_length_m;
}

double robolocks_battle_runner_unit_body_width(RobolocksBattleRunnerHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  if (unit == nullptr) {
    return 0.0;
  }
  return unit->body_width_m;
}

const char* robolocks_battle_runner_unit_modules_json(RobolocksBattleRunnerHandle handle, size_t unit_index) {
  static thread_local std::string modules_json;
  const auto* unit = unit_at(handle, unit_index);
  modules_json = unit == nullptr ? "{}" : robolocks::unit_modules_to_json(unit->modules).dump();
  return modules_json.c_str();
}

int robolocks_battle_runner_unit_mobility_intent_active(RobolocksBattleRunnerHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  return unit != nullptr && unit->mobility_intent_active ? 1 : 0;
}

double robolocks_battle_runner_unit_mobility_intent_target_x(RobolocksBattleRunnerHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0.0 : unit->mobility_intent_target.x;
}

double robolocks_battle_runner_unit_mobility_intent_target_y(RobolocksBattleRunnerHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0.0 : unit->mobility_intent_target.y;
}

double robolocks_battle_runner_unit_mobility_intent_remaining(
  RobolocksBattleRunnerHandle handle,
  size_t unit_index
) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0.0 : unit->mobility_intent_remaining_m;
}

uint64_t robolocks_battle_runner_unit_mobility_intent_age(
  RobolocksBattleRunnerHandle handle,
  size_t unit_index
) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0 : unit->mobility_intent_age_ticks;
}

int robolocks_battle_runner_unit_turret_intent_active(RobolocksBattleRunnerHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  return unit != nullptr && unit->turret_intent_active ? 1 : 0;
}

double robolocks_battle_runner_unit_turret_intent_target_x(RobolocksBattleRunnerHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0.0 : unit->turret_intent_target.x;
}

double robolocks_battle_runner_unit_turret_intent_target_y(RobolocksBattleRunnerHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0.0 : unit->turret_intent_target.y;
}

double robolocks_battle_runner_unit_turret_intent_error(
  RobolocksBattleRunnerHandle handle,
  size_t unit_index
) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0.0 : unit->turret_intent_error_deg;
}

uint64_t robolocks_battle_runner_unit_turret_intent_age(
  RobolocksBattleRunnerHandle handle,
  size_t unit_index
) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0 : unit->turret_intent_age_ticks;
}

int robolocks_battle_runner_unit_hull_intent_active(RobolocksBattleRunnerHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  return unit != nullptr && unit->hull_intent_active ? 1 : 0;
}

double robolocks_battle_runner_unit_hull_intent_target_x(RobolocksBattleRunnerHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0.0 : unit->hull_intent_target.x;
}

double robolocks_battle_runner_unit_hull_intent_target_y(RobolocksBattleRunnerHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0.0 : unit->hull_intent_target.y;
}

double robolocks_battle_runner_unit_hull_intent_error(RobolocksBattleRunnerHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0.0 : unit->hull_intent_error_deg;
}

uint64_t robolocks_battle_runner_unit_hull_intent_age(
  RobolocksBattleRunnerHandle handle,
  size_t unit_index
) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0 : unit->hull_intent_age_ticks;
}

int robolocks_battle_runner_unit_weapon_intent_active(RobolocksBattleRunnerHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  return unit != nullptr && unit->weapon_intent_active ? 1 : 0;
}

double robolocks_battle_runner_unit_weapon_intent_min_hit_chance(
  RobolocksBattleRunnerHandle handle,
  size_t unit_index
) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0.0 : unit->weapon_intent_min_hit_chance;
}

uint64_t robolocks_battle_runner_unit_weapon_intent_age(
  RobolocksBattleRunnerHandle handle,
  size_t unit_index
) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0 : unit->weapon_intent_age_ticks;
}

size_t robolocks_battle_runner_obstacle_count(RobolocksBattleRunnerHandle handle) {
  const auto* runner = as_runner(handle);
  if (runner == nullptr) {
    return 0;
  }
  return runner->runner.obstacles().size();
}

const char* robolocks_battle_runner_obstacle_id(RobolocksBattleRunnerHandle handle, size_t obstacle_index) {
  const auto* obstacle = obstacle_at(handle, obstacle_index);
  if (obstacle == nullptr) {
    return "";
  }
  return obstacle->id.c_str();
}

double robolocks_battle_runner_obstacle_x(RobolocksBattleRunnerHandle handle, size_t obstacle_index) {
  const auto* obstacle = obstacle_at(handle, obstacle_index);
  if (obstacle == nullptr) {
    return 0.0;
  }
  return obstacle->position.x;
}

double robolocks_battle_runner_obstacle_y(RobolocksBattleRunnerHandle handle, size_t obstacle_index) {
  const auto* obstacle = obstacle_at(handle, obstacle_index);
  if (obstacle == nullptr) {
    return 0.0;
  }
  return obstacle->position.y;
}

double robolocks_battle_runner_obstacle_radius(RobolocksBattleRunnerHandle handle, size_t obstacle_index) {
  const auto* obstacle = obstacle_at(handle, obstacle_index);
  if (obstacle == nullptr) {
    return 0.0;
  }
  return obstacle->radius_m;
}

int robolocks_battle_runner_obstacle_blocks_movement(RobolocksBattleRunnerHandle handle, size_t obstacle_index) {
  const auto* obstacle = obstacle_at(handle, obstacle_index);
  if (obstacle == nullptr) {
    return 0;
  }
  return obstacle->blocks_movement ? 1 : 0;
}

int robolocks_battle_runner_obstacle_blocks_line_of_sight(RobolocksBattleRunnerHandle handle, size_t obstacle_index) {
  const auto* obstacle = obstacle_at(handle, obstacle_index);
  if (obstacle == nullptr) {
    return 0;
  }
  return obstacle->blocks_line_of_sight ? 1 : 0;
}

size_t robolocks_battle_runner_event_count(RobolocksBattleRunnerHandle handle) {
  const auto* runner = as_runner(handle);
  if (runner == nullptr) {
    return 0;
  }
  return runner->last_result.events.size();
}

uint64_t robolocks_battle_runner_event_tick(RobolocksBattleRunnerHandle handle, size_t event_index) {
  const auto* event = event_at(handle, event_index);
  if (event == nullptr) {
    return 0;
  }
  return event->tick;
}

uint32_t robolocks_battle_runner_event_unit_id(RobolocksBattleRunnerHandle handle, size_t event_index) {
  const auto* event = event_at(handle, event_index);
  if (event == nullptr) {
    return 0;
  }
  return event->unit_id.value;
}

const char* robolocks_battle_runner_event_code(RobolocksBattleRunnerHandle handle, size_t event_index) {
  const auto* event = event_at(handle, event_index);
  if (event == nullptr) {
    return "";
  }
  return event->code.c_str();
}

const char* robolocks_battle_runner_event_message(RobolocksBattleRunnerHandle handle, size_t event_index) {
  const auto* event = event_at(handle, event_index);
  if (event == nullptr) {
    return "";
  }
  return event->message.c_str();
}

size_t robolocks_battle_runner_projectile_count(RobolocksBattleRunnerHandle handle) {
  const auto* runner = as_runner(handle);
  if (runner == nullptr) {
    return 0;
  }
  return runner->snapshot.projectiles.size();
}

uint64_t robolocks_battle_runner_projectile_id(RobolocksBattleRunnerHandle handle, size_t projectile_index) {
  const auto* projectile = projectile_at(handle, projectile_index);
  if (projectile == nullptr) {
    return 0;
  }
  return projectile->projectile_id;
}

uint32_t robolocks_battle_runner_projectile_owner_unit_id(
  RobolocksBattleRunnerHandle handle,
  size_t projectile_index
) {
  const auto* projectile = projectile_at(handle, projectile_index);
  if (projectile == nullptr) {
    return 0;
  }
  return projectile->owner_unit_id.value;
}

double robolocks_battle_runner_projectile_previous_x(RobolocksBattleRunnerHandle handle, size_t projectile_index) {
  const auto* projectile = projectile_at(handle, projectile_index);
  if (projectile == nullptr) {
    return 0.0;
  }
  return projectile->previous_position.x;
}

double robolocks_battle_runner_projectile_previous_y(RobolocksBattleRunnerHandle handle, size_t projectile_index) {
  const auto* projectile = projectile_at(handle, projectile_index);
  if (projectile == nullptr) {
    return 0.0;
  }
  return projectile->previous_position.y;
}

double robolocks_battle_runner_projectile_x(RobolocksBattleRunnerHandle handle, size_t projectile_index) {
  const auto* projectile = projectile_at(handle, projectile_index);
  if (projectile == nullptr) {
    return 0.0;
  }
  return projectile->position.x;
}

double robolocks_battle_runner_projectile_y(RobolocksBattleRunnerHandle handle, size_t projectile_index) {
  const auto* projectile = projectile_at(handle, projectile_index);
  if (projectile == nullptr) {
    return 0.0;
  }
  return projectile->position.y;
}

double robolocks_battle_runner_projectile_radius(RobolocksBattleRunnerHandle handle, size_t projectile_index) {
  const auto* projectile = projectile_at(handle, projectile_index);
  if (projectile == nullptr) {
    return 0.0;
  }
  return projectile->radius_m;
}

double robolocks_battle_runner_projectile_previous_height(
  RobolocksBattleRunnerHandle handle,
  size_t projectile_index
) {
  const auto* projectile = projectile_at(handle, projectile_index);
  if (projectile == nullptr) {
    return 0.0;
  }
  return projectile->previous_height_m;
}

double robolocks_battle_runner_projectile_height(RobolocksBattleRunnerHandle handle, size_t projectile_index) {
  const auto* projectile = projectile_at(handle, projectile_index);
  if (projectile == nullptr) {
    return 0.0;
  }
  return projectile->height_m;
}

size_t robolocks_battle_runner_action_count(RobolocksBattleRunnerHandle handle) {
  const auto* runner = as_runner(handle);
  if (runner == nullptr) {
    return 0;
  }

  size_t count = 0;
  for (const auto& unit_orders : runner->last_result.orders_by_unit) {
    count += unit_orders.orders.size();
  }
  return count;
}

uint32_t robolocks_battle_runner_action_unit_id(RobolocksBattleRunnerHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  if (action.order == nullptr) {
    return 0;
  }
  return action.unit_id.value;
}

const char* robolocks_battle_runner_action_type(RobolocksBattleRunnerHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  if (action.order == nullptr) {
    return "";
  }
  return order_kind_name(action.order->kind);
}

const char* robolocks_battle_runner_action_channel(RobolocksBattleRunnerHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  if (action.order == nullptr) {
    return "";
  }
  return order_channel_name(action.order->kind);
}

int robolocks_battle_runner_action_has_position(RobolocksBattleRunnerHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  return action.order != nullptr
    && std::holds_alternative<robolocks::MoveToOrder>(action.order->payload)
    ? 1
    : 0;
}

double robolocks_battle_runner_action_position_x(RobolocksBattleRunnerHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  if (action.order == nullptr) {
    return 0.0;
  }
  const auto* payload = std::get_if<robolocks::MoveToOrder>(&action.order->payload);
  return payload == nullptr ? 0.0 : payload->position.x;
}

double robolocks_battle_runner_action_position_y(RobolocksBattleRunnerHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  if (action.order == nullptr) {
    return 0.0;
  }
  const auto* payload = std::get_if<robolocks::MoveToOrder>(&action.order->payload);
  return payload == nullptr ? 0.0 : payload->position.y;
}

int robolocks_battle_runner_action_has_target(RobolocksBattleRunnerHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  if (action.order == nullptr) {
    return 0;
  }
  return std::holds_alternative<robolocks::AimAtOrder>(action.order->payload)
      || std::holds_alternative<robolocks::FaceArmorTowardOrder>(action.order->payload)
    ? 1
    : 0;
}

double robolocks_battle_runner_action_target_x(RobolocksBattleRunnerHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  if (action.order == nullptr) {
    return 0.0;
  }
  if (const auto* payload = std::get_if<robolocks::AimAtOrder>(&action.order->payload)) {
    return payload->target.x;
  }
  if (const auto* payload = std::get_if<robolocks::FaceArmorTowardOrder>(&action.order->payload)) {
    return payload->target.x;
  }
  return 0.0;
}

double robolocks_battle_runner_action_target_y(RobolocksBattleRunnerHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  if (action.order == nullptr) {
    return 0.0;
  }
  if (const auto* payload = std::get_if<robolocks::AimAtOrder>(&action.order->payload)) {
    return payload->target.y;
  }
  if (const auto* payload = std::get_if<robolocks::FaceArmorTowardOrder>(&action.order->payload)) {
    return payload->target.y;
  }
  return 0.0;
}

int robolocks_battle_runner_action_has_min_hit_chance(RobolocksBattleRunnerHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  return action.order != nullptr
    && std::holds_alternative<robolocks::FireIfSolutionOrder>(action.order->payload)
    ? 1
    : 0;
}

double robolocks_battle_runner_action_min_hit_chance(RobolocksBattleRunnerHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  if (action.order == nullptr) {
    return 0.0;
  }
  const auto* payload = std::get_if<robolocks::FireIfSolutionOrder>(&action.order->payload);
  return payload == nullptr ? 0.0 : payload->min_hit_chance;
}

int robolocks_battle_runner_action_has_scan_arc(RobolocksBattleRunnerHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  return action.order != nullptr
    && std::holds_alternative<robolocks::ScanArcOrder>(action.order->payload)
    ? 1
    : 0;
}

double robolocks_battle_runner_action_direction(RobolocksBattleRunnerHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  if (action.order == nullptr) {
    return 0.0;
  }
  const auto* payload = std::get_if<robolocks::ScanArcOrder>(&action.order->payload);
  return payload == nullptr ? 0.0 : payload->direction_deg;
}

double robolocks_battle_runner_action_width(RobolocksBattleRunnerHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  if (action.order == nullptr) {
    return 0.0;
  }
  const auto* payload = std::get_if<robolocks::ScanArcOrder>(&action.order->payload);
  return payload == nullptr ? 0.0 : payload->width_deg;
}

int robolocks_battle_runner_action_has_range(RobolocksBattleRunnerHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  if (action.order == nullptr) {
    return 0;
  }
  const auto* payload = std::get_if<robolocks::ScanArcOrder>(&action.order->payload);
  return payload != nullptr && payload->range_m > 0.0 ? 1 : 0;
}

double robolocks_battle_runner_action_range(RobolocksBattleRunnerHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  if (action.order == nullptr) {
    return 0.0;
  }
  const auto* payload = std::get_if<robolocks::ScanArcOrder>(&action.order->payload);
  return payload == nullptr ? 0.0 : payload->range_m;
}

}
