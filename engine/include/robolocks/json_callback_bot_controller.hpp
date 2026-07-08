#pragma once

#include <robolocks/bot_controller.hpp>

#include <functional>
#include <string>

namespace robolocks {

using JsonBotCallback = std::function<std::string(UnitId bot_id, const std::string& observation_json)>;

class JsonCallbackBotController final : public BotController {
 public:
  JsonCallbackBotController(UnitId bot_id, JsonBotCallback callback);

  OrderList on_tick(const Observation& observation) override;

 private:
  UnitId bot_id_;
  JsonBotCallback callback_;
};

}  // namespace robolocks
