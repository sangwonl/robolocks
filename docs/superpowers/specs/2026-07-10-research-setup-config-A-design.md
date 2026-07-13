# Research Setup Config — Bundle A (per-bot units + rule params)

Make the research setup more configurable. **Bundle A** (this spec): per-bot unit
module set + editable rule parameters. **Bundle B** (later, separate spec): the
interactive Battle Field editor tab.

## Goals

1. Each bot (Blue = unit 1, Red = unit 2) can use its own **unit preset** (module
   set), chosen in the Bot logic row to the left of the logic preset.
2. The active **rule's key parameter** is editable next to the Rule dropdown:
   Kill Limit → kill count, Timed → time-limit ticks, Capture → flag hold ticks.

Non-goals: field editing (Bundle B); adding new unit/rule presets; changing the
engine.

## Data model (web state, persisted in `robolocks.research.v1`)

- Replace single `unitPresetId` with `unitPresetByUnit: Record<number, string>`
  (units 1 and 2), mirroring `botLogicByUnit`. Default: both `standard_tank`.
- Add rule params: `killLimit`, `timeLimitTicks`, `captureHoldTicks`
  (defaults 3 / 300 / 90). Only the active rule's param is used.
- Migration: old stored state without these fields falls back to defaults
  (derive `unitPresetByUnit` from the old `unitPresetId` if present).

## Config builder (`research.ts`)

- `createResearchBattleConfigJson` options: replace `unitPresetId` with
  `unitPresetIdByUnit: Record<number, string>`; add `ruleParams?: { killLimit?,
  timeLimitTicks?, captureHoldTicks? }`. Unit 1 uses `unitPresetIdByUnit[1]`,
  unit 2 uses `[2]` (fall back to the first preset).
- `createRuleConfig(rulePreset, battlePreset, ruleParams?)`: apply overrides —
  `killLimit`, `timeLimitTicks`, and `captureZones[].holdTicks` — when provided.

## UI (`app.tsx`)

- Remove the top-panel "Units" dropdown (now per-bot).
- Rule row: render one contextual param `<input type=number>` next to the Rule
  select, keyed to the selected rule's mode (kill/timed/capture). Hidden for
  modes without a param.
- Bot logic row grid `[Blue/Red] [logic ▾] [status]` → `[Blue/Red] [unit ▾]
  [logic ▾] [status]`; the unit select sits left of the logic select.
- The existing "Ticks" input is unchanged (max-ticks deadline / safety cap),
  independent of rule params.

## Tests

- `web/tests/research.test.mjs`: update the config-builder call sites; assert (a)
  per-unit modules land on units 1/2 in the config JSON, and (b) rule params flow
  into `rule` (killLimit / timeLimitTicks / captureZones[].holdTicks).

## Verification

Typecheck clean; web tests pass; manually confirm the setup panel shows per-bot
unit selects and the contextual rule param, and that a run reflects them.
