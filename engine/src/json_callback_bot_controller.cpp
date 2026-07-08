#include <robolocks/json_callback_bot_controller.hpp>

#include <robolocks/controller_protocol_json.hpp>

#include <stdexcept>
#include <utility>

#include <nlohmann/json.hpp>

namespace robolocks {

JsonCallbackBotController::JsonCallbackBotController(UnitId bot_id, JsonBotCallback callback)
    : bot_id_(bot_id), callback_(std::move(callback)) {
  if (!callback_) {
    throw std::runtime_error("JsonCallbackBotController requires a callback");
  }
}

void JsonCallbackBotController::on_start(const UnitSpec& spec) {
  const auto start_json = nlohmann::json{
    {"type", "start"},
    {"spec", unit_spec_to_json(spec)},
  }.dump();
  callback_(bot_id_, start_json);
}

OrderList JsonCallbackBotController::on_tick(const Observation& observation) {
  const auto observation_json = observation_to_json(observation).dump();
  const auto orders_json = callback_(bot_id_, observation_json);
  return orders_from_json(nlohmann::json::parse(orders_json));
}

}  // namespace robolocks
