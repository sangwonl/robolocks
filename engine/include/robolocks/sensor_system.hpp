#pragma once

#include <robolocks/battle_config.hpp>
#include <robolocks/observation.hpp>

#include <vector>

namespace robolocks {

struct UnitSensorComponent {
  UnitId unit_id;
  SensorSpec component;
};

class SensorSystem {
 public:
  SensorSystem() = default;
  explicit SensorSystem(std::vector<UnitSensorComponent> sensors);
  SensorSystem(std::vector<UnitSensorComponent> sensors, std::vector<StaticObstacle> obstacles);

  Observation build_observation(const WorldSnapshot& snapshot, UnitId self_id) const;

 private:
  std::vector<UnitSensorComponent> sensors_;
  std::vector<StaticObstacle> obstacles_;

  SensorSpec sensor_for(UnitId unit_id) const;
};

std::vector<UnitSensorComponent> sensor_components_from_battle_config(const BattleConfig& config);

}  // namespace robolocks
