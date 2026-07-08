# Engine Boundary

Robolocks keeps simulation logic inside the engine kernel. UI, renderer, editor, and workers can request state transitions, but they do not own combat rules.

## Current Boundary

- C++ native target: used for tests and headless validation.
- C++ WASM target: used by the browser runtime.
- TypeScript worker: owns message passing and frame delivery.
- TypeScript UI: renders snapshots and events.

## Data Flow

```text
UI -> Simulation Worker -> Kernel step -> Snapshot/Event frame -> UI
```

Bot execution follows the same rule:

```text
Observation -> Bot Runtime -> Orders -> Kernel step
```

## Determinism Rule

The same engine version, runtime target, config, seed, catalog version, map, and orders must reproduce the same battle.
