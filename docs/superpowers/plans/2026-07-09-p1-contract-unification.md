# P1 Contract Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate hand-synchronized copies of the frame/observation JSON contract across C++ engine, CLI, WASM C API, Python SDK, and the web frontend, so every boundary consumes one source of truth.

**Architecture:** (1) The Python SDK becomes single-source: the browser copy embedded in `research.ts` is replaced by build-time codegen from `sdk/python/robolocks/`, after merging the two `runtime.py` execution models. (2) Engine frame serialization becomes single-source: a shared `snapshot_json` module feeds both the CLI JSONL/replay writer and a new coarse-grained `frame_json` C API that replaces ~85 scalar getters; the web `kernelAdapter` then parses frames with the same parser the replay loader uses. (3) Golden fixture contract tests pin the schema across C++/Python/TS.

**Tech Stack:** C++17 + nlohmann/json + Catch2 (ctest), Python 3 stdlib (unittest), TypeScript + Vite + `node --experimental-strip-types --test`, Emscripten (scripts/build.sh).

## Global Constraints

- Never break the green baseline: engine `scripts/build.sh cli -d test` (79 tests) and `cd web && npm test` (9 files) must pass at the end of every task.
- CLI JSON output field names and structure must remain backward compatible (existing web replay parser and cmake stream tests parse it structurally); adding fields is allowed, renaming/removing is not.
- JSON key naming: camelCase with unit suffixes (`rangeMeters`, `headingDegrees`); Python attribute naming: snake_case without unit duplication where already established.
- Commit after every task with a `refactor:`/`feat:`/`test:` prefix message; end commit messages with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (pass each paragraph as a separate `-m` flag — the shell mangles embedded newlines).
- Working directory: `/Users/sangwonl/Develops/projects/robolocks`. Do not commit `fixtures/replays/test.replay.json` (stray scratch file, handled in Task 3).
- Web tests run via `npm test` = `node --experimental-strip-types --test tests/*.test.mjs` — NO Vite in the test path, so no `?raw` imports anywhere; generated TS files only.

---

### Task 1: Merge the two runtime.py execution models into the real SDK

**Files:**
- Modify: `sdk/python/robolocks/runtime.py`
- Create: `sdk/python/tests/__init__.py` (empty), `sdk/python/tests/test_runtime.py`
- Modify: `CMakeLists.txt` (register the python unittest as a ctest)

**Context:** `sdk/python/robolocks/runtime.py` currently has only the stdin-loop `run_bot`. The browser copy (in `web/src/research/research.ts`, key `"robolocks/runtime.py"`) has a registration model: `run_bot` stores callbacks, JS calls `call_registered_bot(observation_json) -> str` per tick and `clear_registered_bot()` on teardown. Task 2 will make the browser consume this file verbatim, so both models must coexist here.

**Interfaces:**
- Produces: `run_bot(on_tick, on_start=None, on_end=None)` — in browser (detected via `_is_browser_runtime()`, i.e. `sys.platform == "emscripten"`) registers callbacks and returns; otherwise runs the existing stdin loop. `call_registered_bot(observation_json: str) -> str`, `clear_registered_bot() -> None` — exact semantics of the embedded copy (start payload returns `{"orders": []}`; missing registration raises `RuntimeError("bot did not call run_bot")`; `clear_registered_bot` fires `on_end(None)` if set). Shared core `_handle_payload(payload, on_tick, on_start, started) -> tuple[dict | None, bool]` returning `(response_or_None_for_start, started)`.

- [ ] **Step 1: Write the failing test**

`sdk/python/tests/test_runtime.py`:

