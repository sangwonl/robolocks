from __future__ import annotations

import json
import sys
from collections.abc import Callable, Iterable
from typing import Any

from .orders import OrderLike
from .spec import UnitSpec
from .state import BattleState

OnTick = Callable[[BattleState], Iterable[OrderLike]]
LifecycleHook = Callable[[Any], None]

_registered_on_tick: dict[int, OnTick] = {}
_registered_on_start: dict[int, LifecycleHook | None] = {}
_registered_on_end: dict[int, LifecycleHook | None] = {}
_started: dict[int, bool] = {}


def _is_browser_runtime() -> bool:
    return sys.platform == "emscripten"


def run_bot(
    on_tick: OnTick,
    on_start: LifecycleHook | None = None,
    on_end: LifecycleHook | None = None,
) -> None:
    if _is_browser_runtime():
        _register_bot(on_tick, on_start, on_end)
        return
    _run_stdio_bot(on_tick, on_start, on_end)


def call_registered_bot(bot_id: int, observation_json: str) -> str:
    on_tick = _registered_on_tick.get(bot_id)
    if on_tick is None:
        raise RuntimeError(f"bot {bot_id} did not call run_bot")
    payload = json.loads(observation_json)
    response, was_started = _handle_payload(
        payload, on_tick,
        _registered_on_start.get(bot_id),
        _started.get(bot_id, False),
    )
    _started[bot_id] = was_started
    return json.dumps(response if response is not None else {"orders": []})


def clear_registered_bot(bot_id: int) -> None:
    on_end = _registered_on_end.pop(bot_id, None)
    if on_end is not None:
        on_end(None)
    _registered_on_tick.pop(bot_id, None)
    _registered_on_start.pop(bot_id, None)
    _registered_on_end.pop(bot_id, None)
    _started.pop(bot_id, None)


def _register_bot(on_tick: OnTick, on_start: LifecycleHook | None, on_end: LifecycleHook | None) -> None:
    bot_id = _resolve_bot_id()
    _registered_on_tick[bot_id] = on_tick
    _registered_on_start[bot_id] = on_start
    _registered_on_end[bot_id] = on_end
    _started[bot_id] = False


def _resolve_bot_id() -> int:
    import builtins
    return getattr(builtins, "__robolocks_bot_id", 1)


def _run_stdio_bot(on_tick: OnTick, on_start: LifecycleHook | None, on_end: LifecycleHook | None) -> None:
    started = False
    for line in sys.stdin:
        payload = json.loads(line)
        response, started = _handle_payload(payload, on_tick, on_start, started)
        if response is not None:
            print(json.dumps(response), flush=True)
    if on_end is not None:
        on_end(None)


def _handle_payload(
    payload: dict,
    on_tick: OnTick,
    on_start: LifecycleHook | None,
    started: bool,
) -> tuple[dict | None, bool]:
    if payload.get("type") == "start":
        if on_start is not None:
            on_start(UnitSpec.from_json(payload["spec"]))
        return None, True
    if on_start is not None and not started:
        on_start(None)
    state = BattleState.from_json(payload)
    orders = list(on_tick(state))
    return {"orders": [_order_to_json(order) for order in orders]}, True


def _order_to_json(order: OrderLike) -> dict:
    if hasattr(order, "to_json"):
        return order.to_json()
    return dict(order)
