# Robolocks MVP Design

## Summary

Robolocks starts as a web-based top-down modular tank AI arena. The first version focuses on a single advanced unit platform rather than a full combined-arms battle simulation. Players build a unit from an official module catalog, write AI logic for it, run deterministic battles, and inspect the result through replay, event logs, and tactical overlays.

The long-term direction is a modern combat management game that can grow from individual tank AI to groups, control logic, drones, and other unit classes. The MVP keeps that path open by designing the simulation core, module system, bot protocol, and replay format as engine-level boundaries rather than UI-specific features.

## Product Goals

- Let players rapidly iterate on bot code and tank builds.
- Make module specs matter in the simulation, not just in UI labels.
- Keep battles deterministic for replay, debugging, and future tournaments.
- Build the engine kernel in C++ compiled to WASM from the start, so web, headless CLI, and future packaging share one deterministic core with no engine migration.
- Support future VS Code extension, CLI, standalone viewer, and headless tournament runner.

## MVP Scope

Included:

- One initial unit archetype: tank-style ground unit.
- Official module catalog with point costs and compatibility rules.
- Standard 500-point league as the primary ruleset.
- Top-down tactical view (2D renderer first; 3D-style visuals are a later renderer-only swap).
- 1v1 duel as the first battle mode.
- Bot code using a high-level Order API.
- Deterministic fixed-tick simulation.
- C++/WASM engine kernel with a native headless build for tests and CLI battle runs.
- Replay and debug event logging.
- Web app with module builder, code editor, battle viewer, and debug panel.

Deferred:

- Multiple unit classes.
- Drones, aircraft, naval units, infantry, artillery, and command hierarchy.
- Remote bot execution and networked tournaments.
- LLM prompt-based commanders.
- Full low-level actuator programming as a first-class mode.
- VS Code extension and standalone viewer products.

## Build Order

Internal milestones inside the MVP:

1. Engine kernel skeleton: deterministic sim loop, native headless build, determinism tests passing.
2. First playable: two preset units, bot API over the worker protocol, 1v1 duel, minimal renderer.
3. Replay: recording, re-simulation playback, event log viewer.
4. Module system: catalog, build validation, module builder UI.
5. Polish: tactical overlays, debug panel, balance pass on the initial catalog.

The module builder ships in the MVP, but it is built on top of a working preset-tank loop, not before it.

## User Experience

The primary loop is:

1. Choose a preset tank or assemble one from modules.
2. Write bot logic.
3. Run a battle.
4. Watch the top-down simulation.
5. Inspect decisions, sensor events, firing decisions, damage, and replay frames.
6. Adjust code or modules and run again.

The first screen should be the usable workbench, not a marketing page. The expected layout is a dense tool interface:

- Module builder.
- Code editor.
- Top-down battle simulation.
- Replay timeline.
- Event log and selected-unit inspector.

## Architecture

The engine kernel is written in C++ and compiled to WASM from the start. TypeScript owns everything user-facing: UI shell, editor, renderer, and worker plumbing. There is no TypeScript prototype core and no later engine migration, so replays recorded in the MVP stay valid.

```text
Engine Kernel (C++ -> WASM, one module loaded in both workers)
  - deterministic sim core
    - battle runner
    - order resolver
    - vehicle controllers
    - sensors, ballistics, damage
    - replay recorder
  - deterministic math module
  - map query library

Browser App (TypeScript)
  - UI Shell
    - module builder
    - code editor
    - battle viewer
    - replay/debug panel

  - Simulation Worker
    - engine kernel: sim entry points
    - JS<->WASM marshaling adapter

  - Bot Worker
    - engine kernel: map query entry points
    - bot runtime adapter
    - protocol handler
    - user AI code
```

Rules:

- The engine kernel has no DOM, renderer, editor, or UI dependency.
- The same kernel binary is loaded in the simulation worker and the bot worker. The bot worker only uses the map query entry points and only receives static map data plus the bot's own Observation, so hidden world state never crosses into the bot worker.
- Map queries run locally inside the bot worker, so their cost is paid from the bot's own tick budget.
- Bot code never receives the full world state.
- The renderer reads snapshots and replay frames, but does not own simulation logic.
- Replay does not call bot code again.
- All inputs and outputs crossing the worker or WASM boundary are serializable.
- Simulation code never calls host math functions; all transcendental math goes through the kernel's deterministic math module.
- Module catalog, maps, and balance data live in JSON outside the compiled kernel, so tuning does not require a rebuild.

Packaging:

```text
C++ engine kernel
  -> WASM for web (simulation worker + bot worker)
  -> native build for headless tests and CLI battle runs (from day one)
  -> native viewer and VS Code extension later reuse the same core
```

## Core API Boundary

The simulation core should feel like a data-in/data-out engine:

```ts
// sim-side surface (simulation worker)
createBattle(config): MatchHandle
getObservation(battle, unitId): Observation
stepBattle(battle, ordersByUnit): StepResult
getSnapshot(battle): WorldSnapshot
getReplayFrame(battle): ReplayFrame

// bot-side surface (bot worker)
createMapQuery(mapData, observation): MapQueryHandle
```

These are the kernel's WASM exports. The native build exposes the same boundary for headless runs, so tests and CLI matches exercise the exact code that ships to the browser.

## Tick Model

The MVP uses a no-delay order model.

Per tick:

1. Build observations for each bot.
2. Run bot decisions.
3. Receive Orders.
4. Validate and resolve Orders by control channel.
5. Convert Orders to internal Intent.
6. Convert Intent to ActuatorInput.
7. Clamp ActuatorInput by module limits.
8. Step movement, turret, sensor, weapon, ballistics, and damage systems.
9. Record events.
10. Produce snapshot and replay frame.

Future delayed-order scheduling can be added later:

```text
effective_tick = current_tick + order_delay
```

For MVP, `order_delay = 0`.

## Bot API

The public bot API starts at the Order level. The example below is Python-flavored pseudocode; the first supported bot language is an open decision.

```python
def on_start(spec):
    pass

def on_tick(state):
    enemy = state.contacts.closest_enemy()

    if enemy:
        return [
            FaceArmorToward(enemy.position),
            AimAt(enemy.predicted_position),
            FireIfSolution(min_hit_chance=0.6),
            MoveTo(state.map.best_cover_from(enemy)),
        ]

    return [
        MoveTo(state.map.center()),
        ScanArc(center=state.self.hull_heading, width_deg=120),
    ]

def on_end(result):
    pass
```

Terminology:

- Order: public AI output expressing intent, such as `MoveTo`, `AimAt`, or `FireIfSolution`.
- Intent: internal channel-level target resolved by the engine.
- ActuatorInput: final low-level input to the physics step, such as throttle, steering, brake, turret rate, and fire trigger.

The initial public API should expose Orders only. A later advanced mode can expose direct ActuatorInput control.

Helper quality is module-driven. Convenience values such as `predicted_position`, the hit chance behind `FireIfSolution`, and cover scores are computed from the tank's own fire control and sensor modules, so better modules produce better helpers — and hand-written logic can outperform the built-ins. Raw observation data is always available alongside the helpers, so the helpers are a floor, not a ceiling, for bot skill.

## Order Channels

Orders are interpreted in parallel by control channel.

- Mobility: `MoveTo`, `HoldPosition`, `SetSpeed`.
- Hull orientation: `FaceArmorToward`, `TurnHullTo`.
- Turret/aim: `AimAt`, `TrackContact`.
- Weapon: `Fire`, `FireIfSolution`, `SelectAmmo`.
- Sensor: `ScanArc`, `FocusScan`, `TrackContact`.

`TrackContact` is a single order that occupies both the turret/aim and sensor channels; it conflicts with any other order on either channel.

Different channels can apply simultaneously. Conflicts inside the same channel follow one rule in every mode: if a bot returns more than one order for the same channel in one tick, the engine rejects all orders on that channel, keeps the other channels, and emits a diagnostic event. Execution semantics never differ between development and ranked play — only diagnostic verbosity does — so a bot tested in development behaves identically in ranked matches.

