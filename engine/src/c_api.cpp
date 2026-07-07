#include <robolocks/c_api.h>

#include <robolocks/battle_runtime.hpp>

#include <memory>
#include <variant>

namespace {

struct RobolocksBattleRuntime {
  robolocks::BattleRuntime runtime;
  robolocks::WorldSnapshot snapshot;
  robolocks::StepResult last_result;

  explicit RobolocksBattleRuntime(robolocks::BattleRuntime battle_runtime)
      : runtime(std::move(battle_runtime)), snapshot(runtime.snapshot()) {}
};

RobolocksBattleRuntime* as_runtime(RobolocksBattleRuntimeHandle handle) {
  return static_cast<RobolocksBattleRuntime*>(handle);
}

const robolocks::UnitSnapshot* unit_at(RobolocksBattleRuntimeHandle handle, size_t unit_index) {
  const auto* runtime = as_runtime(handle);
  if (runtime == nullptr || unit_index >= runtime->snapshot.units.size()) {
    return nullptr;
  }
  return &runtime->snapshot.units[unit_index];
}

const robolocks::StaticObstacle* obstacle_at(RobolocksBattleRuntimeHandle handle, size_t obstacle_index) {
  const auto* runtime = as_runtime(handle);
  if (runtime == nullptr || obstacle_index >= runtime->runtime.obstacles().size()) {
    return nullptr;
  }
  return &runtime->runtime.obstacles()[obstacle_index];
}

const robolocks::Event* event_at(RobolocksBattleRuntimeHandle handle, size_t event_index) {
  const auto* runtime = as_runtime(handle);
  if (runtime == nullptr || event_index >= runtime->last_result.events.size()) {
    return nullptr;
  }
  return &runtime->last_result.events[event_index];
}

const robolocks::ProjectileSnapshot* projectile_at(RobolocksBattleRuntimeHandle handle, size_t projectile_index) {
  const auto* runtime = as_runtime(handle);
  if (runtime == nullptr || projectile_index >= runtime->snapshot.projectiles.size()) {
    return nullptr;
  }
  return &runtime->snapshot.projectiles[projectile_index];
}

struct ActionRef {
  robolocks::UnitId unit_id;
  const robolocks::Order* order = nullptr;
};

ActionRef action_at(RobolocksBattleRuntimeHandle handle, size_t action_index) {
  const auto* runtime = as_runtime(handle);
  if (runtime == nullptr) {
    return {};
  }

  size_t offset = 0;
  for (const auto& unit_orders : runtime->last_result.orders_by_unit) {
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

extern "C" {

RobolocksBattleRuntimeHandle robolocks_battle_runtime_create_preset_duel(void) {
  return new RobolocksBattleRuntime(robolocks::BattleRuntime::preset_duel());
}

void robolocks_battle_runtime_destroy(RobolocksBattleRuntimeHandle handle) {
  delete as_runtime(handle);
}

void robolocks_battle_runtime_step(RobolocksBattleRuntimeHandle handle) {
  auto* runtime = as_runtime(handle);
  if (runtime == nullptr) {
    return;
  }
  runtime->last_result = runtime->runtime.step_once();
  runtime->snapshot = runtime->last_result.snapshot;
}

void robolocks_battle_runtime_run_ticks(RobolocksBattleRuntimeHandle handle, uint64_t tick_count) {
  auto* runtime = as_runtime(handle);
  if (runtime == nullptr) {
    return;
  }
  for (uint64_t i = 0; i < tick_count; i += 1) {
    runtime->last_result = runtime->runtime.step_once();
  }
  runtime->snapshot = runtime->runtime.snapshot();
}

uint64_t robolocks_battle_runtime_tick(RobolocksBattleRuntimeHandle handle) {
  const auto* runtime = as_runtime(handle);
  if (runtime == nullptr) {
    return 0;
  }
  return runtime->snapshot.tick;
}

size_t robolocks_battle_runtime_unit_count(RobolocksBattleRuntimeHandle handle) {
  const auto* runtime = as_runtime(handle);
  if (runtime == nullptr) {
    return 0;
  }
  return runtime->snapshot.units.size();
}

uint32_t robolocks_battle_runtime_unit_id(RobolocksBattleRuntimeHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  if (unit == nullptr) {
    return 0;
  }
  return unit->unit_id.value;
}

double robolocks_battle_runtime_unit_x(RobolocksBattleRuntimeHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  if (unit == nullptr) {
    return 0.0;
  }
  return unit->position.x;
}

double robolocks_battle_runtime_unit_y(RobolocksBattleRuntimeHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  if (unit == nullptr) {
    return 0.0;
  }
  return unit->position.y;
}

double robolocks_battle_runtime_unit_hull_heading_deg(RobolocksBattleRuntimeHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  if (unit == nullptr) {
    return 0.0;
  }
  return unit->hull_heading_deg;
}

double robolocks_battle_runtime_unit_turret_heading_deg(RobolocksBattleRuntimeHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  if (unit == nullptr) {
    return 0.0;
  }
  return unit->turret_heading_deg;
}

double robolocks_battle_runtime_unit_armor(RobolocksBattleRuntimeHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  if (unit == nullptr) {
    return 0.0;
  }
  return unit->armor_integrity;
}

uint64_t robolocks_battle_runtime_unit_weapon_cooldown_ticks(
  RobolocksBattleRuntimeHandle handle,
  size_t unit_index
) {
  const auto* unit = unit_at(handle, unit_index);
  if (unit == nullptr) {
    return 0;
  }
  return unit->weapon_cooldown_ticks;
}

int robolocks_battle_runtime_unit_body_shape_type(RobolocksBattleRuntimeHandle handle, size_t unit_index) {
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

double robolocks_battle_runtime_unit_body_radius_m(RobolocksBattleRuntimeHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  if (unit == nullptr) {
    return 0.0;
  }
  return unit->body_radius_m;
}

double robolocks_battle_runtime_unit_body_length_m(RobolocksBattleRuntimeHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  if (unit == nullptr) {
    return 0.0;
  }
  return unit->body_length_m;
}

double robolocks_battle_runtime_unit_body_width_m(RobolocksBattleRuntimeHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  if (unit == nullptr) {
    return 0.0;
  }
  return unit->body_width_m;
}

int robolocks_battle_runtime_unit_mobility_intent_active(RobolocksBattleRuntimeHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  return unit != nullptr && unit->mobility_intent_active ? 1 : 0;
}

double robolocks_battle_runtime_unit_mobility_intent_target_x(RobolocksBattleRuntimeHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0.0 : unit->mobility_intent_target.x;
}

double robolocks_battle_runtime_unit_mobility_intent_target_y(RobolocksBattleRuntimeHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0.0 : unit->mobility_intent_target.y;
}

double robolocks_battle_runtime_unit_mobility_intent_remaining_m(
  RobolocksBattleRuntimeHandle handle,
  size_t unit_index
) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0.0 : unit->mobility_intent_remaining_m;
}

uint64_t robolocks_battle_runtime_unit_mobility_intent_age_ticks(
  RobolocksBattleRuntimeHandle handle,
  size_t unit_index
) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0 : unit->mobility_intent_age_ticks;
}

int robolocks_battle_runtime_unit_turret_intent_active(RobolocksBattleRuntimeHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  return unit != nullptr && unit->turret_intent_active ? 1 : 0;
}

double robolocks_battle_runtime_unit_turret_intent_target_x(RobolocksBattleRuntimeHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0.0 : unit->turret_intent_target.x;
}

double robolocks_battle_runtime_unit_turret_intent_target_y(RobolocksBattleRuntimeHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0.0 : unit->turret_intent_target.y;
}

double robolocks_battle_runtime_unit_turret_intent_error_deg(
  RobolocksBattleRuntimeHandle handle,
  size_t unit_index
) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0.0 : unit->turret_intent_error_deg;
}

uint64_t robolocks_battle_runtime_unit_turret_intent_age_ticks(
  RobolocksBattleRuntimeHandle handle,
  size_t unit_index
) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0 : unit->turret_intent_age_ticks;
}

int robolocks_battle_runtime_unit_hull_intent_active(RobolocksBattleRuntimeHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  return unit != nullptr && unit->hull_intent_active ? 1 : 0;
}

double robolocks_battle_runtime_unit_hull_intent_target_x(RobolocksBattleRuntimeHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0.0 : unit->hull_intent_target.x;
}

double robolocks_battle_runtime_unit_hull_intent_target_y(RobolocksBattleRuntimeHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0.0 : unit->hull_intent_target.y;
}

double robolocks_battle_runtime_unit_hull_intent_error_deg(RobolocksBattleRuntimeHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0.0 : unit->hull_intent_error_deg;
}

uint64_t robolocks_battle_runtime_unit_hull_intent_age_ticks(
  RobolocksBattleRuntimeHandle handle,
  size_t unit_index
) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0 : unit->hull_intent_age_ticks;
}

