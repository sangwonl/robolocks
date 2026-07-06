#pragma once

#include <robolocks/command.hpp>
#include <robolocks/match_config.hpp>
#include <robolocks/snapshot.hpp>

#include <vector>

namespace robolocks {

struct UnitCommands {
  UnitId unit_id;
  CommandList commands;
};

struct StepResult {
  WorldSnapshot snapshot;
  std::vector<Event> events;
};

class Match {
 public:
  explicit Match(MatchConfig config);

  WorldSnapshot snapshot() const;
  StepResult step(const std::vector<UnitCommands>& commands_by_unit);

 private:
  struct UnitState {
    UnitId unit_id;
    Vec2 position;
    double hull_heading_deg = 0.0;
    double turret_heading_deg = 0.0;
    double max_speed_mps = 0.0;
    double armor_integrity = 100.0;
  };

  double tick_dt_sec_ = 1.0 / 30.0;
  Tick tick_ = 0;
  std::vector<UnitState> units_;
};

}  // namespace robolocks
