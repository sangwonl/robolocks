#pragma once

#include <robolocks/battle_config.hpp>
#include <robolocks/battle_simulation.hpp>
#include <robolocks/observation.hpp>
#include <robolocks/order.hpp>
#include <robolocks/snapshot.hpp>
#include <robolocks/types.hpp>

#include <nlohmann/json_fwd.hpp>

namespace robolocks {

// Shared per-tick frame serializers. These use nlohmann::ordered_json so the
// emitted key order is deterministic and byte-compatible with the CLI's
// hand-rolled stream/replay schema (structural cmake tests grep for key
// adjacency such as "modules":{"mobility" and "unitId":1,"type":"aimAt").

nlohmann::ordered_json vec2_to_json(Vec2 vec);
nlohmann::ordered_json unit_snapshot_to_json(const UnitSnapshot& unit);
nlohmann::ordered_json contact_to_json(const ContactObservation& contact);
nlohmann::ordered_json obstacle_to_json(const StaticObstacle& obstacle);
nlohmann::ordered_json projectile_to_json(const ProjectileSnapshot& projectile);
nlohmann::ordered_json unit_modules_to_json(const UnitModulesSnapshot& modules);
nlohmann::ordered_json event_to_json(const Event& event);
nlohmann::ordered_json action_to_json(UnitId unit_id, const Order& order);
nlohmann::ordered_json rule_state_to_json(const BattleRuleState* rule_state);
nlohmann::ordered_json snapshot_to_json(const WorldSnapshot& snapshot);

}  // namespace robolocks
