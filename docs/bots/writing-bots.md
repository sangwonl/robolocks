# Writing Bots

The complete authoring guide and API reference for Robolocks bots: the movement
model, every order, every field of the observation, targeting & firing, movement
recipes, and the pitfalls that trip people up. For how bots are executed (tick
loop, lifecycle, runtimes, determinism), see [bot-system.md](bot-system.md).
For evaluating saved bots and imported GitHub bots, see
[arena-guide.md](arena-guide.md). For publishing bots from a GitHub repo, see
[deploy-bot.md](deploy-bot.md).

A bot is a Python module that ends with `run_bot(on_tick)`. Import everything
from the top-level `robolocks` package. `on_tick` receives a `BattleState` and
returns an iterable of orders.

```python
from robolocks import AimAt, BattleState, FireIfSolution, MoveTo, OrderLike, ScanArc, run_bot


def on_tick(state: BattleState) -> list[OrderLike]:
    own = state.own_unit
    enemy = state.contacts.closest_enemy()          # nearest LIVE enemy, or None
    if not enemy:
        return [ScanArc(direction=own.turret_heading, width=160.0)]
    return [
        AimAt(enemy.position),                       # turret tracks the target (independent of the hull)
        ScanArc(direction=own.turret_heading, width=160.0),  # sensor rides the turret; look where we aim
        FireIfSolution(min_hit_chance=0.3),          # fire when a good-enough solution exists
        MoveTo(enemy.position),                      # drive toward the enemy (hull steers where it moves)
    ]


run_bot(on_tick)
```

---

## 1. The mental model (read this first)

Four facts drive every bot. Get these wrong and your unit spins, stalls, or sits
blind.

### Movement is tank-like, not free

A unit **moves forward along its hull heading**. It does not slide toward a
`MoveTo` target directly. Instead:

- `MoveTo(target)` steers the **hull** toward `target` (turning at the hull's
  turn rate) and drives forward — so to go somewhere, just `MoveTo` there.
- `FaceArmorToward(target)` **overrides** hull steering to point the hull's front
  (thickest) armor at `target`. While active, the hull faces `target`, so the
  unit drives *toward `target`*, ignoring `MoveTo`'s direction.

> **Never combine `MoveTo` and `FaceArmorToward` in the same tick to go one way
> while facing another — they both fight over the hull heading.** Use `MoveTo`
> alone to maneuver; use `FaceArmorToward` (without `MoveTo`) only while holding
> position to angle armor at the enemy.

### The turret is independent

`AimAt(target)` steers the **turret** toward `target` at the turret's turn rate,
regardless of where the hull points or moves. A unit can drive one direction and
keep its gun on the enemy — strafing, kiting, and orbiting all work because
`AimAt` is decoupled from `MoveTo`.

### The sensor is mounted on the turret

The sensor rides on the turret (hull → turret → sensor). Its origin and its scan
cone track the turret. So the natural way to look where your gun points is to scan
along the **turret** heading: `ScanArc(direction=own.turret_heading, ...)`.

### You must scan to see

The sensor reports contacts **only while a `ScanArc` is active**, and a scan arc
**persists** until you issue a new one. Consequences:

