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

_registered_on_tick: OnTick | None = None
_registered_on_start: LifecycleHook | None = None
_registered_on_end: LifecycleHook | None = None
_started = False


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


def call_registered_bot(observation_json: str) -> str:
    global _started
    if _registered_on_tick is None:
        raise RuntimeError("bot did not call run_bot")
    payload = json.loads(observation_json)
    response, _started = _handle_payload(payload, _registered_on_tick, _registered_on_start, _started)
    return json.dumps(response if response is not None else {"orders": []})


def clear_registered_bot() -> None:
    global _registered_on_tick, _registered_on_start, _registered_on_end, _started
    if _registered_on_end is not None:
        _registered_on_end(None)
    _registered_on_tick = None
    _registered_on_start = None
    _registered_on_end = None
    _started = False


def _register_bot(on_tick: OnTick, on_start: LifecycleHook | None, on_end: LifecycleHook | None) -> None:
    global _registered_on_tick, _registered_on_start, _registered_on_end, _started
    _registered_on_tick = on_tick
    _registered_on_start = on_start
    _registered_on_end = on_end
    _started = False


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
