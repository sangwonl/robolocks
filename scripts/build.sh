#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ $# -eq 0 || "${1:-}" == "-h" || "${1:-}" == "--help" || "${1:-}" == "help" ]]; then
  MODE="help"
else
  MODE="$1"
  shift
fi

EMSDK_VERSION="${EMSDK_VERSION:-4.0.16}"
EMSDK_DIR="${EMSDK_DIR:-$ROOT_DIR/.emsdk}"
BUILD_TYPE="${BUILD_TYPE:-Release}"
BUILD_DIR="${BUILD_DIR:-}"
TARGET="${TARGET:-}"

if [[ "$EMSDK_DIR" != /* ]]; then
  EMSDK_DIR="$ROOT_DIR/$EMSDK_DIR"
fi

print_help() {
  cat <<'EOF'
Usage: scripts/build.sh <cli|wasm|sync> [OPTIONS] [COMMAND] [TARGET]

Modes:
  cli       Configure/build the native CLI
  wasm      Configure/build/sync the Emscripten wasm target
  sync      Copy built wasm artifacts into web/public/wasm

Commands:
  cli:   all, configure, build, test, clean
  wasm:  all, setup, configure, build, sync, clean
  sync:  no command required; same as wasm sync

Options:
  -d     Debug build
  -r     Release build (default)
  -h     Show help

Examples:
  scripts/build.sh cli
  scripts/build.sh cli -d test
  scripts/build.sh wasm
  scripts/build.sh sync

Environment:
  BUILD_DIR      CMake build directory
  EMSDK_DIR      EMSDK location for wasm builds (default: ./.emsdk)
  EMSDK_VERSION  EMSDK version to install/activate (default: 4.0.16)
EOF
}

resolve_build_dir() {
  local prefix="$1"

  if [[ -n "$BUILD_DIR" ]]; then
    if [[ "$BUILD_DIR" != /* ]]; then
      BUILD_DIR="$ROOT_DIR/$BUILD_DIR"
    fi
    return
  fi

  local suffix
  suffix="$(echo "$BUILD_TYPE" | tr '[:upper:]' '[:lower:]')"
  BUILD_DIR="$ROOT_DIR/build-$prefix-$suffix"
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

configure_cli() {
  resolve_build_dir "cli"
  cmake -S "$ROOT_DIR" -B "$BUILD_DIR" \
    -DCMAKE_BUILD_TYPE="$BUILD_TYPE"
}

build_cli() {
  resolve_build_dir "cli"
  cmake --build "$BUILD_DIR" --target "${TARGET:-robolocks_cli}"
}

test_cli() {
  resolve_build_dir "cli"
  cmake --build "$BUILD_DIR" --target robolocks_tests robolocks_cli
  ctest --test-dir "$BUILD_DIR" --output-on-failure
}

configure_wasm() {
  resolve_build_dir "wasm"
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

build_wasm() {
  resolve_build_dir "wasm"
  load_emsdk
  cmake --build "$BUILD_DIR" --target "${TARGET:-robolocks_wasm}"
}

sync_wasm() {
  resolve_build_dir "wasm"
  ROBOLOCKS_WASM_BUILD_DIR="$BUILD_DIR" node "$SCRIPT_DIR/sync-wasm.mjs"
}

clean_build_dir() {
  local prefix="$1"
  resolve_build_dir "$prefix"
  rm -rf "$BUILD_DIR"
}

parse_options() {
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
  PARSED_ARGS=("$@")
}

PARSED_ARGS=()
parse_options "$@"
if ((${#PARSED_ARGS[@]} > 0)); then
  set -- "${PARSED_ARGS[@]}"
else
  set --
fi

case "$MODE" in
  cli)
    COMMAND="${1:-all}"
    if [[ $# -gt 1 ]]; then
      TARGET="$2"
    fi
    case "$COMMAND" in
      all)
        configure_cli
        build_cli
        ;;
      configure) configure_cli ;;
      build) build_cli ;;
      test) test_cli ;;
      clean) clean_build_dir "cli" ;;
      help|--help|-h) print_help ;;
      *)
        echo "error: unknown cli command: $COMMAND" >&2
        print_help
        exit 1
        ;;
    esac
    ;;
  wasm)
    COMMAND="${1:-all}"
    if [[ $# -gt 1 ]]; then
      TARGET="$2"
    fi
    case "$COMMAND" in
      all)
        configure_wasm
        build_wasm
        sync_wasm
        ;;
      setup) setup_emsdk ;;
      configure) configure_wasm ;;
      build) build_wasm ;;
      sync) sync_wasm ;;
      clean) clean_build_dir "wasm" ;;
      help|--help|-h) print_help ;;
      *)
        echo "error: unknown wasm command: $COMMAND" >&2
        print_help
        exit 1
        ;;
    esac
    ;;
  sync)
    sync_wasm
    ;;
  help|--help|-h)
    print_help
    ;;
  *)
    echo "error: unknown mode: $MODE" >&2
    print_help
    exit 1
    ;;
esac
