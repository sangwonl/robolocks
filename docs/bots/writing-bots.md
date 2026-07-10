# Writing Bots

The authoring guide for Robolocks bots: the movement model, every order, the
observation you read, targeting & firing, movement recipes, and the pitfalls that
trip people up. For how bots are executed, see [bot-system.md](bot-system.md).

A bot is a Python module that ends with `run_bot(on_tick)`. Import everything
from the top-level `robolocks` package.

```python
from robolocks import AimAt, BattleState, FireIfSolution, MoveTo, OrderLike, ScanArc, run_bot


def on_tick(state: BattleState) -> list[OrderLike]:
    enemy = state.contacts.closest_enemy()
    own = state.own_unit
    if not enemy:
        return [ScanArc(direction=own.hull_heading, width=160.0)]
    return [
        AimAt(enemy.position),
        FireIfSolution(min_hit_chance=0.3),
        MoveTo(enemy.position),
    ]


run_bot(on_tick)
```

---

## 1. The mental model (read this first)

Three facts drive every bot. Get these wrong and your unit will spin, stall, or
sit blind.

### Movement is tank-like, not free

A unit **moves forward along its hull heading**. It does not slide toward a
`MoveTo` target directly. Instead:

- `MoveTo(target)` steers the **hull** toward `target` (turning at the hull's
  turn rate) and drives forward — so to go somewhere, just `MoveTo` there.
- `FaceArmorToward(target)` **overrides** hull steering to point the hull's front
  (thickest) armor at `target`. While it is active the hull faces `target`, so
  the unit drives *toward `target`*, ignoring `MoveTo`'s direction.

> **Never combine `MoveTo` and `FaceArmorToward` in the same tick to go one way
> while facing another — they both fight over the hull heading.** Use `MoveTo`
> alone to maneuver; use `FaceArmorToward` (without `MoveTo`) only while holding
> position to angle armor at the enemy.

### The turret is independent

`AimAt(target)` steers the **turret** toward `target` at the turret's turn rate,
regardless of where the hull points or moves. So a unit can drive one direction
and keep its gun on the enemy — strafing, kiting, and orbiting all work because
`AimAt` is decoupled from `MoveTo`.

### You must scan to see

The sensor reports contacts **only while a `ScanArc` is active**, and a scan arc
**persists** until you issue a new one. Consequences:

- Issue `ScanArc` at least once or your `contacts` will be empty (you'll be
  blind). A brand-new unit has no scan arc until its bot sets one.
- Because it persists, you don't have to re-send it every tick — but the arc
  stays pointed where you last aimed it. If you want the sensor to follow a
  moving fight, re-issue `ScanArc` toward the action (or use a wide arc).

---

## 2. Orders reference

