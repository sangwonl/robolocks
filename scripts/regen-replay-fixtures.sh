#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="${CLI:-$ROOT_DIR/build-cli-release/robolocks_cli}"

if [[ ! -x "$CLI" ]]; then
  echo "CLI binary not found at $CLI; build it first with: scripts/build.sh cli" >&2
  exit 1
fi

# Tick counts match the tracked fixtures (121 frames / 1001 frames).
"$CLI" run \
  --battle "$ROOT_DIR/fixtures/matches/howitzer_duel_v0.json" \
  --ticks 120 \
  --replay-out "$ROOT_DIR/fixtures/replays/howitzer_duel_v0.replay.json"

"$CLI" run \
  --battle "$ROOT_DIR/fixtures/matches/preset_duel_python_v0.json" \
  --ticks 1000 \
  --replay-out "$ROOT_DIR/fixtures/replays/preset_duel_python_v0.replay.json"

echo "Regenerated replay fixtures in $ROOT_DIR/fixtures/replays"
