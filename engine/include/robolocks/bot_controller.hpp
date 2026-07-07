#pragma once

#include <robolocks/order.hpp>
#include <robolocks/observation.hpp>

namespace robolocks {

class BotController {
 public:
  virtual ~BotController() = default;
  virtual OrderList on_tick(const Observation& observation) = 0;
};

}  // namespace robolocks