int robolocks_battle_runtime_unit_weapon_intent_active(RobolocksBattleRuntimeHandle handle, size_t unit_index) {
  const auto* unit = unit_at(handle, unit_index);
  return unit != nullptr && unit->weapon_intent_active ? 1 : 0;
}

double robolocks_battle_runtime_unit_weapon_intent_min_hit_chance(
  RobolocksBattleRuntimeHandle handle,
  size_t unit_index
) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0.0 : unit->weapon_intent_min_hit_chance;
}

uint64_t robolocks_battle_runtime_unit_weapon_intent_age_ticks(
  RobolocksBattleRuntimeHandle handle,
  size_t unit_index
) {
  const auto* unit = unit_at(handle, unit_index);
  return unit == nullptr ? 0 : unit->weapon_intent_age_ticks;
}

size_t robolocks_battle_runtime_obstacle_count(RobolocksBattleRuntimeHandle handle) {
  const auto* runtime = as_runtime(handle);
  if (runtime == nullptr) {
    return 0;
  }
  return runtime->runtime.obstacles().size();
}

const char* robolocks_battle_runtime_obstacle_id(RobolocksBattleRuntimeHandle handle, size_t obstacle_index) {
  const auto* obstacle = obstacle_at(handle, obstacle_index);
  if (obstacle == nullptr) {
    return "";
  }
  return obstacle->id.c_str();
}

