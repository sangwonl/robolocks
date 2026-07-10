#pragma once

#include <robolocks/battle_simulation.hpp>
#include <robolocks/bot_controller.hpp>
#include <robolocks/sensor_system.hpp>

#include <memory>

namespace robolocks {

struct ControllerBinding {
  UnitId unit_id;
  std::unique_ptr<BotController> controller;
};

class BattleRunner {
 public:
  explicit BattleRunner(BattleConfig config);
  BattleRunner(BattleConfig config, std::vector<ControllerBinding> controllers);

  WorldSnapshot snapshot() const;
  const std::vector<StaticObstacle>& obstacles() const;
  StepResult step_once();
  StepResult step_once(const std::vector<UnitOrders>& orders_by_unit);
  WorldSnapshot run_ticks(Tick count);

 private:
  std::vector<StaticObstacle> obstacles_;
  double tick_dt_sec_ = 1.0 / 60.0;
  BattleSimulation simulation_;
  SensorSystem sensor_system_;
  WorldSnapshot snapshot_;
  std::vector<ControllerBinding> controllers_;

  void start_controllers(const BattleConfig& config);
  void apply_scan_orders(const std::vector<UnitOrders>& orders_by_unit);
};

}  // namespace robolocks
