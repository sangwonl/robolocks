#pragma once

#include <robolocks/order_resolution.hpp>
#include <robolocks/runtime_state.hpp>

namespace robolocks {

void clear_intents(UnitState& unit);
void apply_resolved_orders_to_intents(UnitState& unit, const ResolvedUnitOrders& resolved_orders, Tick tick);
Tick intent_age(Tick snapshot_tick, Tick updated_tick);

}  // namespace robolocks