double robolocks_battle_runtime_obstacle_x(RobolocksBattleRuntimeHandle handle, size_t obstacle_index) {
  const auto* obstacle = obstacle_at(handle, obstacle_index);
  if (obstacle == nullptr) {
    return 0.0;
  }
  return obstacle->position.x;
}

double robolocks_battle_runtime_obstacle_y(RobolocksBattleRuntimeHandle handle, size_t obstacle_index) {
  const auto* obstacle = obstacle_at(handle, obstacle_index);
  if (obstacle == nullptr) {
    return 0.0;
  }
  return obstacle->position.y;
}

double robolocks_battle_runtime_obstacle_radius_m(RobolocksBattleRuntimeHandle handle, size_t obstacle_index) {
  const auto* obstacle = obstacle_at(handle, obstacle_index);
  if (obstacle == nullptr) {
    return 0.0;
  }
  return obstacle->radius_m;
}

int robolocks_battle_runtime_obstacle_blocks_movement(RobolocksBattleRuntimeHandle handle, size_t obstacle_index) {
  const auto* obstacle = obstacle_at(handle, obstacle_index);
  if (obstacle == nullptr) {
    return 0;
  }
  return obstacle->blocks_movement ? 1 : 0;
}

int robolocks_battle_runtime_obstacle_blocks_line_of_sight(RobolocksBattleRuntimeHandle handle, size_t obstacle_index) {
  const auto* obstacle = obstacle_at(handle, obstacle_index);
  if (obstacle == nullptr) {
    return 0;
  }
  return obstacle->blocks_line_of_sight ? 1 : 0;
}

