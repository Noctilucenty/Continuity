#!/usr/bin/env bash
#
# Real install verification (v0.7).
#
# Builds the package, packs a tarball, installs it into a clean temp directory,
# and runs the core commands against the INSTALLED bin (not the source tree) to
# prove the published package actually works end-to-end. Exits non-zero on any
# failure so it can gate CI.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Building"
npm run build >/dev/null

echo "==> Packing tarball"
# `npm pack` prints the tarball filename on the last stdout line.
TARBALL="$(npm pack 2>/dev/null | tail -1)"
TARBALL_ABS="$ROOT/$TARBALL"
echo "    $TARBALL"

TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP" "$TARBALL_ABS"; }
trap cleanup EXIT

echo "==> Installing into clean temp project: $TMP"
cd "$TMP"
npm init -y >/dev/null 2>&1
npm install "$TARBALL_ABS" >/dev/null 2>&1

BIN="$TMP/node_modules/.bin/continuity"
if [ ! -e "$BIN" ]; then
  echo "FAIL: bin 'continuity' was not installed at $BIN"
  exit 1
fi

run() {
  echo "==> continuity $*"
  "$BIN" "$@"
}

echo "==> bare continuity (home screen, must exit 0)"
HOME_OUT="$("$BIN")"
echo "$HOME_OUT" | head -3
echo "$HOME_OUT" | grep -q "Continuity" || { echo "FAIL: home screen missing 'Continuity'"; exit 1; }

run --version >/dev/null
run init --name "InstallTest" >/dev/null
run plan "test project" >/dev/null
run next >/dev/null
run handoff --to gpt >/dev/null

# A command that requires the bin to read/write the temp project's .continuity.
"$BIN" status >/dev/null

echo ""
echo "ALL INSTALL CHECKS PASSED"
