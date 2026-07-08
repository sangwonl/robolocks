#pragma once

#include <robolocks/battle_simulation.hpp>
#include <robolocks/runtime_state.hpp>

#include <cstdint>
#include <vector>

namespace robolocks {

std::vector<Event> resolve_weapon_fire(
  Tick tick,
  double tick_dt_sec,
  const std::vector<UnitOrders>& orders_by_unit,
  std::vector<UnitState>& units,
  std::vector<ProjectileState>& projectiles,
  std::uint64_t& next_projectile_id
);

std::vector<Event> advance_projectiles(
  Tick tick,
  double tick_dt_sec,
  std::vector<UnitState>& units,
  std::vector<ProjectileState>& projectiles
);

}  // namespace robolocks
