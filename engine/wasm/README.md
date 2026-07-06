# Robolocks WASM Kernel

The web MVP loads the C++ kernel through Emscripten. The first export is intentionally small:

- `robolocks_engine_version() -> const char*`

Later tasks add match creation, stepping, snapshots, and command submission exports. Keep this ABI data-oriented and serializable.
