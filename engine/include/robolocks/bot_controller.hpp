#pragma once

#include <robolocks/battle_config.hpp>
#include <robolocks/order.hpp>
#include <robolocks/observation.hpp>

namespace robolocks {

class BotController {
 public:
  virtual ~BotController() = default;
  virtual void on_start(const UnitSpec& spec) { (void)spec; }
  virtual OrderList on_tick(const Observation& observation) = 0;
};

}  // namespace robolocks