```python
import json
import unittest
from unittest import mock

from robolocks import runtime


def _observation(tick: int) -> str:
    return json.dumps({
        "tick": tick,
        "self": {"unitId": 1, "position": {"x": 0.0, "y": 0.0}, "hullHeadingDegrees": 0.0},
        "contacts": [],
    })


class RegisteredBotTest(unittest.TestCase):
    def tearDown(self):
        runtime.clear_registered_bot()

    def test_run_bot_registers_in_browser_runtime(self):
        seen = []
        with mock.patch.object(runtime, "_is_browser_runtime", return_value=True):
            runtime.run_bot(lambda state: seen.append(state.tick) or [])
        response = json.loads(runtime.call_registered_bot(_observation(7)))
        self.assertEqual(response, {"orders": []})
        self.assertEqual(seen, [7])

    def test_start_payload_invokes_on_start_and_returns_no_orders(self):
        specs = []
        with mock.patch.object(runtime, "_is_browser_runtime", return_value=True):
            runtime.run_bot(lambda state: [], on_start=specs.append)
        start = json.dumps({"type": "start", "spec": {
            "unitId": 1, "name": "b", "teamId": 1,
            "position": {"x": 0.0, "y": 0.0}, "headingDegrees": 0.0, "modules": {},
        }})
        self.assertEqual(json.loads(runtime.call_registered_bot(start)), {"orders": []})
        self.assertEqual(len(specs), 1)

    def test_call_without_registration_raises(self):
        with self.assertRaises(RuntimeError):
            runtime.call_registered_bot(_observation(1))

    def test_clear_fires_on_end(self):
        ended = []
        with mock.patch.object(runtime, "_is_browser_runtime", return_value=True):
            runtime.run_bot(lambda state: [], on_end=ended.append)
        runtime.clear_registered_bot()
        self.assertEqual(ended, [None])
```

Adapt the observation/spec payload dicts to whatever `BattleState.from_json` / `UnitSpec.from_json` actually require (read `sdk/python/robolocks/state.py` / `spec.py` — required keys raise `KeyError`, e.g. `position` and `hullHeadingDegrees` on units); the assertions above are the contract.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sdk/python && python3 -m unittest discover -s tests -v`
Expected: FAIL / ERROR with `AttributeError: ... has no attribute '_is_browser_runtime'` (or `call_registered_bot`).

- [ ] **Step 3: Implement the merged runtime.py**

Replace `sdk/python/robolocks/runtime.py` with the merged model (preserve the existing stdin behavior byte-for-byte in effect — the engine test `python bot controller ...` depends on it):

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd sdk/python && python3 -m unittest discover -s tests -v` — expected: all PASS.

- [ ] **Step 5: Register the python unit test in ctest**

In the root `CMakeLists.txt`, next to the existing test registrations (find where `python_bot_controller_test` or `add_test` entries live; follow local style):

```cmake
find_package(Python3 COMPONENTS Interpreter)
if(Python3_FOUND)
  add_test(
    NAME "python sdk runtime unit tests"
    COMMAND ${Python3_EXECUTABLE} -m unittest discover -s ${CMAKE_SOURCE_DIR}/sdk/python/tests
    WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}/sdk/python
  )
endif()
```

(If `Python3` is already located elsewhere in the file, reuse that. `WORKING_DIRECTORY` must be `sdk/python` so `robolocks` is importable.)

- [ ] **Step 6: Run the full engine suite**

Run: `scripts/build.sh cli -d test`
Expected: 80/80 pass (79 + the new python test). The `python bot controller ...` tests exercise the stdin path against the modified runtime.

- [ ] **Step 7: Commit**

```bash
git add sdk/python/robolocks/runtime.py sdk/python/tests CMakeLists.txt
git commit -m "refactor: support browser registration model in sdk runtime" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Generate the browser SDK bundle from sdk/python at build time

**Files:**
- Create: `web/scripts/gen-python-sdk.mjs`
- Create (generated, gitignored): `web/src/research/pythonSdkFiles.generated.ts`
- Create: `web/tests/pythonSdkFiles.test.mjs`
- Modify: `web/package.json` (scripts), `web/src/research/research.ts` (delete `PYTHON_SDK_FILES` literal, lines ~516–end-of-map; import generated), `.gitignore`

**Interfaces:**
- Consumes: Task 1's merged `runtime.py` (the generated bundle must contain `call_registered_bot`, which `research.ts` invokes via `pyodide.runPython`).
- Produces: `export const PYTHON_SDK_FILES: Record<string, string>` from `web/src/research/pythonSdkFiles.generated.ts`, keys `robolocks/<name>.py` for every `.py` file in `sdk/python/robolocks/` (sorted, `__pycache__` excluded); consumed by `installPythonSdk()` in `research.ts` unchanged.

- [ ] **Step 1: Write the codegen script**

`web/scripts/gen-python-sdk.mjs`:

```js
#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sdkDir = resolve(scriptDir, "../../sdk/python/robolocks");
const outPath = resolve(scriptDir, "../src/research/pythonSdkFiles.generated.ts");