size_t robolocks_battle_runtime_event_count(RobolocksBattleRuntimeHandle handle) {
  const auto* runtime = as_runtime(handle);
  if (runtime == nullptr) {
    return 0;
  }
  return runtime->last_result.events.size();
}

uint64_t robolocks_battle_runtime_event_tick(RobolocksBattleRuntimeHandle handle, size_t event_index) {
  const auto* event = event_at(handle, event_index);
  if (event == nullptr) {
    return 0;
  }
  return event->tick;
}

uint32_t robolocks_battle_runtime_event_unit_id(RobolocksBattleRuntimeHandle handle, size_t event_index) {
  const auto* event = event_at(handle, event_index);
  if (event == nullptr) {
    return 0;
  }
  return event->unit_id.value;
}

const char* robolocks_battle_runtime_event_code(RobolocksBattleRuntimeHandle handle, size_t event_index) {
  const auto* event = event_at(handle, event_index);
  if (event == nullptr) {
    return "";
  }
  return event->code.c_str();
}

const char* robolocks_battle_runtime_event_message(RobolocksBattleRuntimeHandle handle, size_t event_index) {
  const auto* event = event_at(handle, event_index);
  if (event == nullptr) {
    return "";
  }
  return event->message.c_str();
}

size_t robolocks_battle_runtime_projectile_count(RobolocksBattleRuntimeHandle handle) {
  const auto* runtime = as_runtime(handle);
  if (runtime == nullptr) {
    return 0;
  }
  return runtime->snapshot.projectiles.size();
}

uint64_t robolocks_battle_runtime_projectile_id(RobolocksBattleRuntimeHandle handle, size_t projectile_index) {
  const auto* projectile = projectile_at(handle, projectile_index);
  if (projectile == nullptr) {
    return 0;
  }
  return projectile->projectile_id;
}

uint32_t robolocks_battle_runtime_projectile_owner_unit_id(
  RobolocksBattleRuntimeHandle handle,
  size_t projectile_index
) {
  const auto* projectile = projectile_at(handle, projectile_index);
  if (projectile == nullptr) {
    return 0;
  }
  return projectile->owner_unit_id.value;
}

double robolocks_battle_runtime_projectile_previous_x(RobolocksBattleRuntimeHandle handle, size_t projectile_index) {
  const auto* projectile = projectile_at(handle, projectile_index);
  if (projectile == nullptr) {
    return 0.0;
  }
  return projectile->previous_position.x;
}

double robolocks_battle_runtime_projectile_previous_y(RobolocksBattleRuntimeHandle handle, size_t projectile_index) {
  const auto* projectile = projectile_at(handle, projectile_index);
  if (projectile == nullptr) {
    return 0.0;
  }
  return projectile->previous_position.y;
}

double robolocks_battle_runtime_projectile_x(RobolocksBattleRuntimeHandle handle, size_t projectile_index) {
  const auto* projectile = projectile_at(handle, projectile_index);
  if (projectile == nullptr) {
    return 0.0;
  }
  return projectile->position.x;
}

double robolocks_battle_runtime_projectile_y(RobolocksBattleRuntimeHandle handle, size_t projectile_index) {
  const auto* projectile = projectile_at(handle, projectile_index);
  if (projectile == nullptr) {
    return 0.0;
  }
  return projectile->position.y;
}

double robolocks_battle_runtime_projectile_radius_m(RobolocksBattleRuntimeHandle handle, size_t projectile_index) {
  const auto* projectile = projectile_at(handle, projectile_index);
  if (projectile == nullptr) {
    return 0.0;
  }
  return projectile->radius_m;
}

