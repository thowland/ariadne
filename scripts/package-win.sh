#!/usr/bin/env bash
# Build the Windows x64 NSIS installer (release/Ariadne Setup <version>.exe).
#
# On x86-64 hosts with wine installed, plain `electron-builder --win` works
# and this script adds nothing. On the arm64 Linux dev VM two things break:
# electron-builder's bundled makensis is x86-64-only, and the uninstaller
# step runs the installer under wine. We substitute the system NSIS via
# ELECTRON_BUILDER_NSIS_DIR (see scripts/nsis-linux-arm64/) and switch the
# uninstaller step to electron-builder's pure-JS extractor via
# ARIADNE_NSIS_NO_WINE (see patches/app-builder-lib+26.15.3.patch).
#
# The resulting installer is unsigned: Windows SmartScreen will warn on the
# first run ("More info" -> "Run anyway").
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "$(uname -sm)" = "Linux aarch64" ]; then
  if ! command -v makensis >/dev/null; then
    echo "System makensis not found; install it with: sudo apt-get install nsis" >&2
    exit 1
  fi
  export ARIADNE_NSIS_NO_WINE=true
  export ELECTRON_BUILDER_NSIS_DIR="$PWD/scripts/nsis-linux-arm64"
fi

npx electron-builder --win --x64 --publish never

# Ship the end-user guide next to the installer (the DMG embeds it via
# build.dmg.contents; NSIS has no equivalent, so send both files together).
cp docs/DISTRIBUTION_README.md release/README.txt
echo "Wrote release/README.txt — send it alongside the installer."