const files = readdirSync(sdkDir)
  .filter((name) => name.endsWith(".py"))
  .sort();

const entries = files.map((name) => {
  const contents = readFileSync(join(sdkDir, name), "utf8");
  return `  ${JSON.stringify(`robolocks/${name}`)}: ${JSON.stringify(contents)},`;
});

const banner =
  "// Generated by scripts/gen-python-sdk.mjs from sdk/python/robolocks — do not edit.";
writeFileSync(
  outPath,
  `${banner}\nexport const PYTHON_SDK_FILES: Record<string, string> = {\n${entries.join("\n")}\n};\n`,
);
console.log(`generated ${outPath} (${files.length} files)`);
```

- [ ] **Step 2: Write the failing contract test**

`web/tests/pythonSdkFiles.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PYTHON_SDK_FILES } from "../src/research/pythonSdkFiles.generated.ts";

const sdkDir = resolve(import.meta.dirname, "../../sdk/python/robolocks");

test("generated python sdk bundle matches sdk/python sources", () => {
  const files = readdirSync(sdkDir).filter((n) => n.endsWith(".py")).sort();
  assert.deepEqual(
    Object.keys(PYTHON_SDK_FILES).sort(),
    files.map((n) => `robolocks/${n}`),
  );
  for (const name of files) {
    assert.equal(PYTHON_SDK_FILES[`robolocks/${name}`], readFileSync(join(sdkDir, name), "utf8"));
  }
});

