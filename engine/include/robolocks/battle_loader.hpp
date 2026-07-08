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
};

struct LoadedBattle {
  BattleConfig config;
  std::vector<ControllerConfig> controllers;
};

LoadedBattle load_battle_from_file(const std::string& path);
LoadedBattle load_battle_from_json_string(const std::string& json);
BattleConfig load_battle_config_from_file(const std::string& path);

}  // namespace robolocks
