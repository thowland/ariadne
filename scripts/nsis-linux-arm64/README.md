# NSIS toolchain shim for the arm64 Linux dev VM

electron-builder ships only an x86-64 `makensis`, which cannot run on this
arm64 VM, and its uninstaller step normally executes the freshly built
installer under wine (also unavailable here). This directory, pointed to by
`ELECTRON_BUILDER_NSIS_DIR` in `scripts/package-win.sh`, lets the Windows
build work anyway:

- `makensis` — wrapper that delegates to the system NSIS
  (`sudo apt-get install nsis`).
- `elevate.exe` — Windows UAC helper that electron-builder embeds in the
  installer; copied verbatim from electron-builder's own checksummed
  `nsis-3.0.4.1` toolchain bundle
  (`~/.cache/electron-builder/nsis-3.0.4.1/…/elevate.exe`,
  sha256 `9b1fbf0c11c520ae714af8aa9af12cfd48503eedecd7398d8992ee94d1b4dc37`).
  It must live here because setting `ELECTRON_BUILDER_NSIS_DIR` prevents that
  bundle from being downloaded.

The wine-free uninstaller extraction itself comes from
`patches/app-builder-lib+26.15.3.patch` (applied by `postinstall`), gated
behind `ARIADNE_NSIS_NO_WINE=true` so it changes nothing elsewhere.
