#include <robolocks/battle_runner.hpp>

#include <robolocks/order_resolution.hpp>

#include <algorithm>
#include <utility>

namespace robolocks {

BattleRunner::BattleRunner(BattleConfig config)
    : obstacles_(config.obstacles),
      tick_dt_sec_(config.tick_dt_sec),
      simulation_(config),
      sensor_system_(sensor_components_from_battle_config(config), std::vector<StaticObstacle>(config.obstacles)),
      snapshot_(simulation_.snapshot()) {
  start_controllers(config);
}

BattleRunner::BattleRunner(BattleConfig config, std::vector<ControllerBinding> controllers)
    : obstacles_(config.obstacles),
      tick_dt_sec_(config.tick_dt_sec),
      simulation_(config),
      sensor_system_(sensor_components_from_battle_config(config), std::vector<StaticObstacle>(config.obstacles)),
      snapshot_(simulation_.snapshot()),
      controllers_(std::move(controllers)) {
  start_controllers(config);
}

WorldSnapshot BattleRunner::snapshot() const {
  return snapshot_;
}

const std::vector<StaticObstacle>& BattleRunner::obstacles() const {
  return obstacles_;
}

StepResult BattleRunner::step_once() {
  std::vector<UnitOrders> orders_by_unit;
  orders_by_unit.reserve(controllers_.size());

  for (auto& binding : controllers_) {
    if (binding.controller == nullptr) {
      continue;
    }
    auto observation = sensor_system_.build_observation(snapshot_, binding.unit_id);
    observation.obstacles = obstacles_;
    orders_by_unit.push_back(UnitOrders{
      .unit_id = binding.unit_id,
      .orders = binding.controller->on_tick(observation),
    });
  }

  return step_once(orders_by_unit);
}

StepResult BattleRunner::step_once(const std::vector<UnitOrders>& orders_by_unit) {
  auto result = simulation_.step(orders_by_unit);
  apply_scan_orders(orders_by_unit);
  // Slew each unit's scan toward its requested direction, then surface the actual
  // (slew-limited) scan direction on the snapshot so the replay/render matches
  // what the sensor actually sees.
  sensor_system_.advance_scan(tick_dt_sec_);
  for (auto& unit : result.snapshot.units) {
    const auto scan = sensor_system_.scan_state_for(unit.unit_id);
    unit.sensor_scan_active = scan.active;
    unit.sensor_heading_deg = scan.active ? scan.direction_deg : unit.turret_heading_deg;
  }
  snapshot_ = result.snapshot;
  return result;
}

WorldSnapshot BattleRunner::run_ticks(Tick count) {
  for (Tick i = 0; i < count; i += 1) {
    step_once();
  }
  return snapshot_;
}

void BattleRunner::start_controllers(const BattleConfig& config) {
  for (auto& binding : controllers_) {
    if (binding.controller == nullptr) {
      continue;
    }
    const auto unit = std::find_if(config.units.begin(), config.units.end(), [&binding](const UnitSpec& spec) {
      return spec.unit_id == binding.unit_id;
    });
    if (unit != config.units.end()) {
      binding.controller->on_start(*unit);
    }
  }
}

void BattleRunner::apply_scan_orders(const std::vector<UnitOrders>& orders_by_unit) {
  for (const auto& unit_orders : orders_by_unit) {
    const auto resolved = resolve_unit_orders(unit_orders.unit_id, snapshot_.tick + 1, orders_by_unit);
    if (resolved.scan_arc.has_value()) {
      sensor_system_.set_scan_arc(unit_orders.unit_id, *resolved.scan_arc);
    }
  }
}

}  // namespace robolocks