size_t robolocks_battle_runtime_action_count(RobolocksBattleRuntimeHandle handle) {
  const auto* runtime = as_runtime(handle);
  if (runtime == nullptr) {
    return 0;
  }

  size_t count = 0;
  for (const auto& unit_orders : runtime->last_result.orders_by_unit) {
    count += unit_orders.orders.size();
  }
  return count;
}

uint32_t robolocks_battle_runtime_action_unit_id(RobolocksBattleRuntimeHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  if (action.order == nullptr) {
    return 0;
  }
  return action.unit_id.value;
}

const char* robolocks_battle_runtime_action_type(RobolocksBattleRuntimeHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  if (action.order == nullptr) {
    return "";
  }
  return order_kind_name(action.order->kind);
}

const char* robolocks_battle_runtime_action_channel(RobolocksBattleRuntimeHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  if (action.order == nullptr) {
    return "";
  }
  return order_channel_name(action.order->kind);
}

int robolocks_battle_runtime_action_has_position(RobolocksBattleRuntimeHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  return action.order != nullptr
    && std::holds_alternative<robolocks::MoveToOrder>(action.order->payload)
    ? 1
    : 0;
}

double robolocks_battle_runtime_action_position_x(RobolocksBattleRuntimeHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  if (action.order == nullptr) {
    return 0.0;
  }
  const auto* payload = std::get_if<robolocks::MoveToOrder>(&action.order->payload);
  return payload == nullptr ? 0.0 : payload->position.x;
}

double robolocks_battle_runtime_action_position_y(RobolocksBattleRuntimeHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  if (action.order == nullptr) {
    return 0.0;
  }
  const auto* payload = std::get_if<robolocks::MoveToOrder>(&action.order->payload);
  return payload == nullptr ? 0.0 : payload->position.y;
}

int robolocks_battle_runtime_action_has_target(RobolocksBattleRuntimeHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  if (action.order == nullptr) {
    return 0;
  }
  return std::holds_alternative<robolocks::AimAtOrder>(action.order->payload)
      || std::holds_alternative<robolocks::FaceArmorTowardOrder>(action.order->payload)
    ? 1
    : 0;
}

double robolocks_battle_runtime_action_target_x(RobolocksBattleRuntimeHandle handle, size_t action_index) {
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

double robolocks_battle_runtime_action_target_y(RobolocksBattleRuntimeHandle handle, size_t action_index) {
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

int robolocks_battle_runtime_action_has_min_hit_chance(RobolocksBattleRuntimeHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  return action.order != nullptr
    && std::holds_alternative<robolocks::FireIfSolutionOrder>(action.order->payload)
    ? 1
    : 0;
}

double robolocks_battle_runtime_action_min_hit_chance(RobolocksBattleRuntimeHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  if (action.order == nullptr) {
    return 0.0;
  }
  const auto* payload = std::get_if<robolocks::FireIfSolutionOrder>(&action.order->payload);
  return payload == nullptr ? 0.0 : payload->min_hit_chance;
}

int robolocks_battle_runtime_action_has_scan_arc(RobolocksBattleRuntimeHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  return action.order != nullptr
    && std::holds_alternative<robolocks::ScanArcOrder>(action.order->payload)
    ? 1
    : 0;
}

double robolocks_battle_runtime_action_center_deg(RobolocksBattleRuntimeHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  if (action.order == nullptr) {
    return 0.0;
  }
  const auto* payload = std::get_if<robolocks::ScanArcOrder>(&action.order->payload);
  return payload == nullptr ? 0.0 : payload->center_deg;
}

double robolocks_battle_runtime_action_width_deg(RobolocksBattleRuntimeHandle handle, size_t action_index) {
  const auto action = action_at(handle, action_index);
  if (action.order == nullptr) {
    return 0.0;
  }
  const auto* payload = std::get_if<robolocks::ScanArcOrder>(&action.order->payload);
  return payload == nullptr ? 0.0 : payload->width_deg;
}

}
