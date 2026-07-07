#include <robolocks/builtin_controllers.hpp>

#include <robolocks/math.hpp>

#include <stdexcept>

namespace robolocks {

namespace {

Order move_to(Vec2 position) {
  return Order{
    .kind = OrderKind::MoveTo,
    .payload = MoveToOrder{position},
  };
}

Order aim_at(Vec2 target) {
  return Order{
    .kind = OrderKind::AimAt,
    .payload = AimAtOrder{target},
  };
}

Order face_armor_toward(Vec2 target) {
  return Order{
    .kind = OrderKind::FaceArmorToward,
    .payload = FaceArmorTowardOrder{target},
  };
}

Order fire_if_solution(double min_hit_chance) {
  return Order{
    .kind = OrderKind::FireIfSolution,
    .payload = FireIfSolutionOrder{min_hit_chance},
  };
}

class HoldLineController final : public BotController {
 public:
  explicit HoldLineController(Vec2 hold_position) : hold_position_(hold_position) {}

  OrderList on_tick(const Observation& observation) override {
    OrderList orders;

    const bool at_hold = length(Vec2{
      observation.self.position.x - hold_position_.x,
      observation.self.position.y - hold_position_.y,
    }) <= 0.1;

    if (!at_hold) {
      orders.push_back(move_to(hold_position_));
    }

    if (!observation.contacts.empty()) {
      const Vec2 target = observation.contacts[0].position;
      orders.push_back(aim_at(target));
      if (at_hold) {
        orders.push_back(face_armor_toward(target));
      }
      orders.push_back(fire_if_solution(0.6));
    }

    return orders;
  }

 private:
  Vec2 hold_position_;
};

}  // namespace

ControllerBinding create_hold_line_controller(UnitId unit_id, Vec2 hold_position) {
  return ControllerBinding{unit_id, std::make_unique<HoldLineController>(hold_position)};
}

std::vector<ControllerBinding> create_builtin_controllers(const std::vector<ControllerConfig>& configs) {
  std::vector<ControllerBinding> controllers;
  controllers.reserve(configs.size());

  for (const auto& config : configs) {
    if (config.type != "builtin") {
      throw std::runtime_error("Unsupported controller type for builtin factory: " + config.type);
    }
    if (config.id != "hold_line") {
      throw std::runtime_error("Unsupported builtin controller id: " + config.id);
    }
    controllers.push_back(create_hold_line_controller(config.unit_id, config.hold_position));
  }

  return controllers;
}

}  // namespace robolocks
