#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

EMSDK_VERSION="${EMSDK_VERSION:-4.0.16}"
EMSDK_DIR="${EMSDK_DIR:-$ROOT_DIR/.emsdk}"
BUILD_TYPE="${BUILD_TYPE:-Release}"
BUILD_DIR="${BUILD_DIR:-}"
TARGET="${TARGET:-robolocks_wasm}"

if [[ "$EMSDK_DIR" != /* ]]; then
  EMSDK_DIR="$ROOT_DIR/$EMSDK_DIR"
fi

print_help() {
  cat <<'EOF'
Usage: scripts/build-wasm.sh [OPTIONS] [COMMAND] [TARGET]

Commands:
  all        Configure, build, and sync wasm assets (default)
  setup      Install and activate EMSDK
  configure  Configure the Emscripten CMake build
  build      Build the wasm target
  sync       Copy built wasm artifacts into web/public/wasm
  clean      Remove the wasm build directory

Options:
  -d         Debug build
  -r         Release build (default)
  -h         Show help

Environment:
  EMSDK_DIR      EMSDK location (default: ./.emsdk)
  EMSDK_VERSION  EMSDK version to install/activate (default: 4.0.16)
  BUILD_DIR      CMake build directory
EOF
}

resolve_build_dir() {
  if [[ -n "$BUILD_DIR" ]]; then
    if [[ "$BUILD_DIR" != /* ]]; then
      BUILD_DIR="$ROOT_DIR/$BUILD_DIR"
    fi
    return
  fi

  local suffix
  suffix="$(echo "$BUILD_TYPE" | tr '[:upper:]' '[:lower:]')"
  BUILD_DIR="$ROOT_DIR/build-wasm-$suffix"
}

setup_emsdk() {
  if [[ ! -f "$EMSDK_DIR/emsdk" ]]; then
    rm -rf "$EMSDK_DIR"
    git clone https://github.com/emscripten-core/emsdk.git "$EMSDK_DIR"
  fi

  (
    cd "$EMSDK_DIR"
    ./emsdk install "$EMSDK_VERSION"
    ./emsdk activate "$EMSDK_VERSION"
  )
}

load_emsdk() {
  local original_emsdk_dir="$EMSDK_DIR"

  if [[ ! -d "$EMSDK_DIR" ]]; then
    for candidate in "$ROOT_DIR/.emsdk" "$HOME/emsdk" "/opt/emsdk"; do
      if [[ -d "$candidate" ]]; then
        EMSDK_DIR="$candidate"
        break
      fi
    done
  fi

  if [[ ! -d "$EMSDK_DIR" ]]; then
    setup_emsdk
  fi

  if [[ ! -f "$EMSDK_DIR/emsdk_env.sh" || ! -f "$EMSDK_DIR/.emscripten" ]]; then
    setup_emsdk
  fi

  # shellcheck disable=SC1091
  source "$EMSDK_DIR/emsdk_env.sh" >/dev/null

  if [[ -z "${EMSDK:-}" ]]; then
    export EMSDK="$original_emsdk_dir"
  fi

  export EMSDK="$EMSDK_DIR"
  export EMSCRIPTEN_ROOT="${EMSCRIPTEN_ROOT:-$EMSDK_DIR/upstream/emscripten}"
  export EM_CACHE="${EM_CACHE:-$ROOT_DIR/.emscripten_cache}"
  mkdir -p "$EM_CACHE"

  if ! command -v emcmake >/dev/null 2>&1; then
    echo "error: emcmake not found after loading EMSDK: $EMSDK_DIR" >&2
    exit 1
  fi
}

configure_project() {
  resolve_build_dir
  load_emsdk

  local toolchain_file="$EMSDK_DIR/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake"
  if [[ ! -f "$toolchain_file" ]]; then
    echo "error: Emscripten toolchain file not found: $toolchain_file" >&2
    exit 1
  fi

  emcmake cmake -S "$ROOT_DIR" -B "$BUILD_DIR" \
    -DCMAKE_BUILD_TYPE="$BUILD_TYPE" \
    -DCMAKE_TOOLCHAIN_FILE="$toolchain_file" \
    -DCMAKE_CXX_COMPILER=em++ \
    -DCMAKE_C_COMPILER=emcc
}

build_project() {
  resolve_build_dir
  load_emsdk
  cmake --build "$BUILD_DIR" --target "$TARGET"
}

sync_project() {
  resolve_build_dir
  ROBOLOCKS_WASM_BUILD_DIR="$BUILD_DIR" node "$SCRIPT_DIR/sync-wasm.mjs"
}

clean_project() {
  resolve_build_dir
  rm -rf "$BUILD_DIR"
}

while getopts "hdr" opt; do
  case "$opt" in
    h)
      print_help
      exit 0
      ;;
    d) BUILD_TYPE="Debug" ;;
    r) BUILD_TYPE="Release" ;;
    *)
      print_help
      exit 1
      ;;
  esac
done
shift $((OPTIND - 1))

COMMAND="${1:-all}"
if [[ $# -gt 1 ]]; then
  TARGET="$2"
fi

case "$COMMAND" in
  all)
    configure_project
    build_project
    sync_project
    ;;
  setup) setup_emsdk ;;
  configure) configure_project ;;
  build) build_project ;;
  sync) sync_project ;;
  clean) clean_project ;;
  help|--help|-h) print_help ;;
  *)
    echo "error: unknown command: $COMMAND" >&2
    print_help
    exit 1
    ;;
esac
