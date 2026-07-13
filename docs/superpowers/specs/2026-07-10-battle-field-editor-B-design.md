# Battle Field Editor — Bundle B (2D top-down)

An interactive editor for the battle field, shown as a "Battle Field" tab beside
"Battle Scene" in the center. v1 supports rect + circle fields; obstacle, flag,
and spawn placement by drag. Height is not authored — the sim is 2D (x/y only)
and the 3D scene supplies fixed per-element heights automatically.

## Scope

In: rect/circle field with drag resize; add/move/resize/remove obstacles; drag
flag; drag Blue/Red spawns (respawn zones derived from spawn position). Persisted
as a "Custom" battle, selectable in the Battle dropdown.

Out (v1): polygon editing, pan/zoom, multiple flags, undo/redo.

## Data model (`research.ts`)

```ts
type EditableObstacle = { id: string; x: number; y: number; radius: number };
type CustomBattleLayout = {
  field: { shape: "rect" | "circle"; cx: number; cy: number; rx: number; ry: number }; // circle: rx===ry===radius
  obstacles: EditableObstacle[];
  flag: { x: number; y: number };
  blueSpawn: { x: number; y: number; headingDeg: number };
  targetSpawn: { x: number; y: number; headingDeg: number };
};
```

Pure functions (unit-tested):

- `layoutFromPreset(preset): CustomBattleLayout` — fork a preset's field/obstacles/
  flag/spawns into an editable layout.
- `layoutToBattlePreset(layout): ResearchBattlePreset` — rect → `field {min,max}`;
  circle → `field {min,max, shape:{type:"circle",center,radiusMeters}}`; obstacles →
  `{id,position,radiusMeters,blocksMovement,blocksLineOfSight:true}`; flag →
  `flagPosition`; spawns → `blueSpawn/targetSpawn` + derived respawn zones.
- Reducer ops (pure, return a new layout): `moveObstacle/resizeObstacle/addObstacle/
  removeObstacle/moveFlag/moveSpawn/setFieldShape/resizeField/moveField`, each
  clamping into the field.

`createResearchBattleConfigJson` gains `customBattle?: ResearchBattlePreset`; when
`battlePresetId === "custom"` it uses that instead of a preset lookup. (Engine
unchanged — output is the existing config format.)

## State (`useResearchRun.ts`)

- `customBattleLayout: CustomBattleLayout` (persisted). Setter dispatches reducer
  ops. Selecting "Custom" (or first edit) forks the current preset via
  `layoutFromPreset`. Config memo passes `layoutToBattlePreset(customBattleLayout)`
  as `customBattle` when the battle id is "custom".

## Editor component (`BattleFieldEditor.tsx`)

2D **SVG** top-down. World↔SVG via a fit transform (field bounds + margin →
viewBox). Renders field outline/fill, ~2m grid, obstacles (with a radius handle
when selected), flag, Blue/Red spawn markers, and field resize handles. Pointer
handlers drag elements (screen→world), click empty adds an obstacle, selection
shows delete + radius handle. Shape toggle (rect/circle) and delete controls.

## Center tab (`app.tsx`)

Add a dockview `battleField` panel tabbed within the `battle` panel. Add a
"Custom" option to the Battle dropdown; selecting it (or editing) uses the custom
layout. The editor reads/writes `customBattleLayout` through the panel context.

## Tests

`research.test.mjs`: `layoutFromPreset`/`layoutToBattlePreset` round-trip and the
reducer ops (move/resize/add/remove/clamp); custom layout → config JSON
(rect and circle field, obstacles, flag, spawns).

## Verification

Typecheck clean; web tests pass; manually: open Battle Field tab, drag obstacles/
flag/spawns, toggle rect/circle, run — the 3D scene reflects the edited layout.
