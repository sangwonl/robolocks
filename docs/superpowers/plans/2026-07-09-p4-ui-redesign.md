# P4 UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the workbench visually systematic (design tokens instead of ~40 scattered hex literals), comfortably legible (type scale up from 8.5–10px), accessible (keyboard + ARIA), and honest about long research runs (worker-based execution with progress) — while keeping the existing dark, dense, terminal-adjacent aesthetic.

**Architecture:** (1) styles.css gains a token layer (`:root` custom properties) that every rule consumes; teamPalette emits the same tokens so TS and CSS share one color source. (2) Type/density and responsive fixes ride on the tokens. (3) Interaction a11y (resize handle, playback shortcuts, toggle states) is additive markup/handlers. (4) The research run moves off the main thread into a Web Worker (resurrecting the concept deleted as dead code in P1, now built on the current kernelAdapter API) with typed progress messages; Pyodide is vendored via npm for deterministic/offline loads.

**Tech Stack:** React 19 + TS + Vite; plain CSS custom properties (NOT a Tailwind migration — the stylesheet's existing idiom is kept); Web Worker (module type) + pyodide npm package.

## Global Constraints

- Green at the end of every task: `cd web && npm test && npm run typecheck && npm run build`. Engine untouched.
- Aesthetic frozen in spirit: same dark palette, same layout structure. Tasks 1 is a pure no-visual-diff refactor; Tasks 2–4 change visuals/behavior ONLY as each task specifies.
- No new styling systems: no Tailwind adoption beyond the existing `components/ui/*` usage, no CSS-in-JS.
- Existing test suites must keep passing; new behavior gets tests where DOM-free tests can express it (pure functions, worker message protocol), manual browser verification covers the rest (the controller has a Playwright harness at the session scratchpad `browser-verify/`).
- Commit per task: `refactor:`/`feat:`/`fix:` as fits, trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`, each paragraph a separate `-m` flag.
- Work from `/Users/sangwonl/Develops/projects/robolocks`.

---

### Task 1: Token layer in styles.css; teamPalette feeds the same tokens

**Files:**
- Modify: `web/src/ui/styles.css` (add `:root` custom-property block; replace every repeated hex/rgba literal with `var(--…)`; collapse the ~10 copies of the "panel label" recipe into a `.u-label` utility class applied in markup or via `composes`-style grouping of selectors), `web/src/ui/teamPalette.ts` (export the palette as CSS-injectable custom properties — e.g. a `teamCssVariables()` returning `{"--team-1-accent": "#5f9ee6", …}` applied once at the app root — and drop the now-redundant hardcoded team hexes from styles.css), `web/src/ui/app.tsx` (apply team CSS vars at the root element), any component whose markup gains `.u-label`
- Test: `web/tests/teamPalette.test.mjs` (extend: css-var output matches the TS palette)

**Interfaces:**
- Token naming: `--surface`, `--surface-raised`, `--surface-sunken`, `--line`, `--line-strong`, `--text`, `--text-muted`, `--accent`, `--accent-soft`, `--team-1-*`, `--team-2-*`, `--team-neutral-*` (adapt to the actual color inventory found — audit first, name by ROLE not by value).
- ZERO visual change: every `var()` must resolve to the exact literal it replaced. Audit method: `grep -oE "#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)" web/src/ui/styles.css | sort | uniq -c | sort -rn` before and after — afterwards, raw literals should appear ONLY inside the `:root` block.

- [ ] **Step 1:** Run the audit grep; build the value→role mapping table (put it in the report; ambiguous near-duplicates like #d9dfd1 vs #d4e164 map to distinct tokens — do not "consolidate" values in this task).
- [ ] **Step 2:** Add the `:root` block; mechanically replace literals with vars; collapse the label recipe.
- [ ] **Step 3:** teamPalette css-var bridge + root application + test.
- [ ] **Step 4:** Re-run the audit grep (literals only in `:root`); full suite/typecheck/build. Commit (`refactor: introduce css design tokens and unify team color source`).

---

### Task 2: Type scale, density, and responsive layout fix

**Files:**
- Modify: `web/src/ui/styles.css` only (plus any component with inline font-size, if the audit finds one)

**Changes (this task intentionally alters visuals):**
- Type scale: base body text 8.5–10px → 11px minimum for content text, 12px for primary values; keep micro-labels (the `.u-label` class) at 10px but no lower; introduce `--font-size-*` tokens on top of Task 1's layer. Preserve the dense feel by tightening `letter-spacing`/`line-height` where the bump makes rows visibly looser.
- Mobile/narrow layout (`max-width: 960px` block): the stacked rows currently sum to 114vh inside an `overflow: hidden` 100%-height grid, clipping the bottom panel. Rework to `grid-template-rows` fractions or `auto minmax(0,1fr) auto` so the three regions fit the viewport; the scene viewport gets the flexible row.
- The status/error line: give `role="status"` text a distinct error treatment (`--danger` token + icon or prefix) when the message is an error — read how status/error strings flow in app.tsx (the research hook exposes an error-ish status; if error and info share one string today, add the minimal flag needed, no redesign of the hook).

- [ ] **Step 1:** Screenshot baseline (controller harness) noted in report as before/after evidence to collect.
- [ ] **Step 2:** Implement; verify no horizontal scroll at 1440/1024/900/375px widths (report the check).
- [ ] **Step 3:** Full suite/typecheck/build. Commit (`feat: legible type scale, responsive layout fix, and error status treatment`).

---

### Task 3: Keyboard and ARIA interaction pass

**Files:**
- Modify: `web/src/ui/app.tsx` (resize handles: `tabIndex=0`, ArrowLeft/Right handling reusing the existing clamp logic, `aria-valuenow/min/max`), `web/src/ui/hooks/usePanelResize.ts` (expose a keyboard-step setter if the handler needs it), `web/src/ui/BattleSceneThreeView.tsx` (camera buttons get `aria-pressed`), `web/src/ui/PlaybackControls.tsx` + `web/src/ui/app.tsx` (global playback shortcuts: Space = play/pause, ArrowLeft/Right = prev/next frame, Shift+Arrow = ±10 — active only when a replay is loaded and focus is NOT in an input/textarea/Monaco; document the guard), `web/src/ui/styles.css` (`:focus-visible` rings using the token layer)
- Test: extend `web/tests/useReplayPlayback.test.mjs` ONLY if a pure function falls out (e.g. shortcut→action mapping table); DOM event wiring is manual-verified.

- [ ] **Step 1:** Implement resize-handle keyboard + ARIA; camera `aria-pressed`; playback shortcuts with the focus guard; focus-visible styles.
- [ ] **Step 2:** Full suite/typecheck/build. Commit (`feat: keyboard operability and aria states for workbench controls`).

---

### Task 4: Research runs in a Web Worker with progress; vendored Pyodide

**Files:**
- Create: `web/src/research/researchWorker.ts` (module worker: receives `{botSource, battleConfigJson, tickCount}`, loads Pyodide + WASM kernel inside the worker, runs the existing `runResearchInBrowser` logic, posts typed progress messages), `web/src/research/researchWorkerProtocol.ts` (message types: `{type:"progress", stage:"loading-python"|"installing-sdk"|"simulating", tick?, totalTicks?}`, `{type:"done", replay, logs}`, `{type:"error", message}`), `web/tests/researchWorkerProtocol.test.mjs` (protocol guards/parsers are pure — test them)
- Modify: `web/src/research/research.ts` (factor the run so the worker and any direct path share one implementation; loadPyodide switches from CDN `<script>` injection to the vendored npm package — worker-compatible `importScripts`/ESM import), `web/src/ui/hooks/useResearchRun.ts` + `web/src/ui/app.tsx` (drive the worker; progress states render over the scene viewport as a lightweight overlay: stage text + tick counter; cancel button terminates the worker), `web/package.json` (add `pyodide` dependency; vite config if asset copying is needed — check how the wasm kernel is already served from /wasm/ and mirror the approach)

**Interfaces & constraints:**
- The public API of `runResearchInBrowser` used by tests stays intact (tests inject mock runtimes — keep that seam; the worker is a wrapper, not a rewrite).
- Monaco/UI must remain interactive during a run (that's the point) — the overlay blocks only the viewport, not the editor.
- Pyodide vendoring: `pyodide` npm package pins the version currently used (0.26.4 — check research.ts); the CDN path is removed. Bundle size: worker + pyodide assets load lazily on first run, NOT in the main bundle (dynamic import / vite worker chunk — verify with `npm run build` output and report chunk sizes).
- If Pyodide-in-worker hits a Vite dev/build incompatibility that cannot be resolved cleanly, STOP and report the exact error (BLOCKED) rather than shipping a degraded hybrid.

- [ ] **Step 1:** Protocol module + tests (pure) → green.
- [ ] **Step 2:** Worker implementation + research.ts factoring; hook/UI wiring with overlay + cancel.
- [ ] **Step 3:** Full suite/typecheck/build (report worker chunk size); controller browser-verifies: first run shows staged progress, editor stays responsive, cancel works, run completes with replay + logs.
- [ ] **Step 4:** Commit (`feat: run research in a web worker with progress and vendored pyodide`).

---

## Self-Review Notes

- Coverage vs original review: item 14 (styling unification) = Tasks 1–2; item 16 (legibility/a11y/mobile) = Tasks 2–3; item 15 (research UX) = Task 4. P3 fold-ins: teamPalette css fields → Task 1; new speed-select hexes → Task 1 audit; Stat atom relocation intentionally dropped (cosmetic file-boundary nit, not worth a task).
- Task 4 is the largest and riskiest (worker + pyodide packaging); it is last so the styling/a11y wins land regardless of its outcome.
- Tasks 2–4 change visible behavior by design — each task's report must include what the controller should screenshot; final browser pass at plan end with before/after screenshots for the user.
