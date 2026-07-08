from __future__ import annotations

import json
import sys
from collections.abc import Callable, Iterable
from typing import Any

from .orders import OrderLike
from .state import BattleState

OnTick = Callable[[BattleState], Iterable[OrderLike]]
LifecycleHook = Callable[[Any], None]


def run_bot(
    on_tick: OnTick,
    on_start: LifecycleHook | None = None,
    on_end: LifecycleHook | None = None,
) -> None:
    if on_start is not None:
        on_start(None)

    for line in sys.stdin:
        state = BattleState.from_json(json.loads(line))
        orders = list(on_tick(state))
        print(json.dumps({"orders": [_order_to_json(order) for order in orders]}), flush=True)

    if on_end is not None:
        on_end(None)


def _order_to_json(order: OrderLike) -> dict:
    if hasattr(order, "to_json"):
        return order.to_json()
    return dict(order)
