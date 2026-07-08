#include <robolocks/order_resolution.hpp>

#include <variant>

namespace robolocks {

namespace {

Event diagnostic_event(Tick tick, UnitId unit_id, std::string code, std::string message) {
  return Event{
    .tick = tick,
    .unit_id = unit_id,
    .code = std::move(code),
    .message = std::move(message),
  };
}

}  // namespace

ResolvedUnitOrders resolve_unit_orders(
  UnitId unit_id,
  Tick tick,
  const std::vector<UnitOrders>& orders_by_unit
) {
  ResolvedUnitOrders resolved;
  bool duplicate_mobility = false;
  bool duplicate_turret = false;
  bool duplicate_weapon = false;
  bool duplicate_hull = false;

  for (const auto& unit_orders : orders_by_unit) {
    if (!(unit_orders.unit_id == unit_id)) {
      continue;
    }

    for (const auto& order : unit_orders.orders) {
      if (!order_payload_matches_kind(order)) {
        resolved.events.push_back(diagnostic_event(
          tick,
          unit_id,
          "invalid_order_payload_kind",
          "Order payload variant does not match the declared order kind."
        ));
        continue;
      }

      switch (order_channel(order.kind)) {
        case OrderChannel::Mobility:
          if (resolved.move_to.has_value()) {
            duplicate_mobility = true;
            continue;
          }
          if (const auto* payload = std::get_if<MoveToOrder>(&order.payload)) {
            resolved.move_to = *payload;
          }
          break;
        case OrderChannel::Turret:
          if (resolved.aim_at.has_value()) {
            duplicate_turret = true;
            continue;
          }
          if (const auto* payload = std::get_if<AimAtOrder>(&order.payload)) {
            resolved.aim_at = *payload;
          }
          break;
        case OrderChannel::Hull:
          if (resolved.face_armor_toward.has_value()) {
            duplicate_hull = true;
            continue;
          }
          if (const auto* payload = std::get_if<FaceArmorTowardOrder>(&order.payload)) {
            resolved.face_armor_toward = *payload;
          }
          break;
        case OrderChannel::Weapon:
          if (resolved.fire_if_solution.has_value()) {
            duplicate_weapon = true;
            continue;
          }
          if (const auto* payload = std::get_if<FireIfSolutionOrder>(&order.payload)) {
            resolved.fire_if_solution = *payload;
          }
          break;
        case OrderChannel::Sensor:
          break;
      }
    }
  }

  if (duplicate_mobility) {
    resolved.events.push_back(diagnostic_event(
      tick,
      unit_id,
      "duplicate_mobility_order",
      "Mobility channel rejected because multiple orders were returned."
    ));
    resolved.move_to.reset();
  }
  if (duplicate_turret) {
    resolved.events.push_back(diagnostic_event(
      tick,
      unit_id,
      "duplicate_turret_order",
      "Turret channel rejected because multiple orders were returned."
    ));
    resolved.aim_at.reset();
  }
  if (duplicate_hull) {
    resolved.events.push_back(diagnostic_event(
      tick,
      unit_id,
      "duplicate_hull_order",
      "Hull channel rejected because multiple orders were returned."
    ));
    resolved.face_armor_toward.reset();
  }
  if (duplicate_weapon) {
    resolved.events.push_back(diagnostic_event(
      tick,
      unit_id,
      "duplicate_weapon_order",
      "Weapon channel rejected because multiple orders were returned."
    ));
    resolved.fire_if_solution.reset();
  }

  return resolved;
}

}  // namespace robolocks
