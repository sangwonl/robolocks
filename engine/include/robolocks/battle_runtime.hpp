#pragma once

#include <robolocks/battlefield.hpp>
#include <robolocks/bot_controller.hpp>
#include <robolocks/sensor_system.hpp>

#include <memory>

namespace robolocks {

struct ControllerBinding {
  UnitId unit_id;
  std::unique_ptr<BotController> controller;
};

class BattleRuntime {
 public:
  explicit BattleRuntime(BattleConfig config);
  BattleRuntime(BattleConfig config, std::vector<ControllerBinding> controllers);

  static BattleRuntime preset_duel();
  static BattleRuntime preset_duel(BattleConfig config);

  WorldSnapshot snapshot() const;
  const std::vector<StaticObstacle>& obstacles() const;
  StepResult step_once();
  StepResult step_once(const std::vector<UnitOrders>& orders_by_unit);
  WorldSnapshot run_ticks(Tick count);

 private:
  std::vector<StaticObstacle> obstacles_;
  Battlefield battlefield_;
  SensorSystem sensor_system_;
  WorldSnapshot snapshot_;
  std::vector<ControllerBinding> controllers_;
};

}  // namespace robolocks
