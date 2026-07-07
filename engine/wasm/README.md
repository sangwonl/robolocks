# Robolocks WASM Kernel

The web shell loads the C++ engine runtime through Emscripten. The ABI is intentionally data-oriented:

- create/destroy a preset `BattleRuntime`
- step or run ticks inside the engine runtime
- read snapshot fields through primitive accessors

Platform shells should not own command generation or simulation ticks.
