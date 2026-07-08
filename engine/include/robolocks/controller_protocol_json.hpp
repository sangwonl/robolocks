#pragma once

#include <robolocks/order.hpp>
#include <robolocks/observation.hpp>
#include <robolocks/battle_config.hpp>
#include <robolocks/snapshot.hpp>

#include <nlohmann/json_fwd.hpp>

namespace robolocks {

nlohmann::json observation_to_json(const Observation& observation);
nlohmann::json unit_modules_to_json(const UnitModulesSnapshot& modules);
nlohmann::json unit_spec_to_json(const UnitSpec& spec);
OrderList orders_from_json(const nlohmann::json& json);

}  // namespace robolocks
