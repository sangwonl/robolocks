#pragma once

#include <robolocks/battle_config.hpp>
#include <robolocks/order.hpp>
#include <robolocks/physics_system.hpp>
#include <robolocks/projectile_system.hpp>
#include <robolocks/runtime_state.hpp>
#include <robolocks/snapshot.hpp>
#include <robolocks/step_result.hpp>

#include <string>
#include <vector>

namespace robolocks {

class BattleSimulation {
 public:
  explicit BattleSimulation(BattleConfig config);

  WorldSnapshot snapshot() const;
  StepResult step(const std::vector<UnitOrders>& orders_by_unit);

 private:
  double tick_dt_sec_ = 1.0 / 30.0;
  Tick tick_limit_ = 9000;
  BattleBounds bounds_;
  PhysicsSystem physics_;
  ProjectileSystem projectiles_;
  Tick tick_ = 0;
  BattleRuleConfig rule_;
  BattleRuleState rule_state_;
  std::vector<StaticObstacle> obstacles_;
  std::vector<UnitState> units_;

  void apply_unit_orders(const std::vector<UnitOrders>& orders_by_unit, std::vector<Event>& events);
  void run_projectile_phase(const std::vector<UnitOrders>& orders_by_unit, std::vector<Event>& events);
  void run_physics_phase(std::vector<Event>& events);
  std::vector<UnitOrders> filter_visible_orders(const std::vector<UnitOrders>& orders_by_unit) const;
  void apply_rule_events(const std::vector<Event>& events);
  void process_respawns(std::vector<Event>& events);
  void update_capture_zones();
  void evaluate_outcome();
};

}  // namespace robolocks
