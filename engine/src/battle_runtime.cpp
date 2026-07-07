#include <robolocks/battle_runtime.hpp>

#include <robolocks/builtin_controllers.hpp>
#include <robolocks/presets.hpp>

#include <utility>

namespace robolocks {

BattleRuntime::BattleRuntime(BattleConfig config)
    : obstacles_(config.obstacles),
      battlefield_(config),
      sensor_system_(sensor_components_from_battle_config(config), std::vector<StaticObstacle>(config.obstacles)),
      snapshot_(battlefield_.snapshot()) {}

BattleRuntime::BattleRuntime(BattleConfig config, std::vector<ControllerBinding> controllers)
    : obstacles_(config.obstacles),
      battlefield_(config),
      sensor_system_(sensor_components_from_battle_config(config), std::vector<StaticObstacle>(config.obstacles)),
      snapshot_(battlefield_.snapshot()),
      controllers_(std::move(controllers)) {}

BattleRuntime BattleRuntime::preset_duel() {
  return preset_duel(preset_duel_config());
}

BattleRuntime BattleRuntime::preset_duel(BattleConfig config) {
  std::vector<ControllerBinding> controllers;
  controllers.push_back(create_hold_line_controller(UnitId{1}, Vec2{17.0, 12.0}));
  controllers.push_back(create_hold_line_controller(UnitId{2}, Vec2{23.0, 12.0}));
  return BattleRuntime(std::move(config), std::move(controllers));
}

WorldSnapshot BattleRuntime::snapshot() const {
  return snapshot_;
}

const std::vector<StaticObstacle>& BattleRuntime::obstacles() const {
  return obstacles_;
}

StepResult BattleRuntime::step_once() {
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

StepResult BattleRuntime::step_once(const std::vector<UnitOrders>& orders_by_unit) {
  auto result = battlefield_.step(orders_by_unit);
  snapshot_ = result.snapshot;
  return result;
}

WorldSnapshot BattleRuntime::run_ticks(Tick count) {
  for (Tick i = 0; i < count; i += 1) {
    step_once();
  }
  return snapshot_;
}

}  // namespace robolocks