## Observation Model

Bots receive an Observation, not WorldState.

Observation includes:

- Own state: position, velocity, hull heading, turret heading, reload status, aim error, damage state.
- Vehicle spec deltas: the full composed module stats and capability tags are sent once at `init`; per-tick observations carry only damage-driven changes to capabilities.
- Contacts: sensor-derived enemy estimates with uncertainty and last-seen time.
- Map query API: line of sight, cover score, pathing hints, terrain data — served by the kernel's map query library running locally in the bot worker against static map data and the Observation, not by calls back into the simulation.
- Events since last tick: hit, damage, near miss, lost contact, reload complete, movement blocked.

Enemy state is incomplete by design. Contacts should include confidence, identification level, and uncertainty instead of exact hidden state.

## Module System

Modules are selected from an official catalog. Users cannot invent arbitrary ranked modules.

Initial categories:

- Chassis.
- Engine/drivetrain.
- Turret.
- Gun.
- Armor package.
- Sensor.
- Fire control.
- Ammo.

Each module contains:

- `id`.
- `name`.
- `category`.
- `massKilograms`.
- `pointCost`.
- `compatibility`.
- `requirements`.
- `stats`.
- `capabilities`.

Module specs should be concrete and simulation-facing. Example fields include muzzle velocity, reload time, turret traverse rate, power output, payload capacity, armor RHAe values, detection range, scan rate, and first-shot accuracy.

## Build Validation

The engine validates builds before a battle.

Checks:

- Total point cost is within the league limit.
- Required categories are present.
- Total mass fits chassis payload capacity.
- Gun fits turret mount class and recoil capacity.
- Turret fits chassis ring or mount constraints.
- Engine output is valid for total mass.
- Power and cooling requirements are within capacity when those systems are enabled.
- Ammo is compatible with the selected gun.

MVP primary league:

```text
Standard League: 500 pts
```

Future leagues:

- Scout: 350 pts.
- Assault: 700 pts.
- Open/Prototype: experimental modules.

## Balance Model

Balance comes from multiple constraints, not a single stat cap.

- Point budget prevents maximum-spec builds from fitting into standard play.
- Mass and power affect acceleration, turn rate, terrain response, and stabilization.
- Payload and mount limits block physically impossible combinations.
- Compatibility rules prevent unrealistic module stacks.
- Diminishing returns make elite modules expensive for marginal gains.
- Map variety prevents one dominant build style.
- Damage channels make module trade-offs meaningful.

Expected archetypes:

- Heavy brawler: strong frontal armor and gun, weak mobility and flanking response.
- Fast flanker: high mobility and turret speed, weak armor and lower penetration.
- Long-range sniper: strong sensor, fire control, and high-velocity gun, weak in close fights.
- Scout duelist: strong detection and reaction, low durability and sustained damage.

## Simulation Systems

MVP systems:

- Map representation: uniform grid with blocked/cover attributes; line of sight via deterministic grid raycast. This format backs the map query API, so it is an engine-level decision, not per-map content.
- Vehicle movement using top-down deterministic vehicle kinematics.
- Pathfinding and steering: `MoveTo` plans a route with deterministic A* over the map grid and follows it with simple steering; a route that fails or becomes blocked emits a `movement blocked` event instead of replanning silently.
- Independent hull and turret orientation.
- Line-of-sight and cover.
- Sensor detection with range, FOV, scan rate, and uncertainty.
- Direct-fire ballistics with travel time and dispersion.
- Hit, angle, penetration, and damage resolution.
- Module damage channels.

Initial damage channels:

- Mobility.
- Turret.
- Gun.
- Sensor.
- Armor integrity.

The damage model should avoid a single HP-only implementation because module builds need visible combat consequences.

## Battle End Conditions

A 1v1 duel ends when one of the following occurs:

