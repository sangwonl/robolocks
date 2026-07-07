#pragma once

#include <robolocks/battle_config.hpp>
#include <robolocks/snapshot.hpp>

#include <vector>

namespace robolocks {

struct PhysicsBody {
  UnitId unit_id;
  Vec2 position;
  BodyShapeComponent shape;
  double heading_deg = 0.0;
  double mass_kg = 30000.0;
};

class PhysicsSystem {
 public:
  PhysicsSystem(BattleBounds bounds, std::vector<StaticObstacle> obstacles = {});

  std::vector<Event> resolve(Tick tick, std::vector<PhysicsBody>& bodies) const;

 private:
  BattleBounds bounds_;
  std::vector<StaticObstacle> obstacles_;
};

}  // namespace robolocks