Return an iterable of orders from `on_tick`. At most one order per channel per
tick (see [bot-system.md](bot-system.md#one-order-per-channel-per-tick)). All
positions are in **meters**; all angles in **degrees**.

| Order | Signature | Effect |
| --- | --- | --- |
| `MoveTo` | `MoveTo(position)` | Drive to `position` (hull steers toward it). |
| `AimAt` | `AimAt(target)` | Turn the turret to bear on `target`. |
| `FaceArmorToward` | `FaceArmorToward(target)` | Turn the hull so front armor faces `target` (stationary use). |
| `FireIfSolution` | `FireIfSolution(min_hit_chance)` | Fire this tick if a valid solution with hit chance ≥ `min_hit_chance` exists. |
| `ScanArc` | `ScanArc(direction, width, range=0.0)` | Point the sensor: `direction`/`width` in degrees, `range` in meters (`0` = sensor max). |

`position`/`target` accept a `Vec2`, anything with `.x`/`.y`, or a `{"x", "y"}`
dict.

### Firing details

`FireIfSolution(min_hit_chance)` fires only when **all** hold:

- The weapon is **off cooldown** (after firing, it reloads for `reload_ticks`).
- A live, targetable enemy is within **weapon range**.
- The **turret is aimed** at it within the weapon's aim tolerance — the aim error
  is measured from the turret pivot, so point-blank targets still resolve.
- The resulting **hit chance ≥ `min_hit_chance`**.

Use `min_hit_chance=0.0` to fire whenever any target is in the solution
(aggressive), or a higher value (e.g. `0.5`) to hold fire until the shot is good.
Pair `FireIfSolution` with `AimAt` — the gun must be on target to fire.

---

## 3. The observation (`BattleState`)

`on_tick` receives a `BattleState` describing what your unit sees this tick.

```python
state.tick          # int — current tick
state.self_id       # int — your unit id
state.own_unit      # UnitState — you (also state.self)
state.contacts      # ContactSet — what you sense right now
state.map           # BattleMap — static map info
```

### `UnitState` (own_unit and each contact)

| Field | Type | Notes |
| --- | --- | --- |
| `unit_id`, `team_id` | int | identity |
| `is_enemy` | bool | enemy relative to the observer |
| `name` | str | |
| `position` | `Vec2` | meters |
| `hull_heading` | float | degrees |
| `turret_heading` | float | degrees |
| `armor_integrity` | float | current armor (0 = destroyed) |
| `weapon_cooldown` | int | ticks left until it can fire |
| `intent` | `UnitIntents` | active mobility/turret/hull/weapon intents |

Handy properties/methods:

- `unit.alive` → `armor_integrity > 0`.
- `unit.can_fire` → `weapon_cooldown == 0 and not intent.weapon.active`.
- `unit.distance_to(other)` → meters to another unit or a point.

### `ContactSet` (`state.contacts`)

Contacts are what the sensor sees this tick, **sorted nearest-first**.

```python
state.contacts.units          # tuple[UnitState]   — sensed units (enemies AND allies, plus wrecks)
state.contacts.obstacles      # tuple[Obstacle]
state.contacts.projectiles    # tuple[ProjectileContact]

state.contacts.closest_enemy()                    # nearest LIVE enemy, or None
state.contacts.closest_enemy(include_wrecks=True) # nearest enemy incl. destroyed hulls
```

> **Wrecks linger.** A destroyed unit stays in the world (and in `contacts.units`)
> as a wreck until it respawns (if the rule allows). `closest_enemy()` skips
> wrecks by default — always target through it (or filter on `unit.alive`) so your
> bot doesn't lock onto a corpse and stop firing.

`Obstacle`: `id`, `position`, `radius`, `blocks_movement`, `blocks_line_of_sight`.
Obstacles that block line of sight also block your sensor — use them for cover.

`ProjectileContact`: `projectile_id`, `owner_unit_id`, `previous_position`,
`position`, `radius`, `previous_height`, `height`. The travel direction is
`position - previous_position` — useful for dodging (see recipes).

### Intents (`unit.intent`)

Each channel exposes what the unit is currently trying to do, so you can avoid
re-issuing orders needlessly:

- `intent.mobility` / `.turret` / `.hull` — `IntentState(active, target, remaining,
  error, age)`. `remaining` is meters left (mobility) and `error` is degrees off
  (turret/hull). `IntentState.should_reissue(target, threshold_m=5, min_age_ticks=20)`
  is a helper for "has my goal drifted enough to resend?".
- `intent.weapon` — `WeaponIntentState(active, min_hit_chance, age)`.

### `BattleMap` (`state.map`)

- `map.obstacles` — tuple of `Obstacle` for the whole map.
- `map.center` — a fixed reference point (currently `(20, 12)`). It is a
  convenience rally point, **not** guaranteed to be the geometric center of large
  or custom arenas — prefer computing positions from your own/enemy position when
  you need precision.

### Geometry helpers

`Vec2(x, y)` has `.distance_to(other)` and `.offset(x=, y=)`; the module-level
`distance(a, b)` works on any vec-like pair. For headings, Robolocks uses
`atan2(dy, dx)` degrees (0° = +x, 90° = +y). You can `import math` for your own
trig.

---

## 4. Movement recipes

All of these steer with `MoveTo` (hull follows) and keep the gun on target with
`AimAt` — never `FaceArmorToward` while maneuvering.

**Chase / close in** — drive at the enemy's live position:

```python
return [AimAt(enemy.position), FireIfSolution(min_hit_chance=0.0), MoveTo(enemy.position)]
```

**Hold optimal range** — move to a point `R` meters from the enemy along the line
to us:

```python
import math
dx, dy = own.position.x - enemy.position.x, own.position.y - enemy.position.y
dist = math.hypot(dx, dy) or 1.0
target = {"x": enemy.position.x + dx / dist * R, "y": enemy.position.y + dy / dist * R}
return [AimAt(enemy.position), FireIfSolution(min_hit_chance=0.4), MoveTo(target)]
```

**Orbit / strafe** — advance around a ring centered on the enemy:

```python
import math
angle = math.atan2(own.position.y - enemy.position.y, own.position.x - enemy.position.x) + math.radians(26)
target = {"x": enemy.position.x + math.cos(angle) * R, "y": enemy.position.y + math.sin(angle) * R}
return [AimAt(enemy.position), FireIfSolution(min_hit_chance=0.35), MoveTo(target)]
```

**Flank** — aim for the side of the enemy's hull (thin armor), following as they
turn:

```python
import math
hull = math.radians(enemy.hull_heading)
px, py = -math.sin(hull), math.cos(hull)                     # perpendicular to their facing
if (own.position.x - enemy.position.x) * px + (own.position.y - enemy.position.y) * py < 0:
    px, py = -px, -py                                        # pick the nearer flank
return [AimAt(enemy.position), FireIfSolution(min_hit_chance=0.4),
        MoveTo({"x": enemy.position.x + px * R, "y": enemy.position.y + py * R})]
```

**Dodge a shell** — step perpendicular to an inbound projectile's path:

```python
import math
for shell in state.contacts.projectiles:
    if shell.owner_unit_id == state.self_id:
        continue
    vx, vy = shell.position.x - shell.previous_position.x, shell.position.y - shell.previous_position.y
    speed = math.hypot(vx, vy)
    if speed < 1e-6:
        continue
    nx, ny = -vy / speed, vx / speed                         # perpendicular to travel
    return [MoveTo({"x": own.position.x + nx * 7, "y": own.position.y + ny * 7})]
```

**Hold and tank** — this is the one place `FaceArmorToward` belongs: stand still
and angle your front armor at the threat while firing.

```python
return [FaceArmorToward(enemy.position), AimAt(enemy.position), FireIfSolution(min_hit_chance=0.4)]
```

---

## 5. Lifecycle & reading unit stats

Use `on_start` to cache your unit's spec (so you can tune ranges to the loadout):

```python
from robolocks import BattleState, OrderLike, run_bot

SENSOR_FOV = 120.0
WEAPON_RANGE = 80.0


def on_start(spec) -> None:
    global SENSOR_FOV, WEAPON_RANGE
    if spec is not None:
        SENSOR_FOV = spec.modules.sensor.fov
        WEAPON_RANGE = spec.modules.weapon.range


def on_tick(state: BattleState) -> list[OrderLike]:
    ...


run_bot(on_tick, on_start=on_start)
```

`spec` is a `UnitSpec` with `modules.{mobility, turret, weapon, armor, body,
sensor}` — each carries the numbers the engine uses (speeds, turn rates, range,
reload, armor thickness, etc.). See `sdk/python/robolocks/spec.py` for the exact
fields.

---

## 6. Pitfalls checklist

- **Blind bot?** You never issued a `ScanArc` — `contacts` stays empty. Scan at
  least once; it persists.
- **Unit won't go where I sent it?** You issued `FaceArmorToward` alongside
  `MoveTo`. The hull faces the armor target and drives there instead. Drop
  `FaceArmorToward` while maneuvering.
- **Stopped firing mid-battle?** You locked onto a wreck. Use `closest_enemy()`
  (skips wrecks) or check `unit.alive`.
- **Never fires despite a target?** The turret isn't on target — pair
  `FireIfSolution` with `AimAt`, and remember the reload cooldown between shots.
- **Double-fire order?** Submitting two `FireIfSolution` in one tick rejects the
  shot. Send exactly one.
- **Non-deterministic bot?** Don't use wall-clock time or unseeded randomness;
  derive any variation from `state.tick` / your unit id so replays reproduce.
- **Hardcoded map center?** `map.center` is a fixed `(20, 12)` rally point, not
  the true center of every arena — compute from live positions when it matters.

---

## 7. Starter tactics

The research workbench ships readable, dynamic starting points you can select and
edit — each is a complete worked example of the recipes above:

- **Charger** — rush to point-blank and brawl.
- **Skirmisher** — hold a preferred range band.
- **Orbiter** — circle the enemy and strafe.
- **Flanker** — swing to the weak side.
- **Evader** — kite at range and dodge shells.

Open one in the bot editor to see a full, runnable implementation. See also
`examples/bots/` for a standalone example.
