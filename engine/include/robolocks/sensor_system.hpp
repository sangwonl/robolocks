#pragma once

#include <robolocks/battle_config.hpp>
#include <robolocks/observation.hpp>
#include <robolocks/order.hpp>

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

  // Non-const: refreshTicks caching updates a per-unit contact cache.
  Observation build_observation(const WorldSnapshot& snapshot, UnitId self_id);
  void set_scan_arc(UnitId unit_id, const ScanArcOrder& scan_arc);
  // Slew each unit's actual scan direction toward its requested direction, capped
  // by the sensor's max scan slew rate. Call once per tick after scan orders.
  void advance_scan(double tick_dt_sec);

  struct ScanState {
    bool active = false;
    double direction_deg = 0.0;
  };
  ScanState scan_state_for(UnitId unit_id) const;

 private:
  struct UnitScanArcState {
    UnitId unit_id;
    ScanArcOrder scan_arc;               // last requested arc (width/range)
    double current_direction_deg = 0.0;  // actual, slew-limited direction (unwrapped)
    double target_direction_deg = 0.0;   // requested direction, unwrapped so a
                                         // continuously rotating request does not
                                         // reverse when the lag crosses 180 degrees
    double prev_requested_deg = 0.0;     // last requested direction, normalized
    bool initialized = false;
  };

  // Cached contacts so the sensor only re-scans every refreshTicks; on off-ticks
  // the bot keeps the previous contacts (own state is always fresh).
  struct UnitSensorCache {
    UnitId unit_id;
    Tick last_refresh_tick = 0;
    bool has_cache = false;
    ContactSetObservation contacts;
  };

  std::vector<UnitSensorComponent> sensors_;
  std::vector<StaticObstacle> obstacles_;
  std::vector<UnitScanArcState> scan_arcs_;
  std::vector<UnitSensorCache> caches_;

  SensorSpec sensor_for(UnitId unit_id) const;
  UnitScanArcState* scan_arc_state_for(UnitId unit_id);
  const UnitScanArcState* scan_arc_state_for(UnitId unit_id) const;
  UnitSensorCache& cache_for(UnitId unit_id);
};

std::vector<UnitSensorComponent> sensor_components_from_battle_config(const BattleConfig& config);

}  // namespace robolocks
