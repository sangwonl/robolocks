#pragma once

#include <robolocks/battle_loader.hpp>
#include <robolocks/battle_runtime.hpp>

#include <vector>

namespace robolocks {

std::vector<ControllerBinding> create_builtin_controllers(const std::vector<ControllerConfig>& configs);
ControllerBinding create_hold_line_controller(UnitId unit_id, Vec2 hold_position);

}  // namespace robolocks
