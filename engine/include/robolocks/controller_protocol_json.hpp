#pragma once

#include <robolocks/order.hpp>
#include <robolocks/observation.hpp>
#include <robolocks/battle_config.hpp>
#include <robolocks/snapshot.hpp>
#include <robolocks/snapshot_json.hpp>

#include <nlohmann/json_fwd.hpp>

namespace robolocks {

// The per-frame snapshot serializers (including unit_modules_to_json) live in
// snapshot_json.hpp and are shared with the CLI. This header owns the external
// bot protocol: observation/spec serialization and order parsing.
nlohmann::json observation_to_json(const Observation& observation);
nlohmann::json unit_spec_to_json(const UnitSpec& spec);
OrderList orders_from_json(const nlohmann::json& json);

}  // namespace robolocks