- Destruction: a tank whose armor integrity reaches zero is destroyed; the opponent wins.
- Combat ineffective: a tank that can neither move nor fire (mobility and gun channels both disabled) loses after a short grace period.
- Tick limit: matches are capped at a fixed simulated duration (default 5 minutes). At the cap, the winner is decided by remaining armor integrity, then by total damage dealt.
- Draw: if both tiebreakers are equal, the battle is a draw. Ranked formats may rerun with a new seed instead of recording a draw.

The tick limit, grace period, and tiebreaker order are league rules, stored in battle config and in the replay.

## Replay and Debugging

Replay is a first-class feature.

Replay data stores:

- Battle config.
- Engine kernel version.
- Module catalog version.
- Map id.
- Seed.
- Bot metadata.
- Orders per tick.
- Events.
- Periodic snapshots.

The viewer should explain decisions and rejections, for example:

- `FireIfSolution rejected: hit chance 0.42 < 0.60`.
- `AimAt limited: turret traverse clamp 14 deg/s`.
- `MoveTo path blocked`.
- `Sensor lost contact due to obstacle`.
- `Shell hit side armor; penetration failed`.

Deterministic replay should not execute bot code again.

## Bot Runtime Protocol

Even in the web MVP, bot execution should use protocol-shaped messages.

Lifecycle:

```text
init(match_info, vehicle_spec, rules) -> ready
tick(observation, events, budget) -> orders
end(result, replay_summary) -> ack
```

Initial transport:

- Browser worker `postMessage` for web.

Future transports:

- Stdio JSON Lines for local native processes.
- Local socket.
- Native plugin ABI.
- WebSocket or gRPC for remote/slow leagues.

Protocol schema is independent of transport.

## Timing and Determinism

MVP:

- Fixed tick simulation.
- Local worker execution only.
- No order delay.
- Per-tick bot timeout with clear diagnostics.
- Bit-exact determinism for the shipped web/WASM runtime: WASM float semantics plus the kernel's own deterministic math module. Host `Math` functions are forbidden in simulation code.
- Native builds compile with strict IEEE settings (no fast-math) and are continuously checked against WASM. Native/WASM parity is a release gate for ranked/headless tooling, not a blocker for the earliest browser-only prototype.
- Same engine version, runtime target, config, seed, catalog version, map, and orders must reproduce the same battle.

Future:

- Runtime-class-specific time budgets.
- Delayed order scheduling for remote or networked execution.
- Separate slow leagues for remote or LLM bots.

## Technical Stack

Recommended MVP:

- C++20 engine kernel compiled to WASM with Emscripten; CMake cross-platform build.
- Native kernel build for headless tests and CLI battle runs from day one.
- TypeScript for the web app, UI, and worker plumbing.
- Web Workers for simulation and bot runtime separation.
- Monaco editor for code editing.
- Lightweight 2D WebGL/Canvas renderer for the top-down view first. Because the renderer only reads snapshots and replay frames, upgrading to Three.js later is a renderer-only swap.
- JSON for module catalog, battle config, and replay v0.

Future:

- Native viewer for standalone battle/replay inspection.
- VS Code extension as launcher/editor integration.
- Remote/networked battle runner reusing the same kernel.

## Testing Strategy

Core tests run against the native kernel build for speed; CI cross-checks WASM.

- Determinism tests: same seed and inputs produce same snapshots/events.
- Golden replay tests: recorded replays re-simulate identically on every commit.
- Native/WASM parity tests: the same battle produces identical snapshots on both builds.
- Module validation tests.
- Order resolution tests.
- Sensor visibility tests.
- Ballistics and penetration tests.
- Replay round-trip tests.

Bot/runtime tests:

- Timeout handling.
- Invalid order diagnostics.
- Observation does not leak hidden world state.

UI tests:

- Run battle from preset.
- Inspect replay events.
- Module builder rejects invalid builds.

## Open Decisions

- Whether the first bot language is JavaScript/TypeScript only, or Python via Pyodide from the first release.
- Exact first module catalog size.
- Exact initial maps and obstacles.
- Whether ammo is finite per battle, and whether loadout size costs points. Finite ammo strongly affects both balance and bot logic, so this should be decided before the ballistics system is built.
