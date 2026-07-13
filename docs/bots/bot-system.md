# Bot System

How bots plug into Robolocks: the execution model, lifecycle, the two runtimes,
determinism, and how a battle ends. For the API and tactics, see
[writing-bots.md](writing-bots.md). For browser-side evaluation workflows, see
[arena-guide.md](arena-guide.md).

## Execution model

The engine advances the battle one **tick** at a time. On every tick, for each
unit that has a controller:

```text
engine builds Observation  ──▶  bot.on_tick(state)  ──▶  Orders  ──▶  engine applies orders + steps physics/combat  ──▶  next tick
```

- The **observation** (`BattleState`) is what *that unit* can see this tick: its
  own state, sensed contacts (enemies, obstacles, projectiles), and the map.
- Your bot returns **orders** — intents for the unit's channels (move, aim, hull
  facing, fire, scan). Orders are *intents*, not teleports: the engine resolves
  them through the unit's mobility/turret/weapon limits over subsequent ticks.
- Orders persist as intents until replaced. You can re-send the same orders every
  tick (cheap, and how most bots work), or only when something changes.

### One order per channel per tick

Each order kind maps to one channel:

| Order | Channel |
| --- | --- |
| `MoveTo` | mobility |
| `AimAt` | turret |
| `FaceArmorToward` | hull |
| `FireIfSolution` | weapon |
| `ScanArc` | sensor |

If you submit two orders of the same kind in one tick, only the first is used —
**except `FireIfSolution`**, where submitting more than one *rejects the shot* for
that tick (a guard against accidental double-fire). Send at most one of each.

## Lifecycle hooks

```python
run_bot(on_tick, on_start=None, on_end=None)
```

- `on_tick(state: BattleState) -> Iterable[OrderLike]` — required; called every
  tick the unit is alive.
- `on_start(spec: UnitSpec | None) -> None` — optional; called once before the
  first tick. Receives the unit's full module spec (mobility, turret, weapon,
  armor, body, sensor) so you can cache stats like sensor FOV or weapon range.
  May be called with `None` if no start payload was delivered.
- `on_end(result) -> None` — optional; called once when the bot is torn down.

Only `on_tick` is required; the others are for setup/cleanup.

## Runtimes

The same bot source runs unchanged in two places (`run_bot` auto-detects which):

- **Browser (Hangar/Arena):** the bot runs in **Pyodide** inside a web
  worker. `run_bot` *registers* your callbacks; the worker calls them each tick
  with observations from the WASM engine. Detected via `sys.platform ==
  "emscripten"`.
- **Native (CLI):** the bot runs as a subprocess speaking **JSON lines over
  stdio** — one observation object per line in, one `{"orders": [...]}` object
  per line out. Used by the C++ CLI for headless battles.

Because both paths share the SDK and the engine, a bot that works in one works in
the other. Determinism is preserved across runtimes for the same inputs.

## Determinism

Robolocks is deterministic: the same engine version, runtime target, battle
config, seed, module catalog, map, and order stream reproduce the same battle,
tick for tick. Consequences for bot authors:

- **Don't use wall-clock time or unseeded randomness.** If you want randomness,
  derive it from stable inputs (e.g. `state.tick`, your unit id) so replays
  reproduce.
- The engine, not the bot, owns all rules (movement limits, collisions, hit
  resolution, scoring). Your bot only proposes intents.

See [../architecture/engine-boundary.md](../architecture/engine-boundary.md).

## How a battle ends

A battle runs until its **rule** resolves, or until the **tick limit** (a safety
deadline) is reached — whichever comes first. At the tick-limit deadline the
engine settles the outcome on the current **score** (most kills wins; an exact tie
is a draw). Rule modes:

- **Kill limit** — first side to the kill target wins.
- **Capture point** — hold the flag/zone for the required ticks.
- **Timed** — highest score when time runs out.

In the workbench, the "ticks" you set is this deadline (the max), not a fixed run
length: a decisive battle stops as soon as the rule resolves. Destroyed units may
linger as **wrecks** (no respawn) or **respawn** after a cooldown, depending on
the rule — see targeting notes in [writing-bots.md](writing-bots.md).

## Running your bot

- **Hangar:** paste your source into the bot editor (or start from a preset),
  assign it to a unit, and Run. Logs from `print(...)` surface in the console
  panel.
- **Arena:** save a Hangar bot or import a GitHub bot repo, then run deterministic
  seed sets to compare bots and update local practice ratings. See
  [arena-guide.md](arena-guide.md).
- **CLI:** reference your bot file from a battle config's `controllers` entry
  (`{"unitId": N, "type": "python", "path": "relative/or/abs/bot.py"}`) and run
  `robolocks_cli run --battle <config> --ticks <n>`.
