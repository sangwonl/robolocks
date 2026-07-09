# P3 Web Frontend Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the web frontend's three structural liabilities — name-string team identity, the app.tsx god component with its setInterval playback, and the rebuild-everything-per-frame Three.js scene — without changing what the user sees (except an added playback-speed control).

**Architecture:** (1) Team identity flows from the `teamId` field that P1 added to `UnitFrame` (engine-supplied), through one team-palette module, into scene colors, scan arcs, and unit-card accents — replacing three independent `name.includes("red")`-style hacks. (2) app.tsx decomposes into custom hooks (`useReplayPlayback`, `useResearchRun`, `usePanelResize`) and per-component files; playback moves from setInterval-driven state to a rAF elapsed-time→frame-index loop with a speed multiplier. (3) The Three.js view keeps ONE persistent scene: statics (ground/grid/lights/obstacles) build once per replay, units become persistent rigs updated per frame, shared geometries/materials are cached.

**Tech Stack:** React 19 + TypeScript + Vite; three@0.185; tests via `node --experimental-strip-types --test` (jsdom-free — scene tests are pure-object tests on THREE scene graphs).

## Global Constraints

- Green at the end of every task: `cd web && npm test && npm run typecheck && npm run build`. Engine untouched (no engine/ or fixtures/ changes in this plan).
- Visual behavior frozen except where a task explicitly adds UI (speed control). Colors currently rendered for Blue/Red units must remain the same colors — derived from teamId instead of name.
- The public interfaces consumed by research.ts (`createResearchDuelWithJsonBotFromWasmFactory`, `KernelBattleRunner`) and the replay loader are frozen.
- File conventions: components in `web/src/ui/`, one component per file, hooks in `web/src/ui/hooks/`, pure helpers in plain .ts modules with unit tests.
- Commit per task: `refactor:` prefix (`feat:` for the speed control task), trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`, each paragraph a separate `-m` flag.
- Work from `/Users/sangwonl/Develops/projects/robolocks`.

---

### Task 1: Team identity from teamId via one palette module

**Files:**
- Create: `web/src/ui/teamPalette.ts`, `web/tests/teamPalette.test.mjs`
- Modify: `web/src/ui/battleSceneThreeScene.ts` (`unitColor` ~line 511-523 and the scan-arc color site ~line 436 stop reading `name`), `web/src/ui/app.tsx` (`data-side={unit.name.toLowerCase()}` unit-card accent, ~line 589), `web/src/ui/styles.css` (the `[data-side="blue"|"red"]` selectors become team-keyed, e.g. `[data-team="1"]`)

**Interfaces:**
- Produces: `teamPalette.ts` exporting `teamColor(teamId: number): { body: number; accent: number; arc: number; css: string }` (exact shape may adapt to what the three call sites need — read them first). Team 1 must map to the current "blue" colors, team 2 to the current "red" colors (copy the hex values verbatim from the current code), other/0 to the current neutral gray fallback.
- `UnitFrame.teamId` already exists (web/src/types/protocol.ts) and carries real engine data; frames also carry real `name` — display keeps using `name`, but COLOR decisions use only `teamId`.

- [ ] **Step 1:** Read the three color sites; write failing teamPalette tests (team 1 → current blue hexes, team 2 → current red hexes, 0/3 → gray fallback).
- [ ] **Step 2:** Implement teamPalette.ts; migrate the three sites; delete the `name.includes` logic; update styles.css selectors and the JSX that feeds them.
- [ ] **Step 3:** Check the scene test (web/tests/battleSceneThreeScene.test.mjs) — if it constructs units with names but no teamId, extend its fixtures with teamId; assertions on colors must keep passing with identical color values.
- [ ] **Step 4:** Full web suite + typecheck + build → green. Commit (`refactor: derive team colors from teamId via a palette module`).

---

### Task 2: Extract pure helpers and presentational components out of app.tsx

**Files:**
- Create: `web/src/ui/unitFormat.ts` + `web/tests/unitFormat.test.mjs` (the pure formatting helpers currently at app.tsx ~lines 642-723), `web/src/ui/PlaybackControls.tsx`, `web/src/ui/RuleSummary.tsx`, `web/src/ui/Inspector.tsx` (incl. UnitCard), `web/src/ui/BotConsole.tsx`
- Modify: `web/src/ui/app.tsx` (imports the extracted pieces; keeps state/orchestration for now — hooks move in Task 3)

**Interfaces:**
- Produces: each component file exports the component with a typed props interface derived from what app.tsx currently passes (read the JSX call sites first; do not redesign props — this is extraction, not redesign).
- unitFormat.ts exports the pure helpers with their current names/signatures; the new test pins their current output on representative inputs (a fully-populated UnitFrame from the golden fixture is a good source: web/tests can import fixtures/contracts/frame.golden.json).

- [ ] **Step 1:** Write failing unitFormat tests using golden-fixture data (values must be the CURRENT formatter output — run/derive them from the current code, not idealized).
- [ ] **Step 2:** Extract unitFormat.ts → tests pass. Extract the four components file-by-file, moving their styles-coupled markup verbatim; app.tsx shrinks accordingly.
- [ ] **Step 3:** Full web suite + typecheck + build → green; `grep -c "^" web/src/ui/app.tsx` reported before/after in the report. Commit (`refactor: extract presentational components and format helpers from app.tsx`).

---

### Task 3: Playback and orchestration hooks; rAF playback with speed control

**Files:**
- Create: `web/src/ui/hooks/useReplayPlayback.ts` + `web/tests/useReplayPlayback.test.mjs` (pure frame-index math extracted testable: `frameIndexAt(elapsedMs, tickRate, speed, frameCount)` or similar), `web/src/ui/hooks/useResearchRun.ts`, `web/src/ui/hooks/usePanelResize.ts`
- Modify: `web/src/ui/app.tsx` (state moves into the hooks; setInterval playback ~lines 94-114 replaced by the rAF hook; NaN guard on the research-ticks input ~line 283: `Number("")` must not reach state), `web/src/ui/PlaybackControls.tsx` (speed selector UI: 0.5× / 1× / 2× / 4×), `web/src/ui/styles.css` (speed control styling consistent with the existing playback bar)

**Interfaces:**
- `useReplayPlayback(replay): { frameIndex, isPlaying, play, pause, seek, speed, setSpeed }` — rAF loop maps elapsed wall time × speed × tickRate to a frame index (no drift accumulation); pauses at the last frame like today.
- `useResearchRun` and `usePanelResize` encapsulate exactly the state/effects app.tsx holds today for those concerns (read first; move, don't redesign). The imperative resize listeners keep their behavior.
- Frame-index math lives in a pure exported function so the node test can pin it without DOM/rAF.

- [ ] **Step 1:** Failing test for the pure frame-index function (0 elapsed → 0; exact multiples; speed 2× doubles progression; clamps at frameCount-1).
- [ ] **Step 2:** Implement hooks; migrate app.tsx; add the speed selector to PlaybackControls; NaN guard.
- [ ] **Step 3:** Full web suite + typecheck + build → green. Commit (`feat: raf-based replay playback with speed control` — feat because of the new speed UI).

---

### Task 4: Persistent Three.js scene — build statics once, update unit rigs per frame

**Files:**
- Modify: `web/src/ui/battleSceneThreeScene.ts` (split `buildBattleScene` into `createStaticScene(replayMeta)` [ground/grid/lights/obstacles once] + `syncUnits(scene, unitRigs, frame)` [persistent `Map<unitId, UnitRig>`: create on first sight, update transforms/armor-tint/turret-heading per frame, remove on disappearance] + `syncProjectilesAndEffects(...)` [reuse pooled/cached geometries]; module-level caches for shared geometries/materials with an explicit dispose path), `web/src/ui/BattleSceneThreeView.tsx` (the per-frame effect ~lines 127-140 stops disposing/recreating the scene; scene created per replay-load, frame changes only call the sync functions; renderer/camera/resize handling unchanged), `web/tests/battleSceneThreeScene.test.mjs` (adapt construction API; keep existing assertions about scene contents, add: two consecutive sync calls reuse the same rig object identities, and unit meshes' positions update)

**Interfaces:**
- The view keeps its existing props (frames/camera mode) — only internals change.
- Disposal contract: switching replays disposes the old scene fully (no leak); frame stepping disposes nothing.

- [ ] **Step 1:** Read battleSceneThreeScene.ts + the view + its test fully; write the new-API test cases (rig persistence, position update, statics identity across frames) — failing.
- [ ] **Step 2:** Implement the split + rig map + caches; rewire the view.
- [ ] **Step 3:** Full web suite + typecheck + build → green. Commit (`refactor: persistent three.js scene with per-frame unit rig updates`).

---

## Self-Review Notes

- Coverage vs original review: item 13 (teamId colors) = Task 1; item 11 (app.tsx god component) = Tasks 2+3; playback architecture + speed control = Task 3; item 12 (scene rebuild) = Task 4. Items 9/10 (simWorker, frame parsing) were completed in P1 Task 4 — nothing left.
- Order rationale: Task 1 is smallest and independent; 2 before 3 so hooks land in an already-thinner app.tsx; 4 last (biggest, independent of 1-3 except team colors, which it consumes).
- After Task 4, the controller (not a subagent) should run the dev server and visually verify: replay load, playback incl. speed, camera toggle, team colors, research run — the node test suite cannot see pixels.
