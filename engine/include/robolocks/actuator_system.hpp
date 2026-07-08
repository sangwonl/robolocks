#pragma once

#include <robolocks/runtime_state.hpp>

namespace robolocks {

void advance_unit_actuators(UnitState& unit, double tick_dt_sec);

}  // namespace robolocks
