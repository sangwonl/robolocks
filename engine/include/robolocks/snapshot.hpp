#pragma once

#include <robolocks/types.hpp>

#include <string>
#include <vector>

namespace robolocks {

struct UnitSnapshot {
  UnitId unit_id;
  Vec2 position;
  double hull_heading_deg = 0.0;
  double turret_heading_deg = 0.0;
  double armor_integrity = 100.0;
};

struct Event {
  Tick tick = 0;
  UnitId unit_id;
  std::string code;
  std::string message;
};

struct WorldSnapshot {
  Tick tick = 0;
  std::vector<UnitSnapshot> units;
};

}  // namespace robolocks
