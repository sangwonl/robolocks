# Replay Schema v1

The replay file is the stable contract between the C++ engine, CLI recorder, and viewers.
The renderer must treat it as read-only data and must not infer simulation behavior that is not present in the replay.

## Top Level

```json
{
  "type": "robolocks.replay.v1",
  "tickRate": 30,
  "obstacles": [],
  "frames": []
}
```

- `type`: schema identifier. Current value is `robolocks.replay.v1`.
- `tickRate`: ticks per second used by the recorded battle.
- `obstacles`: static map obstacles relevant for rendering and debug overlays.
- `frames`: ordered list of recorded battle frames.

Future versions should add `battleConfig`, `moduleCatalogVersion`, and `engineVersion` at the top level rather than requiring viewers to reconstruct context from frames.

## Frame

Each frame is a snapshot after a simulation tick:

```json
{
  "tick": 1,
  "units": [],
  "projectiles": [],
  "events": [],
  "actions": []
}
```

- `tick`: engine tick index.
- `units`: unit snapshots after systems have advanced for the tick.
- `projectiles`: active projectile snapshots after projectile advancement.
- `events`: diagnostics and simulation events emitted during the tick.
- `actions`: public bot orders accepted for replay/debug display.

## Unit Snapshot

Unit snapshots expose runtime state and composed module specs:

- Identity and transform: `unitId`, `position`, `hullHeadingDeg`, `turretHeadingDeg`.
- Health/control state: `armorIntegrity`, `weaponCooldownTicks`.
- Shape: `bodyShape`.
- Composed specs: `modules.mobility`, `modules.turret`, `modules.weapon`, `modules.armor`, `modules.body`, `modules.sensor`.
- Current intents: `intents.mobility`, `intents.turret`, `intents.hull`, `intents.weapon`.

The `modules` object represents the final composed spec used by the engine, not raw catalog references.

## Events

Events are append-only diagnostic facts for a tick:

- `weapon_fired`
- `weapon_reloading`
- `fire_no_solution`
- `fire_solution_rejected`
- `armor_damage`
- `armor_bounced`
- `collision`
- order diagnostics such as `duplicate_mobility_order`

Event payload fields are optional by event type. Viewers should tolerate zero or empty payload fields.

## Compatibility Rules

- Viewers must reject unknown `type` values.
- Viewers should tolerate missing optional arrays as empty arrays only when parsing older development replays.
- New engine fields should be additive inside `payload`, `modules`, `intents`, or top-level metadata.
- Renaming existing fields requires a new replay schema version.
