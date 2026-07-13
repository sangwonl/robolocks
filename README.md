# Robolocks

Robolocks is a deterministic tank-combat simulator you program with bots. A C++
engine owns all the rules; you write Python bots that read a per-tick observation
and return orders. Battles run headless (CLI) or in the browser Hangar/Arena
workbench (the same engine, compiled to WebAssembly, with a 3D replay view).

```text
Observation  ──▶  your bot (on_tick)  ──▶  Orders  ──▶  engine step  ──▶  next Observation
```

## Repository layout

| Path | What lives there |
| --- | --- |
| `engine/` | C++ simulation kernel (physics, sensors, projectiles, rules) + CLI + WASM entry points |
| `sdk/python/robolocks/` | Python bot SDK (orders, observation types, `run_bot` runtime) |
| `examples/bots/` | Example bot programs |
| `web/` | Browser Hangar/Arena workbench (React + Three.js), talks to the WASM engine |
| `fixtures/` | Battle configs, replay fixtures, golden contract files |
| `docs/` | Architecture and bot-authoring documentation |

## Quick start

### Browser workbench (build, test, and evaluate bots)

```bash
cd web
npm install
npm run dev          # predev builds the Python SDK bundle + copies Pyodide
```

Open the dev URL:

- Use **Hangar** to choose a battle/rule/unit preset, start from a bot logic
  preset, edit Python code, run a local test, and save bot snapshots.
- Use **Arena** to evaluate saved Hangar bots and imported GitHub bots across
  deterministic seed sets.

The workbench ships starter tactics you can read and tweak: **Charger,
Skirmisher, Orbiter, Flanker, Evader**.

The browser runs your Python bot in Pyodide against the WASM engine and plays the
result back in a freely-navigable 3D view.

### Rebuild the WASM engine (after changing C++)

```bash
./scripts/build.sh wasm     # builds engine → WASM and syncs into web/public + web/src/generated
```

### Native CLI (headless battles & replays)

```bash
./scripts/build.sh cli                       # configure + build the native engine + CLI
build-cli-release/robolocks_cli run \
  --battle fixtures/matches/preset_duel_python_v0.json \
  --ticks 600 --replay-out out.replay.json
```

### Tests

```bash
./scripts/build.sh cli test        # C++ engine tests (Catch2)
cd web && npm test                 # web/TS tests (node --test)
cd sdk/python && python3 -m unittest discover -s tests   # Python SDK tests
```

## Writing a bot

A bot is a Python module that calls `run_bot(on_tick)`. Each tick you get a
`BattleState` and return a list of orders:

```python
from robolocks import AimAt, BattleState, FireIfSolution, MoveTo, OrderLike, ScanArc, run_bot


def on_tick(state: BattleState) -> list[OrderLike]:
    enemy = state.contacts.closest_enemy()   # nearest LIVE enemy, or None
    own = state.own_unit
    if not enemy:
        # Nothing in sight: sweep the (turret-mounted) sensor and hold.
        return [ScanArc(direction=own.turret_heading, width=160.0)]
    return [
        AimAt(enemy.position),               # turret tracks the target (independent of the hull)
        ScanArc(direction=own.turret_heading, width=160.0),  # sensor rides the turret
        FireIfSolution(min_hit_chance=0.3),  # fire when a good-enough solution exists
        MoveTo(enemy.position),              # drive toward the enemy (hull steers where it moves)
    ]


run_bot(on_tick)
```

The one rule that surprises everyone: **a unit drives forward along its hull
heading**, and `MoveTo` turns the hull toward the target — so to go somewhere you
just `MoveTo` there. `FaceArmorToward` overrides that to point armor at a target,
so it fights `MoveTo`; use it only while holding position. The turret (`AimAt`)
aims independently, so you can move any direction and still fire.

Read the full guides before writing anything non-trivial:

- **[docs/bots/bot-system.md](docs/bots/bot-system.md)** — how bots run: the tick
  loop, lifecycle hooks, the two runtimes (browser/native), determinism, and how
  a battle ends.
- **[docs/bots/writing-bots.md](docs/bots/writing-bots.md)** — the authoring
  guide: the movement model, every order, the observation/state reference,
  targeting & firing, worked tactics, and common pitfalls.
- **[docs/bots/arena-guide.md](docs/bots/arena-guide.md)** — how to save Hangar
  bots, import GitHub bot repos, run Arena evaluations, and read local ratings.

## Architecture docs

- [docs/architecture/engine-boundary.md](docs/architecture/engine-boundary.md) — what the engine owns vs. the UI/worker.
- [docs/architecture/replay-schema.md](docs/architecture/replay-schema.md) — the replay/frame JSON schema.
