# P2 Engine Internals Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the engine's internal duplication (math helpers, JSON parse helpers, per-channel intent field groups) and decompose its two god functions (`BattleSimulation::step`, `resolve_weapon_fire`) so systems have a consistent shape — with zero change to any emitted JSON.

**Architecture:** Pure internal refactors behind the contract locked in by P1. The tri-language golden contract tests (fixtures/contracts/) plus the order-sensitive CLI cmake tests are the schema safety net: any task that changes emitted JSON has a bug. Struct-ification (intents) and decomposition (step phases, projectile system) reshape private code only; serializers adapt their input mapping, never their output keys.

**Tech Stack:** C++17 + nlohmann/json (ordered_json for serializers) + Catch2 via `scripts/build.sh cli -d test`; web suite `cd web && npm test` as regression canary.

## Global Constraints

- Emitted JSON is frozen: `fixtures/contracts/frame.golden.json` and `observation.golden.json` must pass UNCHANGED (no re-blessing in this plan). CLI cmake substring tests likewise.
- Green baseline at the end of every task: `scripts/build.sh cli -d test` (86 tests at P2 start) and `cd web && npm test` + `npm run typecheck`.
- Engine naming conventions: `snake_case`, unit suffixes `_m`/`_deg`/`_ticks`; headers under `engine/include/robolocks/`, sources under `engine/src/`.
- Error-message prefixes asserted by `battle_loader_test.cpp` / `controller_protocol_json_test.cpp` must be preserved unless a step explicitly says to update the test.
- Commit per task: `refactor:` prefix, trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`, each paragraph as a separate `-m` flag.
- Work from `/Users/sangwonl/Develops/projects/robolocks`.

---

### Task 1: Consolidate math/geometry helpers into math.hpp

**Files:**
- Modify: `engine/include/robolocks/math.hpp`, `engine/src/math.cpp`, `engine/tests/math_test.cpp`
- Modify (delete local copies): `engine/src/battle_simulation.cpp`, `engine/src/actuator_system.cpp`, `engine/src/intent_state.cpp`, `engine/src/projectile_system.cpp`, `engine/src/sensor_system.cpp`, `engine/src/physics_system.cpp`, `engine/src/combat_resolution.cpp`
- ~~Modify: `engine/src/snapshot_json.cpp` + `engine/include/robolocks/snapshot_json.hpp` (make `vec2_to_json` file-private)~~ DROPPED during execution: `controller_protocol_json.cpp:126` calls it cross-TU — the P1 final-review premise was stale.

**Interfaces:**
- Produces in `robolocks::` (math.hpp): `inline constexpr double kPi`, `double distance(Vec2, Vec2)`, `double dot(Vec2, Vec2)`, `Vec2 forward_vector(double heading_deg)`, `Vec2 right_vector(double heading_deg)`, `bool segment_intersects_circle(Vec2 a, Vec2 b, Vec2 center, double radius)`, `double collision_radius(const BodyShapeSpec&)`.
- Duplicates to delete (verify each with grep before/after): `distance_between` in battle_simulation.cpp/actuator_system.cpp/intent_state.cpp/projectile_system.cpp, `distance` in sensor_system.cpp; `forward_vector` in actuator_system.cpp/projectile_system.cpp; `collision_radius_for_shape` in battle_simulation.cpp/projectile_system.cpp; `segment_intersects_circle` in projectile_system.cpp AND sensor_system.cpp (two different implementations — read both; if they differ semantically (e.g. endpoint inclusivity), keep the projectile one as canonical and confirm sensor tests still pass, since sensor LOS tests are the behavioral authority); local `kPi` in sensor/actuator/combat/physics/projectile; `dot` in physics_system.cpp/projectile_system.cpp.

- [ ] **Step 1:** Read math.hpp/math_test.cpp; write failing tests in math_test.cpp for each new helper (distance of a 3-4-5 triangle == 5, dot orthogonal == 0, forward_vector(0/90) axes, right_vector(0), segment_intersects_circle hit/miss/tangent, collision_radius for circle=radius and box=half-diagonal — read the existing local impls first and encode THEIR current behavior, not an idealized one).
- [ ] **Step 2:** Run the math test target → FAIL (missing symbols).
- [ ] **Step 3:** Implement in math.hpp/math.cpp by moving the canonical copies; delete every local duplicate and switch call sites; make `vec2_to_json` file-private in snapshot_json.cpp.
- [ ] **Step 4:** `grep -rn "distance_between\|collision_radius_for_shape\|3\.14159" engine/src engine/cli` → only math.hpp/math.cpp hits remain.
- [ ] **Step 5:** Full suite `scripts/build.sh cli -d test` → all pass (goldens + sensor/projectile/physics tests prove behavior preserved). `cd web && npm test` → pass.
- [ ] **Step 6:** Commit (`refactor: consolidate math and geometry helpers into math.hpp`).

---

### Task 2: Shared JSON field readers and enum from_string

**Files:**
- Create: `engine/include/robolocks/json_field.hpp` (or engine/src-internal header if include/ is for public API only — follow where snapshot_json.hpp lives)
- Modify: `engine/src/battle_loader.cpp`, `engine/src/controller_protocol_json.cpp` (delete their duplicated `required_number`/`optional_number`/`required_string`/`required_vec2` helper sets)
- Modify: `engine/include/robolocks/order.hpp`, `engine/include/robolocks/battle_config.hpp` (add `from_string` parsers next to the `to_string` functions P1 placed there); delete the string→enum maps from battle_loader.cpp and controller_protocol_json.cpp

**Interfaces:**
- Produces: `json_field.hpp` typed getters taking an error-context string, signatures modeled on the existing duplicated helpers (read both copies first — they differ only in error-message suffix; the shared version takes the context/prefix as a parameter so BOTH existing message formats can be reproduced exactly).
- Produces: `OrderKind order_kind_from_string(std::string_view)`, `OrderChannel order_channel_from_string(...)`, `WeaponFireMode weapon_fire_mode_from_string(...)`, `BodyShapeType body_shape_type_from_string(...)` — throwing `std::runtime_error` with the same messages the current parsers throw.

- [ ] **Step 1:** Read both helper sets and both enum-map sites; diff them; note every error-message format that `battle_loader_test.cpp` / `controller_protocol_json_test.cpp` asserts.
- [ ] **Step 2:** No new behavior → no new failing test; instead the existing loader/protocol tests are the spec. Implement json_field.hpp + from_string functions; migrate both parsers; delete the duplicates.
- [ ] **Step 3:** `scripts/build.sh cli -d test` → all pass with UNCHANGED error-message assertions (if a message must change, stop: that's a finding to report, not a test to edit silently).
- [ ] **Step 4:** Commit (`refactor: share json field readers and enum parsing`).

---

### Task 3: Extract step-result types out of battle_simulation.hpp

**Files:**
- Create: `engine/include/robolocks/step_result.hpp`
- Modify: `engine/include/robolocks/battle_simulation.hpp` (moves types out, includes the new header), `engine/include/robolocks/snapshot_json.hpp` (include step_result.hpp INSTEAD of battle_simulation.hpp), any TU that included battle_simulation.hpp only for these types

**Interfaces:**
- Produces: `step_result.hpp` holding exactly the types the serializer layer needs: `Event` (+ its payload struct if separate), `UnitOrders`, `BattleRuleState` (+ score/zone structs it embeds), `StepResult`. Move, don't copy; battle_simulation.hpp re-exposes them via include so no other call site changes.
- Rationale (from P1 final review): Task 5's `step()` decomposition will churn battle_simulation.hpp; the serializer header must not rebuild/friction on it.

- [ ] **Step 1:** Read battle_simulation.hpp; identify the exact type set + their dependencies (Tick, Vec2 from types.hpp etc.).
- [ ] **Step 2:** Move them to step_result.hpp; swap snapshot_json.hpp's include; build.
- [ ] **Step 3:** Full suite → pass. Commit (`refactor: extract step result types into step_result.hpp`).

---

### Task 4: Struct-ify per-channel intent state

**Files:**
- Modify: `engine/include/robolocks/runtime_state.hpp` (UnitState's 4×{active,target,started_tick,updated_tick} field groups → `IntentChannelState mobility/turret/hull/weapon`), `engine/include/robolocks/snapshot.hpp` (UnitSnapshot's channel groups likewise, keeping snapshot-only extras like remaining/error/age where they live today — read first), `engine/src/intent_state.cpp` (three copy-pasted per-channel blocks in `apply_resolved_orders_to_intents` collapse to one helper called 4×; `clear_intents` resets via the struct), `engine/src/battle_simulation.cpp` (snapshot mapping), `engine/src/snapshot_json.cpp` + `engine/src/controller_protocol_json.cpp` (input mapping only — emitted keys frozen), `engine/tests/intent_state_test.cpp`, `engine/tests/battle_simulation_test.cpp`, any other test constructing these fields (grep `mobility_active\|turret_target\|weapon_started_tick` etc. to find all sites)

**Interfaces:**
- Produces (runtime_state.hpp): `struct IntentChannelState { bool active = false; Vec2 target{}; Tick started_tick = 0; Tick updated_tick = 0; /* channel-specific payload stays outside or as documented after reading */ };` — the weapon channel's extra field (min_hit_chance) placement is the implementer's read-the-code call: either a distinct `WeaponIntentState : IntentChannelState`-style struct or a side field on UnitState; pick what keeps designated initializers in tests simplest, and document the choice in the report.
- JSON schema completely unchanged — golden tests are the proof.

- [ ] **Step 1:** Grep all construction/read sites of the flattened fields (src + tests); read runtime_state.hpp/snapshot.hpp current shape.
- [ ] **Step 2:** Introduce the struct(s); migrate UnitState + UnitSnapshot + all call sites; collapse `apply_resolved_orders_to_intents` to one per-channel helper.
- [ ] **Step 3:** Full engine suite → pass (goldens prove serialization unchanged; intent/battle-sim tests prove behavior). Web suite → pass.
- [ ] **Step 4:** Commit (`refactor: struct-ify per-channel intent state`).

---

### Task 5: Decompose BattleSimulation::step and the projectile/weapon free functions

**Files:**
- Modify: `engine/src/battle_simulation.cpp` + `engine/include/robolocks/battle_simulation.hpp` (extract step() phases into private methods: `apply_unit_orders`, `run_weapon_phase`, `run_physics_phase`, `filter_visible_orders` — names indicative, match what the phases actually do after reading), `engine/src/projectile_system.cpp` + `engine/include/robolocks/projectile_system.hpp`:
  - `resolve_weapon_fire`: receive the already-resolved orders (`ResolvedUnitOrders` / whatever step() already computed) instead of re-scanning raw `orders_by_unit`; preserve the fire_order_count>1 rejection semantics exactly (there is a test — find it first); drop the unnamed unused `double` parameter; remove the duplicated dead-unit clear_intents (step() already does it — verify with a test run after removal)
  - Split `advance_projectiles` into ballistic + direct passes with ONE shared damage/event helper (the armor_damage/destroyed event pair is built twice today)
  - Wrap projectile container + `next_projectile_id_` into a `ProjectileSystem` class owned by BattleSimulation (matching SensorSystem/PhysicsSystem shape) — moving `projectiles_`/`next_projectile_id_` out of BattleSimulation's private state
- Modify: `engine/tests/projectile_system_test.cpp`, `engine/tests/battle_simulation_test.cpp` (constructor/call-shape updates only; assertions unchanged)

**Interfaces:**
- Consumes: Task 3's step_result.hpp (battle_simulation.hpp churn no longer rebuilds serializers), Task 4's intent structs.
- Behavior frozen: every existing projectile/battle-sim/rules test passes with unchanged assertions; goldens unchanged.

- [ ] **Step 1:** Read step() end-to-end and resolve_weapon_fire/advance_projectiles; list the phases and the exact double-application sites (dead-unit clear, order re-scan) with line refs in the report.
- [ ] **Step 2:** Extract step() phases (pure code motion first — commit-worthy checkpoint if large).
- [ ] **Step 3:** ProjectileSystem class + resolved-orders handoff + advance split + shared damage helper.
- [ ] **Step 4:** Full engine suite → pass; web suite → pass.
- [ ] **Step 5:** Commit (`refactor: decompose battle step and projectile system`); two commits acceptable if Step 2 was checkpointed.

---

### Task 6: Uniform noexcept C ABI + golden bless-mode hardening

**Files:**
- Modify: `engine/src/c_api.cpp` (every exported function that can reach throwing code — notably `step`/`run` via `call_registered_json_bot`, and `frame_json`'s `.dump()` — gets try/catch → set `g_last_error`, return error sentinel [nullptr / negative / no-op per signature — follow each function's existing convention]; make `g_last_error` `thread_local`), `engine/tests/c_api_test.cpp` (new test: a json-bot callback that reports failure (returns null/unregistered) makes step/run fail SOFTLY — assert the error sentinel + non-empty `robolocks_last_error()`, no crash)
- Modify: `web/src/sim/kernelAdapter.ts` (+ `web/tests/kernelAdapter.test.mjs`): check the step/run error sentinel and throw with `robolocks_last_error` message (same pattern as the create path added post-P1-review)
- Modify: `engine/tests/contract_golden_test.cpp` (bless mode requires WRITE_GOLDEN == "1" exactly, and prints a conspicuous `WARN`/message when blessing)
- Rebuild wasm once at the end: `scripts/build.sh wasm && scripts/build.sh sync` (c_api.cpp changed)

**Interfaces:**
- Consumes: existing `g_last_error`/`robolocks_last_error` mechanism from P1.
- Produces: no C API signature changes — only failure behavior (exception → recorded error) and the TS adapter surfacing it.

- [ ] **Step 1:** Read c_api.cpp fully; inventory which exports can throw (trace call_registered_json_bot); write the failing C++ test (bot-callback failure → soft error).
- [ ] **Step 2:** Implement try/catch wrappers + thread_local; run c_api tests → pass.
- [ ] **Step 3:** TS adapter + test; bless-mode hardening.
- [ ] **Step 4:** Rebuild wasm + sync; full engine suite + full web suite (test/typecheck/build) → pass.
- [ ] **Step 5:** Commit (`refactor: make the C ABI uniformly exception-safe`).

---

## Self-Review Notes

- Coverage: review items 5 (Task 1), 6 (Task 2), 7 (Task 4), 8 (Task 5) plus P1 final-review fold-ins: step_result extraction (Task 3, prerequisite ordering before Task 5), ABI noexcept + WRITE_GOLDEN hardening + thread_local (Task 6), vec2_to_json trim (Task 1).
- Ordering rationale: 1 and 2 are independent low-risk openers; 3 must precede 5; 4 before 5 keeps step() decomposition from churning twice.
- Everything is behavior-frozen refactoring; the P1 goldens are the cross-cutting regression net, cited in every task's verification step.
