#pragma once

#include <robolocks/types.hpp>

#include <cstdint>
#include <string>
#include <vector>

namespace robolocks {

struct TankPreset {
  UnitId unit_id;
  std::string name;
  Vec2 spawn_position;
  double max_speed_mps = 8.0;
  double armor_integrity = 100.0;
};

struct MatchConfig {
  std::string match_id = "preset_duel_v0";
  std::uint32_t seed = 1;
  double tick_dt_sec = 1.0 / 30.0;
  Tick tick_limit = 9000;
  std::vector<TankPreset> tanks;
};

}  // namespace robolocks
