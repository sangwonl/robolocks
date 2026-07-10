#pragma once

#include <robolocks/runtime_state.hpp>

#include <cstddef>
#include <cstdint>
#include <utility>
#include <vector>

namespace robolocks {

// Owns the in-flight projectiles and the projectile id counter, matching the
// stateful shape of SensorSystem/PhysicsSystem. Weapon fire and ballistic
// flight are resolved per tick against the caller's unit list.
class ProjectileSystem {
 public:
  ProjectileSystem() = default;
  explicit ProjectileSystem(std::vector<ProjectileState> projectiles)
      : projectiles_(std::move(projectiles)) {}

  const std::vector<ProjectileState>& projectiles() const { return projectiles_; }

  // Spawns projectiles for units with a live weapon intent. `fire_order_counts`
  // is aligned index-for-index with `units` and carries how many FireIfSolution
  // orders each unit submitted this tick; a count greater than one rejects the
  // shot (the signal the order resolution layer collapses away).
  std::vector<Event> resolve_weapon_fire(
    Tick tick,
    std::vector<UnitState>& units,
    const std::vector<std::size_t>& fire_order_counts
  );

  // Advances every in-flight projectile one tick, applying direct and blast
  // damage and dropping spent projectiles.
  std::vector<Event> advance_projectiles(
    Tick tick,
    double tick_dt_sec,
    std::vector<UnitState>& units
  );
  std::vector<Event> advance_projectiles(
    Tick tick,
    double tick_dt_sec,
    std::vector<UnitState>& units,
    const BattleBounds& bounds,
    const std::vector<StaticObstacle>& obstacles
  );

 private:
  std::vector<ProjectileState> projectiles_;
  std::uint64_t next_projectile_id_ = 1;
};

}  // namespace robolocks