test("bundle contains the browser registration entrypoints", () => {
  const runtime = PYTHON_SDK_FILES["robolocks/runtime.py"];
  assert.match(runtime, /def call_registered_bot\(/);
  assert.match(runtime, /def clear_registered_bot\(/);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && npm test` — expected: FAIL, `Cannot find module .../pythonSdkFiles.generated.ts`.

- [ ] **Step 4: Wire scripts and generate**

In `web/package.json` `"scripts"`, add:

```json
"gen:sdk": "node scripts/gen-python-sdk.mjs",
"predev": "npm run gen:sdk",
"prebuild": "npm run gen:sdk",
"pretest": "npm run gen:sdk",
"pretypecheck": "npm run gen:sdk"
```

Append to the repository `.gitignore`:

```
web/src/research/pythonSdkFiles.generated.ts
```

Run `cd web && npm run gen:sdk` — file appears.

- [ ] **Step 5: Swap research.ts to the generated bundle**

In `web/src/research/research.ts`: delete the entire `const PYTHON_SDK_FILES: Record<string, string> = { ... }` literal (from its declaration to the closing `};` — roughly lines 516 to end of the map, ~600 lines) and add at the top:

```ts
import { PYTHON_SDK_FILES } from "./pythonSdkFiles.generated";
```

`installPythonSdk()` stays untouched. Nothing else in the file references the deleted literal — verify with `grep -n "PYTHON_SDK_FILES" web/src/research/research.ts` (exactly two hits: import + use in installPythonSdk).

- [ ] **Step 6: Verify no drifted API usage remains**

Run: `grep -rn "min_age=\|HasXY\|VecProtocol" web/src web/tests` — expected: no hits (the default bot preset uses neither; the real SDK's `min_age_ticks`/`HasXY` are now canonical).

- [ ] **Step 7: Run tests and typecheck**

Run: `cd web && npm test && npm run typecheck` — expected: all pass (pretest/pretypecheck regenerate the bundle first).

- [ ] **Step 8: Commit**

```bash
git add web/scripts/gen-python-sdk.mjs web/tests/pythonSdkFiles.test.mjs web/package.json web/src/research/research.ts .gitignore
git commit -m "refactor: generate browser python sdk bundle from sdk/python" -m "Removes the hand-copied 600-line SDK duplicate inside research.ts." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(`pythonSdkFiles.generated.ts` is gitignored — must NOT be committed.)

---

### Task 3: Shared snapshot serializers; CLI stops hand-rolling JSON

**Files:**
- Create: `engine/include/robolocks/snapshot_json.hpp`, `engine/src/snapshot_json.cpp`
- Create: `engine/tests/snapshot_json_test.cpp`
- Modify: `engine/src/controller_protocol_json.cpp` (delegate/move shared serializers), `engine/cli/main.cpp` (delete all `print_*_json` hand-rolled emitters, use `nlohmann::json::dump()`), `engine/include/robolocks/snapshot.hpp` + `engine/src/battle_simulation.cpp` (add `name`/`team_id` to `UnitSnapshot`), `CMakeLists.txt` (new source/test)
- Create: `scripts/regen-replay-fixtures.sh`; regenerate `fixtures/replays/*.replay.json`; delete stray `fixtures/replays/test.replay.json`

**Interfaces:**
- Produces (in namespace matching existing engine code, declared in `snapshot_json.hpp`):
  - `nlohmann::json unit_snapshot_to_json(const UnitSnapshot&)` (moved/shared from controller_protocol_json.cpp, now also emitting `"name"` and `"teamId"`)
  - `nlohmann::json snapshot_to_json(const WorldSnapshot&)` — the full per-tick frame object `{tick, units, projectiles, events, actions, ruleState, ...}` exactly matching today's CLI stream/replay frame schema (plus the additive fields listed below)
  - `nlohmann::json event_to_json(...)`, `nlohmann::json action_to_json(...)`, `nlohmann::json rule_state_to_json(...)`, `nlohmann::json obstacle_to_json(const ObstacleSpec&)`, `nlohmann::json unit_modules_to_json(...)` (reuse existing ones; make file-private helpers public where needed)
  - `to_string(OrderKind)`, `to_string(OrderChannel)`, `to_string(WeaponFireMode)`, `to_string(BodyShapeType)` declared next to the enum definitions (`order.hpp` / `battle_config.hpp`), replacing the copies in `c_api.cpp` and `cli/main.cpp`
- Additive schema changes (allowed): unit frames gain `name` + `teamId`; CLI frames gain `ruleState` and event `payload` (they come free from the shared serializer); scan-arc actions emit `rangeMeters` (CLI previously dropped it).
- Consumed by: Task 4 (`c_api` frame endpoint calls `snapshot_to_json`), Task 5 (golden fixture asserts on `snapshot_to_json` output).

- [ ] **Step 1: Read before writing.** Read `engine/cli/main.cpp` (all `print_*` functions), `engine/src/controller_protocol_json.cpp`, `engine/include/robolocks/snapshot.hpp`, and one tracked replay fixture (`fixtures/replays/howitzer_duel_v0.replay.json`, first ~50 lines) to capture the exact current frame schema. The shared serializer must reproduce the CLI's field names exactly (camelCase; the cmake tests `engine/tests/cli_stream_test.cmake` / `cli_replay_test.cmake` parse structurally, and web replay tests parse the fixtures).

- [ ] **Step 2: Write the failing test** — `engine/tests/snapshot_json_test.cpp` (Catch2, follow `controller_protocol_json_test.cpp` style). Build a small `WorldSnapshot` by hand (one unit with modules + one event + one action + rule state) and assert on `snapshot_to_json`:

```cpp
TEST_CASE("snapshot_to_json emits the frame schema") {
  WorldSnapshot snapshot; // populate: tick, one UnitSnapshot (id, name, team, pose, modules, intents), one event, one action
  // ... construct as in battle_simulation_test.cpp helpers ...
  const nlohmann::json frame = snapshot_to_json(snapshot);
  REQUIRE(frame["tick"] == snapshot.tick);
  REQUIRE(frame["units"][0]["name"] == "blue_1");
  REQUIRE(frame["units"][0]["teamId"] == 1);
  REQUIRE(frame["units"][0]["modules"]["turret"].contains("headingDegrees"));
  REQUIRE(frame["units"][0]["bodyShape"].contains("type"));
  // actions: scanArc rangeMeters must survive
  // events: payload object must survive
}
```

Register in `CMakeLists.txt` alongside the other engine tests. Run the single test target; expected: compile FAIL (`snapshot_json.hpp` missing).

- [ ] **Step 3: Implement `snapshot_json.{hpp,cpp}`.** Move (don't copy) the file-private serializer helpers out of `controller_protocol_json.cpp` into `snapshot_json.cpp`, declare them in the new header, and have `controller_protocol_json.cpp` include/use them. Add `name` (std::string) and `team_id` (std::uint32_t) to `UnitSnapshot` in `snapshot.hpp`; populate them in `battle_simulation.cpp` where the snapshot is built (the spec has both). Emit `"name"`/`"teamId"` in `unit_snapshot_to_json`.

- [ ] **Step 4: Rewrite the CLI emitters.** In `engine/cli/main.cpp` delete `print_snapshot_json`, `print_modules_json`, `print_intents_json`, `print_body_shape_json`, `print_events_json_compact`, `print_actions_json_compact` and the local `order_kind_name`/`order_channel_name`/fire-mode/body-shape string maps; replace with `snapshot_to_json(...).dump()` (stream mode) and the same object accumulated into the replay array (replay mode). Keep the surrounding CLI flags/IO logic untouched.

- [ ] **Step 5: Run the engine suite**: `scripts/build.sh cli -d test` — expected: 81/81 pass (80 + snapshot_json_test). If a cmake CLI test fails, diff its expectation — only additive fields should have changed; fix the serializer, not the test, unless the test asserts absence.

- [ ] **Step 6: Regenerate replay fixtures.** Create `scripts/regen-replay-fixtures.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="${CLI:-$ROOT_DIR/build-cli-release/robolocks}"  # adjust to the actual binary path/name found in the build dir
"$CLI" run --battle "$ROOT_DIR/fixtures/matches/howitzer_duel_v0.json" --replay-out "$ROOT_DIR/fixtures/replays/howitzer_duel_v0.replay.json"
"$CLI" run --battle "$ROOT_DIR/fixtures/matches/preset_duel_python_v0.json" --replay-out "$ROOT_DIR/fixtures/replays/preset_duel_python_v0.replay.json"
```

First discover the real CLI invocation from `engine/tests/cli_replay_test.cmake` and the real fixture inputs in `fixtures/` — adjust paths/flags to match, then `chmod +x` and run it (build release CLI first: `scripts/build.sh cli`). Delete `fixtures/replays/test.replay.json`.

- [ ] **Step 7: Web regression**: `cd web && npm test` — replay tests parse the regenerated fixtures; expected pass (parsers use tolerant field extractors; new fields are additive). Then `npm run typecheck`.

- [ ] **Step 8: Commit**

```bash
git add engine web/tests CMakeLists.txt scripts/regen-replay-fixtures.sh fixtures/replays
git commit -m "refactor: single shared frame serializer for CLI and protocol" -m "cli/main.cpp no longer hand-rolls JSON; unit frames carry name/teamId; replay fixtures regenerated via scripts/regen-replay-fixtures.sh." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Coarse-grained frame JSON C API; kernelAdapter parses frames like replays

**Files:**
- Modify: `engine/include/robolocks/c_api.h`, `engine/src/c_api.cpp` — add `robolocks_battle_runner_frame_json`, delete the per-field scalar getters; wrap `create_from_json` in try/catch
- Modify: `engine/tests/c_api_test.cpp` — assert on parsed frame JSON instead of scalar getters
- Create: `web/src/replay/frameParsing.ts` — frame-parsing helpers extracted from `web/src/replay/replay.ts`
- Modify: `web/src/replay/replay.ts` (use extracted helpers), `web/src/sim/kernelAdapter.ts` (drop ~85 cwraps + scalar readers; parse `frame_json`), `web/tests/kernelAdapter.test.mjs` (fake module exposes `frame_json`)
- Delete: `web/src/sim/simWorker.ts`, `SimWorkerRequest`/`SimWorkerResponse` in `web/src/types/protocol.ts`, `createFallbackPresetDuel` in `kernelAdapter.ts` + its test case (dead code; nothing imports the worker — verified)
- Rebuild wasm: `scripts/build.sh wasm && scripts/build.sh sync`

**Interfaces:**
- Consumes: `snapshot_to_json(const WorldSnapshot&)` from Task 3.
- Produces:
  - C: `const char* robolocks_battle_runner_frame_json(RobolocksBattleRunner*)` — returns the current frame as a JSON string (same schema as a replay frame; string owned by the runner handle, valid until next call/step/destroy — same pattern as the existing `unit_modules_json`). Returns `nullptr` on error. `robolocks_battle_runner_create_from_json` catches all exceptions and returns `nullptr` instead of unwinding across the C ABI (record message via the existing error/last-error mechanism if one exists; otherwise add `const char* robolocks_last_error(void)`).
  - Keep: create/destroy/step/tick-rate/json-bot-callback/config entry points. Delete: every `robolocks_battle_runner_unit_*` / `..._projectile_*` / `..._event_*` / `..._action_*` / `..._intent_*` / `..._score_*` scalar getter that `frame_json` now covers (keep `unit_modules_json` only if something still uses it — fold it into the frame otherwise).
  - TS: `parseFrame(raw: unknown): ReplayFrame` exported from `web/src/replay/frameParsing.ts`, used by BOTH `replay.ts` (file loading) and `kernelAdapter.ts` (live frames) — this removes the duplicated `parseModules`/`stringField`/`numberField`/`vec3Field`/`defaultModules`/`defaultEventPayload`/`unitName` pairs. Real `name`/`teamId` from Task 3 replace the fabricated `unitName(unitId)` mapping — units without a name fall back to `Unit <id>`, team color derives from `teamId` (default 0), not from the name string.
- `KernelBattleRunner`'s public TS interface (what research.ts/app.tsx consume) must remain source-compatible; only its internals change. Check `web/src/research/research.ts` usage (`createResearchDuelWithJsonBotFromWasmFactory`, `step`, snapshot reads) and keep those signatures.

- [ ] **Step 1: Engine failing test.** In `engine/tests/c_api_test.cpp` add a test that creates a runner (reuse the existing test's config JSON), steps once, calls `robolocks_battle_runner_frame_json`, parses with nlohmann, and asserts `frame["units"][0].contains("name")`, `frame.contains("ruleState")`, tick value, projectile/event arrays present. Run: build + run c_api_test → FAIL (symbol missing).
- [ ] **Step 2: Implement `frame_json` in `c_api.cpp`** on top of `snapshot_to_json`; cache the dumped string in the handle struct (like the existing modules-json buffer). Wrap `create_from_json` bodies in `try { ... } catch (const std::exception&) { return nullptr; }`.
- [ ] **Step 3: Delete the scalar getters** from `c_api.h`/`c_api.cpp`; migrate every remaining use in `c_api_test.cpp` to frame-JSON assertions. Run: `scripts/build.sh cli -d test` → all pass.
- [ ] **Step 4: Extract `web/src/replay/frameParsing.ts`.** Move the frame/unit/modules/event/action parsing helpers out of `replay.ts` into the new module, export `parseFrame`; `replay.ts` imports it. Add `name`/`teamId` parsing (fallbacks: `Unit <id>` / 0). Run `cd web && npm test` → replay tests still pass.
- [ ] **Step 5: Migrate `kernelAdapter.ts`.** Replace the cwrap block and the `readSnapshot`/`readEvents`/`readActions`/`readProjectiles`/`readRuleState` scalar-threading with: cwrap `robolocks_battle_runner_frame_json` → `JSON.parse` → `parseFrame`. Delete `defaultModules`/`parseUnitModules`/field-helpers/`unitName`/`defaultEventPayload` locals. Delete `simWorker.ts`, its protocol types, `createFallbackPresetDuel` and its test. Update `web/tests/kernelAdapter.test.mjs`: the fake wasm module now needs only create/step/destroy/frame_json (+ bot callback plumbing) — assert a stepped frame exposes units with names and events with payloads.
- [ ] **Step 6: Rebuild wasm and sync**: `scripts/build.sh wasm && scripts/build.sh sync`. Then `cd web && npm test && npm run typecheck && npm run build` → all green.
- [ ] **Step 7: Commit**

```bash
git add engine web CMakeLists.txt
git commit -m "refactor: replace per-field wasm getters with frame_json endpoint" -m "kernelAdapter and replay loader now share one frame parser; removes ~85 scalar FFI functions and the dead simWorker path." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Golden fixture contract tests across C++/Python/TS

**Files:**
- Create: `fixtures/contracts/frame.golden.json` (one canonical replay frame), `fixtures/contracts/observation.golden.json` (one canonical bot observation)
- Create: `engine/tests/contract_golden_test.cpp`, `sdk/python/tests/test_contract.py`, `web/tests/contract.test.mjs`
- Modify: `CMakeLists.txt` (register C++ test), `sdk/python/robolocks/state.py` (only if a phantom field surfaces — see Step 3)

**Interfaces:**
- Consumes: `snapshot_to_json`/`observation_to_json` (Task 3), `parseFrame` (Task 4), `BattleState.from_json` (SDK).
- Produces: two checked-in golden JSON files that every side asserts against. Schema-change workflow from now on: update the golden once → three test suites point at every stale mirror.

- [ ] **Step 1: Generate the goldens from the engine.** In `contract_golden_test.cpp`, build a fully-populated canonical `WorldSnapshot` (2 units on 2 teams with distinct module values, 1 projectile, 1 event with payload, 1 scan-arc action with `rangeMeters`, non-empty rule state) and a canonical observation. First run the test in "bless" mode manually: dump `snapshot_to_json(...).dump(2)` to `fixtures/contracts/frame.golden.json` and `observation_to_json(...).dump(2)` to `observation.golden.json` (a temporary `WRITE_GOLDEN` env-var branch in the test is fine and may stay for future re-blessing).
- [ ] **Step 2: C++ assertion.** The test's normal mode: `REQUIRE(snapshot_to_json(canonical_snapshot()) == nlohmann::json::parse(read_file(".../frame.golden.json")))` and same for observation. Register in CMake with the fixture path passed like the existing fixture-using tests do. Run `scripts/build.sh cli -d test` → pass.
- [ ] **Step 3: Python assertion.** `sdk/python/tests/test_contract.py`: load `observation.golden.json`, `BattleState.from_json(...)`, assert every typed field (tick, own unit position/heading/module values, contact fields, obstacle fields, projectile contacts). Then assert there is no silently-defaulted field: for each dataclass field asserted, its value must equal the golden's value, not the default. If `UnitState.from_json` reads a key the engine never emits (the old phantom `name` — Task 3 made the engine emit `name`, so verify it now round-trips), fix `state.py` accordingly. Run `cd sdk/python && python3 -m unittest discover -s tests` → pass.
- [ ] **Step 4: TS assertion.** `web/tests/contract.test.mjs`: `parseFrame` over `frame.golden.json`, assert unit `name`, `teamId`, `modules.turret.headingDegrees`, `bodyShape.type`, event payload fields, scan-arc `rangeMeters`, ruleState fields — every field the golden carries must survive parsing (no default-swallowing). Extend `web/src/types/protocol.ts` types where fields are missing (e.g. turret `headingDegrees`, body `shape`) so typecheck enforces them. Run `cd web && npm test && npm run typecheck` → pass.
- [ ] **Step 5: Full suites**: `scripts/build.sh cli -d test` and `cd web && npm test` → all green.
- [ ] **Step 6: Commit**

```bash
git add fixtures/contracts engine/tests/contract_golden_test.cpp sdk/python/tests/test_contract.py web/tests/contract.test.mjs web/src/types/protocol.ts sdk/python/robolocks/state.py CMakeLists.txt
git commit -m "test: golden fixture contract tests across engine, sdk, and web" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- Coverage: review items 1 (Tasks 1–2), 4 (Task 3), 3 (Task 4), 2 (Task 5) — all four P1 items have tasks; item 9 (dead simWorker) pulled forward into Task 4 because the kernelAdapter API change would otherwise break its compile.
- Type consistency: `PYTHON_SDK_FILES` name kept identical across Task 2 files; `parseFrame` defined in Task 4 and consumed in Task 5; `snapshot_to_json` defined in Task 3 and consumed in Tasks 4–5; `name`/`teamId` additive fields introduced once in Task 3 and asserted in Tasks 4–5.
- Known judgment calls for implementers: exact C++ namespace/style must follow the existing headers; CLI flag surface unchanged; fixture regeneration flags must be read from `cli_replay_test.cmake` rather than guessed.
