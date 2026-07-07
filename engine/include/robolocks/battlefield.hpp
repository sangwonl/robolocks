#pragma once

#include <robolocks/order.hpp>
#include <robolocks/battle_config.hpp>
#include <robolocks/physics_system.hpp>
#include <robolocks/snapshot.hpp>

#include <vector>

namespace robolocks {

struct UnitOrders {
  UnitId unit_id;
  OrderList orders;
};

struct StepResult {
  WorldSnapshot snapshot;
  std::vector<Event> events;
  std::vector<UnitOrders> orders_by_unit;
};

class Battlefield {
 public:
  explicit Battlefield(BattleConfig config);

  WorldSnapshot snapshot() const;
  StepResult step(const std::vector<UnitOrders>& orders_by_unit);

 private:
  struct UnitState {
    UnitId unit_id;
    TransformComponent transform;
    MobilityComponent mobility;
    TurretComponent turret;
    WeaponComponent weapon;
    ArmorComponent armor;
    BodyComponent body;
    Tick weapon_cooldown_ticks = 0;
    bool mobility_intent_active = false;
    Vec2 mobility_intent_target;
    Tick mobility_intent_started_tick = 0;
    Tick mobility_intent_updated_tick = 0;
    bool turret_intent_active = false;
    Vec2 turret_intent_target;
    Tick turret_intent_started_tick = 0;
    Tick turret_intent_updated_tick = 0;
    bool hull_intent_active = false;
    Vec2 hull_intent_target;
    Tick hull_intent_started_tick = 0;
    Tick hull_intent_updated_tick = 0;
    bool weapon_intent_active = false;
    double weapon_intent_min_hit_chance = 0.0;
    Tick weapon_intent_started_tick = 0;
    Tick weapon_intent_updated_tick = 0;
  };

  static void clear_intents(UnitState& unit);

  double tick_dt_sec_ = 1.0 / 30.0;
  PhysicsSystem physics_;
  Tick tick_ = 0;
  std::vector<UnitState> units_;
};

}  // namespace robolocks
