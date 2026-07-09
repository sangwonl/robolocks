#pragma once

#include <robolocks/battle_config.hpp>
#include <robolocks/order.hpp>
#include <robolocks/physics_system.hpp>
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
  PhysicsSystem physics_;
  Tick tick_ = 0;
  std::uint64_t next_projectile_id_ = 1;
  BattleRuleConfig rule_;
  BattleRuleState rule_state_;
  std::vector<StaticObstacle> obstacles_;
  std::vector<UnitState> units_;
  std::vector<ProjectileState> projectiles_;

  void apply_rule_events(const std::vector<Event>& events);
  void process_respawns(std::vector<Event>& events);
  void update_capture_zones();
  void evaluate_outcome();
};

}  // namespace robolocks
