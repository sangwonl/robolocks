#pragma once

#include <robolocks/battle_config.hpp>

#include <string>
#include <vector>

namespace robolocks {

struct ControllerConfig {
  UnitId unit_id;
  std::string type;
  std::string id;
  std::string path;
  std::string resolved_path;
  Vec2 hold_position;
};

struct LoadedBattle {
  BattleConfig config;
  std::vector<ControllerConfig> controllers;
};

LoadedBattle load_battle_from_file(const std::string& path);
BattleConfig load_battle_config_from_file(const std::string& path);

}  // namespace robolocks
