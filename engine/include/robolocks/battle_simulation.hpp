#pragma once

#include <robolocks/battle_config.hpp>
#include <robolocks/order.hpp>
#include <robolocks/physics_system.hpp>
#include <robolocks/runtime_state.hpp>
#include <robolocks/snapshot.hpp>

#include <vector>

namespace robolocks {

struct UnitOrders {
  UnitId unit_id;
  OrderList orders;
};

struct StepResult {
  WorldSnapshot snapshot;
  std::vector<Event> events;
  std::vector<UnitOrders> orders_by_unit;
};

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
  std::vector<UnitState> units_;
  std::vector<ProjectileState> projectiles_;
};

}  // namespace robolocks
