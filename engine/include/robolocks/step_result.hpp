#pragma once

#include <robolocks/order.hpp>
#include <robolocks/snapshot.hpp>
#include <robolocks/types.hpp>

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

}  // namespace robolocks
