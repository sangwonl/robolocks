#pragma once

#include <robolocks/battle_simulation.hpp>

#include <optional>
#include <vector>

namespace robolocks {

struct ResolvedUnitOrders {
  std::optional<MoveToOrder> move_to;
  std::optional<AimAtOrder> aim_at;
  std::optional<FireIfSolutionOrder> fire_if_solution;
  std::optional<FaceArmorTowardOrder> face_armor_toward;
  std::vector<Event> events;
};

ResolvedUnitOrders resolve_unit_orders(
  UnitId unit_id,
  Tick tick,
  const std::vector<UnitOrders>& orders_by_unit
);

}  // namespace robolocks
