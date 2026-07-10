# [OPEN] Debug Session: electron-startup-failure

## Symptom

- User needs the Electron desktop app to launch locally.
- `Vite` web server starts, but `Electron` fails during startup/install verification.

## Expected

- `npm run dev` launches both the renderer and the Electron desktop window.

## Initial Hypotheses

1. Electron binary is only partially installed under `node_modules/electron/dist`.
2. The `electron` package postinstall step did not complete successfully in this environment.
3. The current Node runtime is incompatible with the Electron package/runtime being used.
4. The Windows dev script needs a command/path adjustment even if Electron is otherwise installed.

## Evidence Plan

- Inspect package scripts and Electron package contents.
- Reproduce startup with verbose install/runtime commands.
- Confirm whether the Electron binary, `path.txt`, and version marker exist.
- Apply the smallest fix supported by the evidence.

## Status

- Session opened.

## Evidence Collected

- `node -v` reports `v24.16.0`.
- `npm config get ignore-scripts` reports `false`, so postinstall is not globally disabled.
- Before repair, `node_modules/electron/dist` was incomplete and all of these were missing:
  - `node_modules/electron/path.txt`
  - `node_modules/electron/dist/electron.exe`
  - `node_modules/electron/dist/version`
- `@electron/get` successfully downloaded the Electron artifact to local cache, so download is not the failing stage.
- After manually restoring the Electron runtime files from the cached artifact, launching plain `electron .` still crashed with exit code `3221225477`.
- Launching Electron with `--disable-gpu` stays running instead of crashing immediately.

## Applied Fix

- Restored the missing Electron runtime files under `node_modules/electron/dist` from the already-downloaded cache.
- Updated package scripts so `Electron` starts with `--disable-gpu` by default:
  - `dev`
  - `start`

## Current Verification

- `npm run dev` now keeps both renderer and Electron processes alive.
- Current logs show Chromium cache warnings, but not the previous startup crash.
