#pragma once

#include <robolocks/types.hpp>

#include <type_traits>
#include <variant>
#include <vector>

namespace robolocks {

enum class OrderKind {
  MoveTo,
  AimAt,
  FireIfSolution,
  ScanArc,
  FaceArmorToward,
};

enum class OrderChannel {
  Mobility,
  Turret,
  Weapon,
  Sensor,
  Hull,
};

struct MoveToOrder {
  Vec2 position;
};

struct AimAtOrder {
  Vec2 target;
};

struct FireIfSolutionOrder {
  double min_hit_chance = 0.0;
};

struct ScanArcOrder {
  double direction_deg = 0.0;
  double width_deg = 0.0;
  double range_m = 0.0;
};

struct FaceArmorTowardOrder {
  Vec2 target;
};

using OrderPayload = std::variant<
  MoveToOrder,
  AimAtOrder,
  FireIfSolutionOrder,
  ScanArcOrder,
  FaceArmorTowardOrder
>;

struct Order {
  OrderKind kind;
  OrderPayload payload;
};

using OrderList = std::vector<Order>;

inline const char* to_string(OrderKind kind) {
  switch (kind) {
    case OrderKind::MoveTo:
      return "moveTo";
    case OrderKind::AimAt:
      return "aimAt";
    case OrderKind::FireIfSolution:
      return "fireIfSolution";
    case OrderKind::ScanArc:
      return "scanArc";
    case OrderKind::FaceArmorToward:
      return "faceArmorToward";
  }
  return "unknown";
}

inline const char* to_string(OrderChannel channel) {
  switch (channel) {
    case OrderChannel::Mobility:
      return "mobility";
    case OrderChannel::Turret:
      return "turret";
    case OrderChannel::Weapon:
      return "weapon";
    case OrderChannel::Sensor:
      return "sensor";
    case OrderChannel::Hull:
      return "hull";
  }
  return "unknown";
}

inline OrderChannel order_channel(OrderKind kind) {
  switch (kind) {
    case OrderKind::MoveTo:
      return OrderChannel::Mobility;
    case OrderKind::AimAt:
      return OrderChannel::Turret;
    case OrderKind::FireIfSolution:
      return OrderChannel::Weapon;
    case OrderKind::ScanArc:
      return OrderChannel::Sensor;
    case OrderKind::FaceArmorToward:
      return OrderChannel::Hull;
  }
  return OrderChannel::Mobility;
}

inline OrderKind order_payload_kind(const OrderPayload& payload) {
  return std::visit([](const auto& typed_payload) {
    using Payload = std::decay_t<decltype(typed_payload)>;
    if constexpr (std::is_same_v<Payload, MoveToOrder>) {
      return OrderKind::MoveTo;
    } else if constexpr (std::is_same_v<Payload, AimAtOrder>) {
      return OrderKind::AimAt;
    } else if constexpr (std::is_same_v<Payload, FireIfSolutionOrder>) {
      return OrderKind::FireIfSolution;
    } else if constexpr (std::is_same_v<Payload, ScanArcOrder>) {
      return OrderKind::ScanArc;
    } else {
      return OrderKind::FaceArmorToward;
    }
  }, payload);
}

inline bool order_payload_matches_kind(const Order& order) {
  return order.kind == order_payload_kind(order.payload);
}

}  // namespace robolocks