- Issue `ScanArc` or your `contacts` stay empty (you're blind). A brand-new unit
  has no scan arc until its bot sets one.
- Because it persists, you don't have to resend it every tick — but the arc's
  *direction* stays where you last aimed it (the cone's origin still tracks the
  turret each frame; only the beam direction is frozen at the last request). To
  keep the sensor pointed at a moving fight, reissue `ScanArc` each tick.

---

## 2. Orders

Return an iterable of orders from `on_tick`. **At most one order per channel per
tick** (see [bot-system.md](bot-system.md#one-order-per-channel-per-tick)).
Positions are in **meters**, angles in **degrees**.

| Order | Signature | Channel | Effect |
| --- | --- | --- | --- |
| `MoveTo(position)` | `position: VecLike` | mobility | Drive to `position` (hull steers toward it). |
| `AimAt(target)` | `target: VecLike` | turret | Turn the turret to bear on `target`. |
| `FaceArmorToward(target)` | `target: VecLike` | hull | Turn the hull so front armor faces `target` (stationary use). |
| `FireIfSolution(min_hit_chance)` | `min_hit_chance: float` | weapon | Fire this tick if a valid solution with hit chance ≥ `min_hit_chance` exists. |
| `ScanArc(direction, width, range=0.0)` | degrees, degrees, meters | sensor | Point the sensor. `range=0` means the sensor's max range. |

- `VecLike` = a `Vec2`, anything with `.x`/`.y`, or a `{"x", "y"}` dict.
- Submitting two of the same order kind in one tick uses only the first —
  **except `FireIfSolution`, where two in one tick *reject* the shot** (a
  double-fire guard). Send exactly one of each.
- You may also return a raw dict order (advanced); the typed classes above are
  the supported surface.

---

## 3. The observation (`BattleState`)

`on_tick(state)` receives a `BattleState` — everything your unit can see this
tick. Every type below is a frozen dataclass.

### `BattleState`

| Field / prop | Type | Notes |
| --- | --- | --- |
| `tick` | `int` | current simulation tick |
| `self_id` | `int` | your unit id |
| `own_unit` | `UnitState` | your own unit |
| `self` | `UnitState` | alias for `own_unit` |
| `contacts` | `ContactSet` | what you sense right now |
| `map` | `BattleMap` | static map info |

### `UnitState` (your unit, and each contact)

| Field | Type | Notes |
| --- | --- | --- |
| `unit_id` | `int` | |
| `team_id` | `int` | |
| `is_enemy` | `bool` | enemy relative to the observing unit |
| `name` | `str` | |
| `position` | `Vec2` | meters |
| `hull_heading` | `float` | degrees |
| `turret_heading` | `float` | degrees — where the gun/sensor points |
| `armor_integrity` | `float` | current armor; `0` = destroyed |
| `weapon_cooldown` | `int` | ticks left until it can fire again |
| `intent` | `UnitIntents` | the unit's active per-channel intents |

Properties & methods:

- `unit.alive` → `armor_integrity > 0` (False for wrecks).
- `unit.can_fire` → `weapon_cooldown == 0 and not intent.weapon.active`.
- `unit.distance_to(other)` → meters to another `UnitState` or any `VecLike`.

### `UnitIntents` (`unit.intent`) and intent channels

Tells you what the unit is currently trying to do, so you can avoid re-issuing
orders needlessly.

| Field | Type |
| --- | --- |
| `intent.mobility` | `IntentState` |
| `intent.turret` | `IntentState` |
| `intent.hull` | `IntentState` |
| `intent.weapon` | `WeaponIntentState` |

`IntentState`:

| Field / method | Type | Notes |
| --- | --- | --- |
| `active` | `bool` | is this channel pursuing a target |
| `target` | `Vec2` | the goal position |
| `remaining` | `float` | meters left (mobility) |
| `error` | `float` | degrees off target (turret/hull) |
| `age` | `int` | ticks since the intent was set |
| `should_reissue(target, threshold_m=5.0, min_age_ticks=20)` | `bool` | True if inactive, or old enough (`age ≥ min_age_ticks`) and the goal drifted past `threshold_m` |

`WeaponIntentState`: `active: bool`, `min_hit_chance: float`, `age: int`.

### `ContactSet` (`state.contacts`)

Everything the sensor sees this tick, **sorted nearest-first**.

| Member | Type | Notes |
| --- | --- | --- |
| `units` | `tuple[UnitState, ...]` | sensed units — enemies AND allies, plus wrecks |
| `obstacles` | `tuple[Obstacle, ...]` | sensed obstacles |
| `projectiles` | `tuple[ProjectileContact, ...]` | sensed in-flight shells |
| iterate / `len(contacts)` | — | iterating yields `units`; `len` is the unit count |
| `closest_enemy(include_wrecks=False)` | `UnitState \| None` | nearest LIVE enemy; pass `include_wrecks=True` to include destroyed hulls |

> **Wrecks linger.** A destroyed unit stays in `contacts.units` as a wreck until
> it respawns (if the rule allows). `closest_enemy()` skips wrecks by default —
> always target through it (or filter on `unit.alive`) so your bot doesn't lock
> onto a corpse and stall.

### `Obstacle`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `str` | |
| `position` | `Vec2` | |
| `radius` | `float` | meters |
| `blocks_movement` | `bool` | collides with units |
| `blocks_line_of_sight` | `bool` | blocks your sensor and shots (use for cover) |

### `ProjectileContact`

| Field | Type | Notes |
| --- | --- | --- |
| `projectile_id` | `int` | |
| `owner_unit_id` | `int` | who fired it (skip your own) |
| `previous_position` | `Vec2` | last tick's position |
| `position` | `Vec2` | this tick's position |
| `radius` | `float` | meters |
| `previous_height` | `float` | last tick's height (ballistic arc) |
| `height` | `float` | this tick's height |

Travel direction is `position - previous_position` — use it to dodge (see
recipes).

### `BattleMap` (`state.map`)

- `map.obstacles` → `tuple[Obstacle, ...]` for the whole map.
- `map.center` → a fixed reference point, currently `Vec2(20, 12)`. It is a
  convenience rally point, **not** guaranteed to be the geometric center of large
  or custom arenas — prefer computing positions from your own/enemy position when
  you need precision.

### Geometry (`Vec2`, `distance`)

| API | Notes |
| --- | --- |
| `Vec2(x, y)` | frozen; `.x`, `.y` |
| `vec.offset(x=0.0, y=0.0)` | returns a shifted `Vec2` |
| `vec.distance_to(other)` | meters to any `VecLike` |
| `distance(a, b)` | module-level; meters between any two `VecLike` |
| `VecLike` | `Vec2` \| object with `.x`/`.y` \| `{"x", "y"}` dict |

Headings use `atan2(dy, dx)` degrees: `0°` = +x, `90°` = +y. Use `import math`
for your own trig.

---

## 4. Sensing

- The sensor is turret-mounted, so `ScanArc(direction=own.turret_heading, ...)`
  aims it where the gun points. `direction` is an **absolute world angle**, so
  you can also scan anywhere else (e.g. toward a known enemy) independent of the
  turret.
- `width` is clamped to the sensor's field of view; `range` (`0` = max) is clamped
  to the sensor's range (read the actual numbers in `on_start`, section 6).
- Obstacles with `blocks_line_of_sight` occlude the sensor — a contact behind
  cover won't appear.
- Contacts appear only while a scan arc is active, and it persists (section 1).

---

## 5. Firing

`FireIfSolution(min_hit_chance)` fires only when **all** hold:

- The weapon is **off cooldown** (after firing it reloads for `reload_ticks`;
  watch `unit.weapon_cooldown` / `unit.can_fire`).
- A live, targetable enemy is within **weapon range**.
- The **turret is aimed** at it within the weapon's aim tolerance — aim error is
  measured from the turret pivot, so point-blank targets still resolve.
- The resulting **hit chance ≥ `min_hit_chance`**.

Use `min_hit_chance=0.0` to fire whenever any target is in the solution
(aggressive), or a higher value (e.g. `0.5`) to hold fire until the shot is good.
Always pair `FireIfSolution` with `AimAt` — the gun must be on target to fire.

---

## 6. Lifecycle & reading your unit's stats

```python
run_bot(on_tick, on_start=None, on_end=None)
```

- `on_tick(state: BattleState) -> Iterable[OrderLike]` — required; every tick.
- `on_start(spec: UnitSpec | None) -> None` — optional; once before the first
  tick. `spec` is your full loadout; may be `None` if no start payload arrived.
- `on_end(result) -> None` — optional; once when the bot is torn down.

```python
SENSOR_FOV = 120.0
WEAPON_RANGE = 80.0
RELOAD = 30


def on_start(spec) -> None:
    global SENSOR_FOV, WEAPON_RANGE, RELOAD
    if spec is not None:
        SENSOR_FOV = spec.modules.sensor.fov
        WEAPON_RANGE = spec.modules.weapon.range
        RELOAD = spec.modules.weapon.reload_ticks
```

`spec` (`UnitSpec`) fields: `unit_id`, `team_id`, `name`, `position: Vec2`,
`hull_heading: float`, `modules: UnitModulesSpec`.

`modules` (`UnitModulesSpec`) carries the exact numbers the engine uses:

| Module | Fields |
| --- | --- |
| `mobility` (`MobilitySpec`) | `id`, `max_speed` (m/s), `max_hull_turn` (deg/s) |
| `turret` (`TurretSpec`) | `id`, `heading` (deg), `max_turn` (deg/s) |
| `weapon` (`WeaponSpec`) | `id`, `fire_mode` (`"direct"`/`"ballistic"`), `damage`, `penetration` (mm), `range` (m), `muzzle_velocity` (m/s), `muzzle_offset` (`Vec3`), `launch_angle` (deg), `gravity` (m/s²), `blast_radius` (m), `projectile_radius` (m), `aim_tolerance` (deg), `reload_ticks` |
| `armor` (`ArmorSpec`) | `id`, `integrity`, `front` (mm), `side` (mm), `rear` (mm) |
| `body` (`BodySpec`) | `id`, `mass` (kg), `shape` (`BodyShapeSpec`: `type`, `radius`, `length`, `width` — meters) |
| `sensor` (`SensorSpec`) | `id`, `range` (m), `fov` (deg), `refresh_ticks` |

`Vec3` is `x`, `y`, `z` (meters).

---

## 7. Movement recipes

All steer with `MoveTo` (hull follows), keep the gun on target with `AimAt`, and
scan along the turret. Never `FaceArmorToward` while maneuvering.

**Chase / close in:**

```python
return [AimAt(enemy.position), ScanArc(direction=own.turret_heading, width=160.0),
        FireIfSolution(min_hit_chance=0.0), MoveTo(enemy.position)]
```

**Hold optimal range** — move to a point `R` m from the enemy along the line to us:

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

**Flank** — aim for the enemy's hull side (thin armor), following as they turn:

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

**Hold and tank** — the one place `FaceArmorToward` belongs: stand still and angle
front armor at the threat while firing:

```python
return [FaceArmorToward(enemy.position), AimAt(enemy.position), FireIfSolution(min_hit_chance=0.4)]
```

---

## 8. Pitfalls checklist

- **Blind bot?** You never issued a `ScanArc` — `contacts` stays empty. Scan at
  least once; it persists.
- **Unit won't go where I sent it?** You issued `FaceArmorToward` alongside
  `MoveTo`. Drop `FaceArmorToward` while maneuvering.
- **Sensor/cone points the wrong way?** The scan direction is what *you* pass to
  `ScanArc`. For a turret-mounted sensor, pass `own.turret_heading` (and reissue
  each tick to track the turret through a fight).
- **Stopped firing mid-battle?** You locked onto a wreck. Use `closest_enemy()`
  (skips wrecks) or check `unit.alive`.
- **Never fires despite a target?** The turret isn't on target — pair
  `FireIfSolution` with `AimAt`, and mind the reload cooldown (`unit.can_fire`).
- **Double-fire order?** Two `FireIfSolution` in one tick reject the shot. Send
  exactly one.
- **Non-deterministic bot?** No wall-clock time or unseeded randomness; derive any
  variation from `state.tick` / your unit id so replays reproduce.
- **Hardcoded map center?** `map.center` is a fixed `(20, 12)` rally point, not
  the true center of every arena.

---

## 9. Starter tactics

The Hangar ships readable, dynamic starting points you can select and
edit — each is a complete worked example of the recipes above:

- **Charger** — rush to point-blank and brawl.
- **Skirmisher** — hold a preferred range band.
- **Orbiter** — circle the enemy and strafe.
- **Flanker** — swing to the weak side.
- **Evader** — kite at range and dodge shells.

Open one in the Hangar bot editor (the **Guide ↗** link there points back here).
Save a promising build, then evaluate it in Arena with
[arena-guide.md](arena-guide.md). See also `examples/bots/` for a standalone
example.
