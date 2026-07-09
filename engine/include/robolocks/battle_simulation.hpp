#pragma once

#include <robolocks/battle_config.hpp>
#include <robolocks/order.hpp>
#include <robolocks/physics_system.hpp>
#include <robolocks/runtime_state.hpp>
#include <robolocks/snapshot.hpp>

#include <string>
#include <vector>

namespace robolocks {

struct UnitOrders {
  UnitId unit_id;
  OrderList orders;
};

struct BattleScore {
  UnitId unit_id;
  std::uint32_t team_id = 0;
  std::uint32_t kills = 0;
  std::uint32_t deaths = 0;
  double damage_dealt = 0.0;
};

struct RespawnState {
  UnitId unit_id;
  Tick ready_tick = 0;
};

struct CaptureZoneState {
  std::string id;
  Vec2 position;
  double radius_m = 1.0;
  Tick hold_ticks_required = 0;
  Tick held_ticks = 0;
  UnitId owner_unit_id;
  std::uint32_t owner_team_id = 0;
  bool contested = false;
};

struct BattleOutcome {
  bool finished = false;
  std::string reason;
  UnitId winner_unit_id;
  std::uint32_t winner_team_id = 0;
};

struct BattleRuleState {
  std::vector<BattleScore> scores;
  std::vector<RespawnState> respawns;
  std::vector<CaptureZoneState> capture_zones;
  BattleOutcome outcome;
};

struct StepResult {
  WorldSnapshot snapshot;
  std::vector<Event> events;
  std::vector<UnitOrders> orders_by_unit;
  BattleRuleState rule_state;
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
