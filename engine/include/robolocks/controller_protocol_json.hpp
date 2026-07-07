#pragma once

#include <robolocks/order.hpp>
#include <robolocks/observation.hpp>

#include <nlohmann/json_fwd.hpp>

namespace robolocks {

nlohmann::json observation_to_json(const Observation& observation);
OrderList orders_from_json(const nlohmann::json& json);

}  // namespace robolocks
