#pragma once

#include <robolocks/battle_loader.hpp>
#include <robolocks/battle_runtime.hpp>

#include <vector>

namespace robolocks {

std::vector<ControllerBinding> create_controllers(const std::vector<ControllerConfig>& configs);

}  // namespace robolocks
