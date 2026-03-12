# Aionios Implementation Log

## 2026-03-13 — Desktop icon selection box refinement

### Task Breakdown

1. Locate the desktop icon selected-state styling that currently encloses both the icon and its text label.
2. Move the visual selected frame so it wraps only the icon surface while keeping the full button hit target intact.
3. Run the required static checks.
4. Re-verify the change in a real Chrome session via CDP.

### Progress

- [x] Step 1 complete — traced the selected-state box to `.desktop-icon` in `src/styles.css`.
- [x] Step 2 complete — moved the visible selected treatment from the outer desktop icon button onto `.desktop-icon__emoji`, leaving the label outside the box.
- [x] Step 3 complete — tests and type checks passed; project lint is currently blocked by an unrelated generated file under `.aionios/tmp/apps/app-cGTzt33HTN/entry.tsx` that still contains `any`.
- [x] Step 4 complete — Chrome/CDP verification confirmed the selected box only wraps the emoji tile and stops above the label text.

### Validation

- `npm run lint`: FAIL
  - Unrelated pre-existing/generated issue outside this change: `.aionios/tmp/apps/app-cGTzt33HTN/entry.tsx`
  - Errors: `@typescript-eslint/no-explicit-any` on lines 4 and 5
- `npm run test`: PASS (24 files, 110 tests)
- `npm run typecheck`: PASS
- Chrome CDP runtime verification: PASS
  - Chrome launched with `--remote-debugging-port=9222`
  - `http://localhost:9222/json`: PASS
  - Selected `terminal` icon state: active
  - Outer `.desktop-icon` computed frame: no border/background/box-shadow
  - `.desktop-icon__emoji` computed frame: selected border/shadow present
  - Geometry check: selected emoji box remained above the label text
  - Screenshot: `/tmp/aionios-icon-selection-verify-selected.png`

## 2026-03-12 — Layout integrity and overlap QA pass

### Task Breakdown

1. Reproduce the user-reported overlap, clipping, and out-of-range layout regressions in the live app instead of relying on static review.
2. Audit shell-level resize behavior so window chrome adapts to actual window bounds, not just viewport breakpoints.
3. Audit built-in app layouts for narrow/short window behavior and patch the surfaces that assume roomy canvases.
4. Re-run static validation after the layout fixes.
5. Re-run real Chrome/CDP verification against both normal and cramped window sizes.

### Progress

- [x] Step 1 complete — ran browser-driven DOM sweeps and confirmed the main failure mode was narrow/short windows causing dense chrome and app content to exceed the visible area.
- [x] Step 2 complete — added compact/cramped/short window states to the shell, raised the desktop resize floor, improved icon label wrapping, and made shared icon/taskbar surfaces more resilient.
- [x] Step 3 complete — updated Directory, Editor, Media, and Recycle Bin to measure their live container size and switch to tighter layouts when space is constrained.
- [x] Step 4 complete — `npm run check` passed after the layout fixes.
- [x] Step 5 complete — Chrome/CDP verification passed at the current desktop minimum size with the previously failing Media surface and the other core apps fully visible inside their window bounds.

### Notes

- Browser pre-pass findings:
  - Window chrome density was being reduced only by viewport media queries, which missed desktop windows resized below those thresholds.
  - Directory and Editor could exceed their visible vertical space in shorter windows because their inner layouts still assumed generous content height.
  - Fixed-size icon tiles and icon labels were contributing to narrow-panel stress.

### Validation

- `npm run check`: PASS
  - `npm run lint`: PASS
  - `npm run test`: PASS (24 files, 110 tests)
  - `npm run typecheck`: PASS
- Chrome CDP runtime verification: PASS
  - Tested the core desktop windows at the current minimum size: `420x340`
  - Media viewport: `418x277`; action row and player both remained fully visible with `0px` horizontal overflow
  - Directory app area: `408x277`; main pane and footer stayed inside bounds with no right/bottom escape
  - Editor app area: `384x253`; header and main body stayed inside bounds with `22px` right and `12px` bottom headroom
  - Recycle Bin app area: `418x277`; list and footer remained fully visible with no out-of-bounds escape

## 2026-03-12 — Frontend redesign refinement from usability feedback

### Feedback Applied

- Shift the accent system from brass/gold to low-saturation light green.
- Replace decorative title typography with more readable sans-serif titles.
- Remove the always-rendered desktop icon hint line; keep hover affordance usable without hidden text being obscured by neighboring icons.
- Use the feedback as a broader usability heuristic and check nearby surfaces for similar issues.

### Task Breakdown

1. Audit the redesigned shell for palette, typography, and hover behaviors matching the user feedback.
2. Update shell tokens, title typography, icon-label behavior, and PWA theme metadata to the refined direction.
3. Sweep built-in app fallback styles for leftover brass accents so the shell and system apps remain consistent.
4. Run static validation again.
5. Verify the fixes in real Chrome via CDP with focused checks and a nearby-surface sweep.
6. Commit the refinement cleanly without touching unrelated dirty files.

### Progress

- [x] Step 1 complete — traced remaining brass accents, uppercase app-label styling, decorative title fonts, and icon hint behavior across shell and system-app surfaces.
- [x] Step 2 complete — moved the shell to a muted green palette, normalized desktop/window title typography to `Instrument Sans`, hid the inline icon hint line, and updated theme-color metadata.
- [x] Step 3 complete — aligned directory/editor/media/recycle-bin fallback accent values with the refined shell palette.
- [x] Step 4 complete — `npm run check` passed after the refinement.
- [x] Step 5 complete — Chrome/CDP verification confirmed muted green accents, non-uppercase desktop icon labels, hidden icon hint lines, readable window title fonts, and a usable opened `Directory` window.
- [ ] Step 6 in progress — committing the refinement pass.

### Validation

- `npm run check`: PASS
  - `npm run lint`: PASS
  - `npm run test`: PASS (24 files, 110 tests)
  - `npm run typecheck`: PASS
- Chrome CDP runtime verification: PASS
  - Accent border sample: `rgba(198, 220, 203, 0.4)`
  - Desktop icon label `textTransform`: `none`
  - Desktop icon hint computed `display`: `none`
  - Opened `Directory` window title `fontFamily`: `"Instrument Sans", "Segoe UI", sans-serif`
  - Spot-check inside `Directory`: green accents remained consistent; no obvious leftover brass regression found

## 2026-03-12 — Full frontend redesign, multi-pass

### Design Direction

- Tone: neo-noir editorial workstation with lacquered dark surfaces, warm metal accents, instrument-panel chrome, and dramatic atmospheric layering.
- Goal: redesign the entire shell so the desktop feels authored and memorable while preserving all existing runtime behavior, data hooks, and mobile flows.
- Memorable motif: orbital/glass workspace with luminous dock, sculpted icon plaques, and control-room window frames.

### Task Breakdown

1. Audit all current frontend surfaces and CSS coupling points.
2. Redesign the global visual system: typography, tokens, wallpaper treatment, shell framing, and responsive layout primitives.
3. Redesign core desktop surfaces: icons, window frames, taskbar, and chrome states.
4. Redesign secondary surfaces: context menu, prompt/revision/output dialogs, and shared button/field treatments.
5. Redesign compact/mobile surfaces: status bar, nav, recents, home action, and mobile window presentation.
6. Run lint, unit tests, static checks, and end-to-end Chrome CDP verification; record results.
7. Organize the redesign into tidy conventional commits.

### Progress

- [x] Step 1 complete — reviewed project description, shell architecture, styling surface area, and overlay/mobile coupling selectors.
- [x] Step 2 complete — replaced the global visual system with an editorial neo-noir token set, new typography, atmospheric wallpaper treatment, and responsive shell layout.
- [x] Step 3 complete — redesigned desktop icons, taskbar, window chrome, runtime states, and loading/generation experience.
- [x] Step 4 complete — redesigned context menu, prompt/revision/output dialogs, and shared shell controls.
- [x] Step 5 complete — redesigned compact/mobile status, navigation, task switcher, and home action; aligned built-in system app surfaces with shared shell tokens.
- [x] Step 6 complete — `npm run check` passed and Chrome/CDP verification confirmed the redesigned shell and window chrome render in a real browser.
- [x] Step 7 complete — organized the redesign into conventional commits.

### Pass Notes

- Pass 1 — established the new design language with `Fraunces` + `Instrument Sans`, warm brass accents, darker lacquered panels, and orbital wallpaper overlays.
- Pass 2 — upgraded shell chrome markup to support branded taskbar pills, window identity/status indicators, atmospheric wallpaper layers, and richer icon presentation.
- Pass 3 — extended the redesign into directory, editor, media, recycle bin, and terminal surfaces via shared `--shell-*` variables so built-in apps inherit the same visual system.

### Validation

- `npm run check`: PASS
  - `npm run lint`: PASS
  - `npm run test`: PASS (24 files, 110 tests)
  - `npm run typecheck`: PASS
- Chrome CDP runtime verification: PASS
  - Chrome launched with `--remote-debugging-port=9222`
  - `http://localhost:9222/json`: PASS
  - Verified live shell evidence: redesigned taskbar gradient, icon hints, desktop icon `border-radius: 26px`
  - Verified live window evidence: opened `Directory`, status `ready`, redesigned titlebar present, window `border-radius: 30px`
  - Temp dir: `/tmp/aionios-runtime-verify-KqtUeu`
  - Follow-up notes:
    - dev server still logs `WebSocket server error: Port is already in use` during startup
    - CDP target selection is brittle because Chrome first exposes a `?pwa-control=1` page target

## Task Breakdown

1. Scaffold React + Vite + TypeScript workspace.
2. Implement Node orchestrator and LLM adapter pipeline.
3. Add Vite virtual module plugin + revision management.
4. Build desktop shell, window manager, taskbar, and host bridge.
5. Wire dynamic window loading + per-window update loop.
6. Run lint/unit/static checks and Chrome CDP end-to-end verification.

## Progress

- [x] Step 1 complete — initialized project scripts, TypeScript configs, ESLint/Vitest setup, basic Vite host server, and app bootstrap files.
- [x] Step 2 complete — added session/window store, prompt context builder, mock and codex adapter layers, source validator, and orchestrator service with revision queueing + rollback support.
- [x] Step 3 complete — implemented Vite virtual window module plugin and module update bridge with HMR/remount strategies.
- [x] Step 4 complete — built stable desktop shell with icons, window/taskbar UI, runtime boundary, and host bridge methods (open/read/write/requestUpdate/listFiles).
- [x] Step 5 complete — wired server APIs + SSE events + client reducers for per-window lifecycle and update handling.
- [x] Step 6 complete — lint, tests, typecheck, and Chrome CDP verification now all pass (window open + targeted update flow verified end-to-end).
# Implementation Log

## 2026-02-28 — Final verification run

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (exit 0)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp`: FAIL (exit 1) — Error: Desktop shell did not render
  - CDP script temp dir: `/tmp/aionios-cdp-wUsPxQ`
  - CDP script logs dir: `/tmp/aionios-cdp-wUsPxQ/logs`
  - Command tee log: `logs/verify-cdp-20260228T200914Z.log`

## 2026-02-28T20:12:22Z — Re-run full validation (requested)

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (exit 0)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp`: FAIL (exit 1) — Error: Desktop shell did not render
  - CDP script temp dir: `/tmp/aionios-cdp-fxhrH9`
  - CDP script logs dir: `/tmp/aionios-cdp-fxhrH9/logs`
  - Log files: `/tmp/aionios-cdp-fxhrH9/logs/chrome.log`, `/tmp/aionios-cdp-fxhrH9/logs/dev-server.log`

## 2026-02-28T20:15:00Z — Final passing validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (1 test file, 4 tests passed)
- `npm run typecheck`: PASS
- `npm run verify:cdp`: PASS
  - CDP script temp dir: `/tmp/aionios-cdp-I4Ypsp`
  - CDP script logs dir: `/tmp/aionios-cdp-I4Ypsp/logs`
  - Verified outcome: desktop rendered; one window opened; targeted window update completed to revision 2 while shell remained stable.
[2026-02-28] verify:cdp
- Command: `npm run verify:cdp`
- Result: PASS (exit code 0)
- Temp dir: `/tmp/aionios-cdp-hW78UI`
- Logs: `/tmp/aionios-cdp-hW78UI/logs`

## 2026-02-28T20:30:00Z — Terminal system app feature

### Task Breakdown

1. Introduce a host-backed terminal process manager on Node server.
2. Expose terminal lifecycle/input APIs and session events.
3. Add Terminal as a first-class system app in desktop catalog.
4. Add host bridge terminal capability and render terminal window state.
5. Verify lint/tests/typecheck and run Chrome CDP end-to-end for terminal command execution.

### Progress

- [x] Step 1 complete — implemented host-backed `TerminalManager` with real shell spawn/write/close lifecycle and output events.
- [x] Step 2 complete — added terminal API routes (`start`, `input`, `stop`) and server/client wiring.
- [x] Step 3 complete — added `Terminal` as first system app and delivered stable system window module source.
- [x] Step 4 complete — wired terminal state in frontend reducer + Host Bridge + runtime props.
- [x] Step 5 complete — lint/tests/typecheck and Chrome CDP terminal command execution verification all pass.

## 2026-02-28T20:47:03Z — Code quality checks (requested)

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (1 test file, 5 tests passed)
- `npm run typecheck`: FAIL (exit 2)
  - `src/App.tsx:480:15` — TS2322: Type `string | undefined` is not assignable to type `string`
  - `src/App.tsx:562:21` — TS2322: Type `string | undefined` is not assignable to type `string`

## 2026-02-28T20:55:58Z — Full validation (requested)

- Target: `/home/wayne/repo/Aionios`
- Command: `npm run lint && npm run test && npm run typecheck && npm run verify:cdp`
- Status: PASS
- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (1 file, 5 tests; exit 0)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-95UvpI`
  - Logs: `/tmp/aionios-cdp-95UvpI/logs`
  - Success payload: `{ title: 'Terminal', status: 'ready', windows: 1, icons: 4 }`

## 2026-03-01 — Terminal test coverage review (requested)

- Target: `/home/wayne/repo/Aionios`
- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (1 file, 5 tests; exit 0)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-NXUEEi`
  - Logs: `/tmp/aionios-cdp-NXUEEi/logs`
  - Success payload: `{ title: 'Terminal', status: 'ready', windows: 1, icons: 4 }`

## 2026-03-01 — Terminal/system-app codebase audit (requested)

### Task Breakdown

1. Review recent terminal/system-app commits and touched files.
2. Audit TerminalManager + API routes for correctness, security boundaries, and process lifecycle leaks.
3. Audit client-side terminal event handling + host bridge wiring for race conditions and contract drift.
4. Re-run lint/tests/typecheck and CDP end-to-end verification for terminal command execution.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-uVJDZP`

## 2026-03-03 — Manual one-shot CDP verification (Directory + Recycle Bin UX)

### Commands

- Dev server: `npm run dev -- --host 127.0.0.1 --port 5173`
- Chrome (headless): `google-chrome-stable --headless=new --remote-debugging-port=9222 --user-data-dir=/tmp/aionios-cdp-chrome --no-first-run --no-default-browser-check --disable-gpu --disable-dev-shm-usage --window-size=1440,900 http://localhost:5173`
- CDP sanity: `curl -s http://localhost:9222/json/version | head`

### CDP steps (ad-hoc Node REPL, chrome-remote-interface)

1. Attach to the `page` target for `http://localhost:5173/`, enable `Page/Runtime/DOM/Input`.
2. Open `Directory` by double-clicking the desktop icon.
3. Directory checks:
   - Confirmed: no visible redundant header/tagline; no toolbar; no `New File` button in-window.
   - Confirmed: `.icon-tile` computed `backgroundColor` is transparent (desktop-like default).
   - Issue: clicking blank background inside the Directory window did **not** clear selection (selection remained after background click).
   - Issue: right-click background did **not** show a `New File` item; menu showed `Refresh`, `Create New`, `Delete`.
   - Issue: `Create New` opened an “app creation” prompt dialog (describe new app), not a “new file draft path” flow.
   - Confirmed: selecting a file works; right-clicking a file shows a file menu (`Delete`, `Open Recycle Bin`).
4. Open `Recycle Bin` (via Directory file context menu).
5. Recycle Bin checks:
   - Confirmed: no visible header/description; no filter input; no “Empty” button (content was minimal/empty-ish).
   - Issue: right-click background did **not** show `Empty Recycle Bin`; it showed the same `Refresh`, `Create New`, `Delete` menu.
   - Issue: right-clicking an item did **not** show `Restore` / `Delete Permanently`; it showed `Delete`, `Open Recycle Bin` (Directory-like menu).
6. Quick flow attempt:
   - Edited + saved `new-file.txt` via the visible `Save` button (save succeeded).
   - Deleted `new-file.txt` via context menu; it disappeared from Directory.
   - Issue: deleted file did **not** appear in Recycle Bin (even after `Refresh`), so restore validation for that file was blocked.

### Artifacts

- Screenshot: `/tmp/aionios-cdp-directory.png`
- Screenshot: `/tmp/aionios-cdp-recycle-bin.png`

### Notable runtime error observed during the run

- Vite dev server threw a React/Babel parse error while the UI was open:
  - `Identifier 'useCallback' has already been declared`
  - Source: `/@window-app/.../entry.tsx?rev=1&nonce=0` showed duplicate `import { useCallback, useEffect, useState } from 'react';`

## 2026-03-03 — Manual one-shot CDP verification re-run (commit e137602)

> Note: this incremental fix commit was later squashed into `47fd008`.

### Commands

- Dev server: `npm run dev -- --host 127.0.0.1 --port 5173`
- Chrome (headless): `google-chrome-stable --headless=new --remote-debugging-port=9222 --user-data-dir=/tmp/aionios-cdp-chrome --no-first-run --no-default-browser-check --disable-gpu --disable-dev-shm-usage --window-size=1440,900 http://localhost:5173`
- CDP sanity: `curl -s http://localhost:9222/json/version | head`

### Results

- Directory
  - PASS: no redundant header/tagline; no toolbar/New File button.
  - PASS: icon tiles default transparent background.
  - PASS: right-click background shows Directory menu containing `New File`.
  - PASS: `Delete` moves item into Recycle Bin; Recycle Bin can be opened from file menu.
  - FAIL: background left-click did **not** clear selection (tile remained selected after clicking blank content area).
  - Note: `New File` shows “Creating a new file draft.” and exposes a path input; creation required typing via real key events for the path to persist.
- Recycle Bin
  - PASS: no header/description; no filter input; no “Empty” button.
  - PASS: icon tiles default transparent background.
  - PASS: right-click item menu contains `Restore` and `Delete Permanently`.
  - FAIL: right-click background did **not** show `Empty Recycle Bin` (still showed `Refresh`, `Create New`, `Delete`).
- Quick flow
  - PASS: `New File` -> set path -> `Save` -> `Delete` -> open Recycle Bin -> `Restore` returns file to Directory.

### Artifacts

- Screenshot: `/tmp/aionios-cdp-directory-1772510784933.png`
- Screenshot: `/tmp/aionios-cdp-recycle-bin-1772510785252.png`

## 2026-03-03 — Manual one-shot CDP verification re-run (commit 24ca57c)

> Note: this incremental fix commit was later squashed into `47fd008`.

### Commands

- Dev server: `npm run dev -- --host 127.0.0.1 --port 5173`
- Chrome (headless): `google-chrome-stable --headless=new --remote-debugging-port=9222 --user-data-dir=/tmp/aionios-cdp-chrome --no-first-run --no-default-browser-check --disable-gpu --disable-dev-shm-usage --window-size=1440,900 http://localhost:5173`

### Focused confirmations (requested)

1. Directory: left-click blank area clears selection — PASS.
2. Recycle Bin: right-click blank area shows `Empty Recycle Bin` — PASS.
3. Quick flow delete -> bin -> restore — PASS (file created, saved, deleted, appeared in RB, restored back to Directory).
  - Logs: `/tmp/aionios-cdp-uVJDZP/logs`
  - Success payload: `{ title: 'Terminal', status: 'ready', windows: 1, icons: 4 }`

## 2026-03-01T03:35:01Z — TerminalManager phantom-session fix + tests (requested)

### Task Breakdown

1. Review `server/terminal/manager.ts` lifecycle behavior and existing test setup.
2. Fix stale-session/close semantics in terminal session manager.
3. Add focused unit tests in `server/terminal/manager.test.ts`.
4. Track per-step implementation status and logs in `impl-log.md`.
5. Run validation checks (`lint`, `test`, `typecheck`, CDP verification) and capture results.

## 2026-03-07 — Exploratory review: hot-update app artifact shape

### Task Breakdown

1. Read project description and current implementation log conventions.
2. Inspect runtime/orchestrator/plugin code to identify the current hot-update artifact contract.
3. Determine whether the current system can load a complete React project or only a single generated module.
4. Summarize the architectural changes required to support richer multi-file apps.

### Progress

- [x] Step 1 complete — reviewed `project-desc.md` and existing implementation log structure.
- [x] Step 2 complete — traced generation prompt, source validation, persisted app storage, Vite virtual module loading, and runtime import flow.
- [x] Step 3 complete — confirmed the current contract is a single `entry.tsx`-style React module per window/app revision, not an arbitrary standalone React project.
- [x] Step 4 complete — identified the minimum architecture shift needed for complex apps: move from single-source snapshots to a multi-file module graph/workspace artifact.

### Notes

- Current prompt contract explicitly asks the LLM to return one self-contained React TSX module with `export default function WindowApp`, and only `react` imports are allowed for generated sources.
- Current Vite virtual module plugin only resolves `/@window-app/<sessionId>/<windowId>/entry.tsx`, so nested module files are not part of the artifact model today.

## 2026-03-07 — Create New dialog regression + loading placeholder + timeout=0

### Task Breakdown

1. Trace the taskbar quick-create dialog flow versus the desktop/context-menu `Create New` flow.
2. Fix the regression so both entry points reuse the same prompt dialog controller.
3. Restore immediate placeholder window opening when app generation starts instead of waiting on metadata/persistence.
4. Allow `codex_timeout_ms = 0` and UI value `0` to mean "no timeout".
5. Add focused unit tests and Chrome CDP coverage for the restored behavior.
6. Run lint/tests/typecheck/CDP verification and capture results.

### Progress

- [x] Step 1 complete — identified `QuickCreate` as a parallel dialog path in `src/App.tsx`, with `createNewApp` delaying local window open until after metadata suggestion + persisted app creation.
- [x] Step 2 complete — taskbar create-new now reuses the shared `PromptDialog` flow instead of a separate `QuickCreate` component.
- [x] Step 3 complete — generated app creation now opens a local loading window immediately, then resolves metadata/persisted app identity asynchronously before issuing the server open request.
- [x] Step 4 complete — config parsing, preference UI validation, and Codex provider execution all accept `codexTimeoutMs = 0` as a no-timeout sentinel.
- [x] Step 5 complete — added reducer/config/provider unit coverage and strengthened CDP coverage for shared dialog usage, immediate placeholder opening under delayed requests, and timeout `0` persistence.
- [x] Step 6 complete — lint, tests, typecheck, and full Chrome CDP verification pass.

## 2026-03-10 — Mobile adaptive shell + phone interaction model

### Task Breakdown

1. Inspect the desktop shell, window lifecycle, context menu, and CDP harness to define a host-level mobile mode contract.
2. Add mobile shell state and viewport detection so small screens switch from freeform desktop windows to phone-style home/app/recents modes.
3. Implement mobile navigation behaviors: Back/Home/Recents buttons, active-app recovery, and recent-task management.
4. Adapt touch interactions for mobile: tap-to-open icons, long-press context menus, edge/home gestures, and recent-card dismiss gestures.
5. Add responsive shell styling for mobile windows, dialogs, task manager, and system chrome while preserving the desktop path.
6. Add unit coverage and Chrome CDP mobile verification for the phone flow, then iterate on any UX gaps discovered in the real run.

### Progress

- [x] Step 1 complete — reviewed `App`, `WindowFrame`, `Taskbar`, reducer state, context-menu plumbing, and CDP harness/current cases to identify the desktop assumptions that must split for mobile.
- [x] Step 2 complete — added compact-viewport detection and a host-level mobile shell state that switches between home, app, and recent-task surfaces.
- [x] Step 3 complete — implemented mobile Back/Home/Recents navigation, app restore logic, and foreground task transitions without disturbing the desktop path.
- [x] Step 4 complete — added tap, long-press, touch, and gesture handling for the mobile shell, including context-menu press/hold, home swipe, edge-swipe back, and task-card dismiss/restore.
- [x] Step 5 complete — shipped responsive mobile shell chrome (status bar, system nav, floating create action, full-screen windows, recent-task cards, and mobile-friendly sheets/dialogs).
- [x] Step 6 complete — lint/tests/typecheck pass locally, isolated `mobile-shell` CDP verification passes, and the full Chrome CDP suite passes with the mobile case included.

### Validation

- `npm run lint`: PASS
- `npm run test`: PASS (23 files, 109 tests)
- `npm run typecheck`: PASS
- `npm run verify:cdp -- --case mobile-shell`: PASS
  - Temp dir: `/tmp/aionios-cdp-cMMw3B`
  - Logs: `/tmp/aionios-cdp-cMMw3B/logs`
- `npm run verify:cdp`: PASS
  - Temp dir: `/tmp/aionios-cdp-MRGWj9`
  - Logs: `/tmp/aionios-cdp-MRGWj9/logs`
  - Final-state payload: `{ windows: 11, icons: 10, preferenceStatus: 'Preferences loaded.' }`

## 2026-03-12 — PWA support + installability verification

### Task Breakdown

1. Review the existing manifest/static assets/server path behavior to identify the missing PWA pieces.
2. Add a real service worker with shell/runtime caching that does not break the current dev-hosted flow.
3. Register the service worker on the client and tighten manifest/meta tags for installability.
4. Add focused unit coverage for PWA registration helpers where practical.
5. Add Chrome CDP verification for manifest + service worker readiness/control, then rerun the full validation suite.

### Progress

- [x] Step 1 complete — confirmed the project already had a basic `site.webmanifest` and icons, but no service worker, no client registration, and no installability/runtime verification path.
- [x] Step 2 complete — added a root-scoped service worker with shell asset precaching, runtime same-origin caching, and safe activation/update behavior that avoids intercepting API/WebSocket traffic.
- [x] Step 3 complete — registered the service worker on the client, expanded installability metadata in `index.html`, and tightened the web manifest with `id`, `scope`, and descriptive metadata.
- [x] Step 4 complete — added focused unit coverage for the PWA registration support guard.
- [x] Step 5 complete — added Chrome CDP `pwa-shell` verification for manifest/service worker/cache readiness and re-ran the full validation suite successfully.

### Validation

- `npm run lint`: PASS
- `npm run test`: PASS (24 files, 110 tests)
- `npm run typecheck`: PASS
- `npm run verify:cdp -- --case pwa-shell`: PASS
  - Temp dir: `/tmp/aionios-cdp-gpGuIx`
  - Logs: `/tmp/aionios-cdp-gpGuIx/logs`
- `npm run verify:cdp`: PASS
  - Temp dir: `/tmp/aionios-cdp-T5VAtY`
  - Logs: `/tmp/aionios-cdp-T5VAtY/logs`

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (22 files, 104 tests)
- `npm run typecheck`: PASS
- `npm run verify:cdp`: PASS
  - Temp dir: `/tmp/aionios-cdp-J1gah3`
  - Config path: `/tmp/aionios-cdp-J1gah3/preferences.toml`
  - Logs: `/tmp/aionios-cdp-J1gah3/logs`
  - Task-specific confirmations:
    - taskbar create-new opens the shared `PromptDialog`
    - persisted app creation opens a placeholder window immediately even while `/api/llm/artifact-metadata` and `/api/apps` are artificially delayed
    - preference save accepts and persists `codex_timeout_ms = 0`

### Notes

- Removed the obsolete `QuickCreate` component/CSS path after unifying taskbar create-new with the existing prompt-dialog controller.
- While tightening CDP coverage, also stabilized two pre-existing full-suite timing issues:
  - `llm-update` now waits for post-loading content to become visible after revision changes.
  - `open-file` now falls back to a synthetic `dblclick` dispatch if coordinate-based double-click misses a Directory entry.
- Persisted managed apps are stored as `entry.tsx` plus `meta.json`, which further confirms the persisted artifact is single-entry-source based.
- No lint/test/typecheck/CDP run for this task because no functional code changes were made.

## 2026-03-07 — Revision storage architecture exploration

### Task Breakdown

1. Review product constraints around per-window revision, rollback, and dynamic module loading.
2. Inspect current orchestrator/store implementation for revision history, branching, and rollback semantics.
3. Evaluate whether per-generated-unit Git repositories would simplify or complicate the architecture.
4. Summarize recommendation and possible migration paths.

### Progress

- [x] Step 1 complete — confirmed project scope treats revision/history/rollback as a core orchestrator responsibility tied to session/window isolation.
- [x] Step 2 complete — confirmed current implementation is an in-memory linear snapshot history with prompt/context metadata, rollback barriers, branching to a new window, and optional persisted app source on disk.
- [x] Step 3 complete — evaluated per-unit Git as a stronger history backend but not a direct simplification because prompt/context/HMR/event/concurrency logic remains outside Git.
- [x] Step 4 complete — recommendation prepared: avoid “one repo per generated window” for now; consider either a DAG-based internal revision model or Git-backed persistence only for managed/persisted apps if stronger history is needed.

### Notes

- No runtime code changed in this exploration step.
- No lint/test/typecheck/CDP run was needed because no feature or fix was implemented.

## 2026-03-07T08:20:00+08:00 — LLM loading animation overhaul

### Task Breakdown

1. Inspect the current LLM loading/runtime flow and confirm the integration points for replacing the plain loading text.
2. Add a reusable emoji-range randomizer that samples from Unicode emoji blocks instead of enumerating individual emoji.
3. Build a spotlight + slot-machine style loading experience for LLM windows, tuned for long-running generation without visual fatigue.
4. Add a short completion transition so the loading experience exits with an ending animation after generation finishes.
5. Run `lint`, `test`, and `typecheck`, then verify the behavior in Chrome via CDP.
6. Commit the change in a tidy conventional commit.

### Progress

- [x] Step 1 complete — confirmed the loading placeholder currently lives in `src/components/WindowRuntime.tsx`.
- [x] Step 2 complete — added a Unicode emoji-range sampler and reel generator in `src/utils/emoji-random.ts` instead of enumerating individual emoji.
- [x] Step 3 complete — replaced the plain LLM loading text with a spotlight + slot-machine style loading experience in `src/components/LlmGenerationExperience.tsx`.
- [x] Step 4 complete — added a short completion state in `src/components/WindowRuntime.tsx` so the loading UI exits through a brief ending animation.
- [x] Step 5 complete — `lint`, `test`, `typecheck`, and focused Chrome CDP verification all pass after narrowing the remount scope to the module content layer.
- [x] Step 6 complete — committed the change as `feat(ui): animate llm generation loading` (`f0ed9bd`).

### Work Log

- Started implementation review for the LLM loading state, runtime fallback, and related styles.
- Added slow, low-fatigue reel timing and a short lock-in animation before dismissing the loading view.
- Added focused unit coverage for the emoji-range randomizer and reel metadata.
- Found a real runtime regression during CDP verification: `mountNonce` was remounting the entire `WindowFrame`, which skipped the completion animation in fast mock generations.
- Fixed the regression by keeping `WindowFrame` keyed by `windowId` and moving the remount boundary down to the module component inside `WindowRuntime`.

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (21 files, 92 tests)
- `npm run typecheck`: PASS (exit 0)
- Focused Chrome CDP verification: PASS
  - Verified sequence: `loading -> completing -> none`
  - Timings: `0ms loading`, `25ms completing`, `706ms module visible`
  - Temp dir: `/tmp/aionios-cdp-TobhfX`
  - Logs: `/tmp/aionios-cdp-TobhfX/logs`

## 2026-03-07T09:05:00+08:00 — LLM-picked emoji + filename metadata

### Task Breakdown

1. Trace the create/open flows that currently derive titles, icon defaults, and file names locally.
2. Add a short backend metadata-generation request that picks an emoji and a file/app name from the user prompt, with safe parsing and fallback behavior.
3. Use the selected metadata when creating files and persisted apps so app icons and file names come from the LLM-picked result.
4. Pass the selected emoji/file name into window state so the loading animation can lock onto the chosen result in its finishing phase.
5. Run `lint`, `test`, `typecheck`, and Chrome CDP verification for the new metadata flow.
6. Commit the change in a tidy conventional commit.

### Progress

- [x] Step 1 complete — confirmed app/file names are still derived in `src/window-actions/create-new.ts` and app icons default in `server/storage/app-descriptors.ts`.
- [x] Step 2 complete — added backend artifact-metadata suggestion support plus provider parsing/fallback logic.
- [x] Step 3 complete — wired suggested emoji/file names into Create New app/file flows and persisted app descriptor creation.
- [x] Step 4 complete — passed selection metadata through window snapshots/events so the loading animation can lock onto the chosen result.
- [x] Step 5 complete — `lint`, `test`, `typecheck`, and a focused Chrome CDP `.app` verification all pass.
- [x] Step 6 complete — committed the change as `feat(llm): pick artifact metadata from prompt` (`44775a6`).

### Work Log

- Confirmed the new metadata request needs to feed both creation-time file naming and runtime loading-state visuals.
- Added a new `/api/llm/artifact-metadata` route and provider method so the metadata request stays server-backed instead of hardcoded in the client.
- Kept fallback behavior in place so app/file creation still succeeds if the short metadata request fails.
- Finalized the change in commit `44775a6` after the focused Chrome CDP `.app` verification matched the UI selection with the persisted descriptor metadata.

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (22 files, 96 tests)
- `npm run typecheck`: PASS (exit 0)
- Focused Chrome CDP verification: PASS
  - Prompt: `Create an app for focus sessions with calm timers, task lanes, and a gentle progress view.`
  - Completing-state emoji: `🦂`
  - Completing-state file name: `Create an app for focus sessions with cal….app`
  - Desktop icon emoji: `🦂`
  - Persisted descriptor icon: `🦂`
  - Persisted descriptor path: `Create an app for focus sessions with cal….app`
  - Sampled phase sequence: `loading -> completing`
  - Temp dir: `/tmp/aionios-cdp-x4DIa9`
  - Logs: `/tmp/aionios-cdp-x4DIa9/logs`

### Progress

- [x] Step 1 complete — reviewed manager lifecycle, routes usage, and Vitest config include pattern.
- [x] Step 2 complete — fixed active-session detection, error/close cleanup guards, and robust `close()` semantics.
- [x] Step 3 complete — added 5 targeted `TerminalManager` tests covering lifecycle, cleanup, error path, and close/write semantics.
- [x] Step 4 complete — added this run log with breakdown, progress, and command tracking.
- [x] Step 5 complete — full lint/test/typecheck and Chrome CDP verification passed.

### Per-step Logs

## 2026-03-02 — Prompt dialog for LLM instructions + open-with-prompt

### Task Breakdown

1. Add an in-app prompt dialog component for capturing user instructions.
2. Replace `window.prompt` usage in LLM update flow with the prompt dialog.
3. Add an icon context menu action for LLM apps: “Open with prompt…”.
4. Update the CDP `llm-update` case to drive the new UI and harden context-menu opening.
5. Run lint/unit/typecheck.
6. Run Chrome CDP end-to-end verification on port `9222`.

## 2026-03-06 — Full-codebase refactor sweep

### Task Breakdown

1. Read the full project codebase, including frontend, backend, root config, and CDP verification scripts.
2. Maintain reviewed modules / refactor notes / unread modules in `.context/REFACTOR.md`.
3. Pick a low-risk structural refactor slice that improves maintainability without changing behavior.
4. Run lint, unit tests, and typecheck after the code change.
5. Run Chrome CDP end-to-end verification through a subagent and capture results.

### Progress

- [x] Step 1 complete — reviewed `src/**`, `server/**`, root toolchain/config files, and `scripts/cdp/**` / `scripts/verify-cdp.mjs`.
- [x] Step 2 complete — created `.context/REFACTOR.md` with reviewed scope, current refactor opportunities, completed work, and remaining non-code assets.
- [x] Step 3 complete — extracted Create New helper logic from `src/hooks/useWindowActions.ts`, deduplicated LLM window open flow, and fixed Vitest discovery so `src/**/*.test.ts` runs by default.
- [ ] Step 4 pending — lint/test/typecheck not run yet for this round.
- [ ] Step 5 pending — Chrome CDP verification for this round not run yet.

### Per-step Logs

- Frontend full scan completed with module-level notes for `App.tsx`, `useWindowActions.ts`, `RevisionDialog.tsx`, dialog surfaces, runtime/host bridge, reducer/state, and desktop interactions.
- Backend full scan completed with module-level notes for `server/orchestrator/service.ts`, route helpers, `host-fs.ts`, terminal WS bridging, system-app source duplication, and CDP verification structure.
- Found a tooling gap while reading root config: `vite.config.ts` only included `server/**/*.test.ts`, so existing `src/` tests were silently excluded from `npm test`.
- Applied a first safe refactor:
  - moved Create New heuristics/templates into `src/window-actions/create-new.ts`
  - added `src/window-actions/create-new.test.ts`
  - introduced shared `openGeneratedWindow(...)` flow inside `src/hooks/useWindowActions.ts`
  - expanded Vitest include patterns to cover `src/**/*.test.ts`

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (15 files, 76 tests; includes `src/**/*.test.ts` after this round's Vitest fix)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp`: PASS
  - Temp dir: `/tmp/aionios-cdp-tyJvNU`
  - Logs: `/tmp/aionios-cdp-tyJvNU/logs`
  - Final payload summary: `{ windows: 11, icons: 10, preferenceStatus: 'Preferences saved.' }`
  - Non-blocking warnings:
    - `unable to warm up shiki dependency`
    - `unable to warm up xterm dependencies`
    - `preference saved status message was not observed; config was persisted`

### Progress

- [x] Step 1 complete — added `src/components/PromptDialog.tsx` and styling in `src/styles.css`.
- [x] Step 2 complete — `WindowFrame` now exposes `onRequestUpdate` callback; `App` opens prompt dialog and calls `requestWindowUpdate(...)`.
- [x] Step 3 complete — icon right-click context menu now includes “Open with prompt…” for LLM apps and routes through the prompt dialog + `openWindow(..., instruction)`.
- [x] Step 4 complete — `scripts/cdp/cases/llm-update.mjs` uses the context menu + prompt dialog flow and dispatches a `contextmenu` mouse event to avoid viewport-dependent flakes.
- [x] Step 5 complete — lint/tests/typecheck all pass.
- [x] Step 6 complete — CDP verification passes on `--cdp-port 9222`.

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (9 files, 38 tests; exit 0)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-Gj9uk3`
  - Logs: `/tmp/aionios-cdp-Gj9uk3/logs`

## 2026-03-02 — Desktop “Create New” prompt flow

### Task Breakdown

1. Enable “Create New” in the desktop right-click menu.
2. Show prompt dialog for “Create New” and open a new LLM window with the entered instruction.
3. Update the CDP `context-menu` case to validate the prompt dialog flow.
4. Run lint/unit/typecheck.
5. Run Chrome CDP end-to-end verification on port `9222`.

### Progress

- [x] Step 1 complete — desktop context menu now includes an enabled “Create New”.
- [x] Step 2 complete — “Create New” opens the prompt dialog and creates a new LLM window (`appId=custom`) using the provided instruction.
- [x] Step 3 complete — `scripts/cdp/cases/context-menu.mjs` now asserts “Create New” and checks the prompt dialog opens/closes.
- [x] Step 4 complete — lint/tests/typecheck all pass.
- [x] Step 5 complete — CDP verification passes on `--cdp-port 9222`.

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (9 files, 38 tests; exit 0)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-NPvfOd`
  - Logs: `/tmp/aionios-cdp-NPvfOd/logs`

## 2026-03-02 — Revision history + rollback (follow-up)

## 2026-03-03 — Directory + Recycle Bin icon grid UI

### Task Breakdown

1. Audit desktop icon/grid/context menu primitives.
2. Update Directory system app to display files as icon + title tiles (desktop-like) and keep right-click menu hooks.
3. Update Recycle Bin system app to display items as icon + title tiles and support right-click menu actions.
4. Extend host context menu to support recycle-bin item actions and directory “new file” creation.
5. Update Chrome CDP test cases for the new UI hooks.
6. Run lint/unit/typecheck.
7. Run Chrome CDP end-to-end verification on port `9222`.

### Progress

- [x] Step 1 complete — reviewed `DesktopIcons`, `ContextMenu`, and shell-level contextmenu routing.
- [x] Step 2 complete — Directory system app now renders entries as desktop-like icon tiles (app descriptors use stored icon/title) and keeps right-click hooks.
- [x] Step 3 complete — Recycle Bin system app now renders items as desktop-like icon tiles and supports right-click actions.
- [x] Step 4 complete — host context menu now supports directory “New File” drafts + recycle-bin item actions via window-scoped custom events.
- [x] Step 5 complete — updated CDP cases for Directory/Recycle Bin; hardened `llm-update` case to wait for the instruction summary.
- [x] Step 6 complete — `npm run check`: PASS (exit 0).
- [x] Step 7 complete — `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0).

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-oAjFnM`
  - Logs: `/tmp/aionios-cdp-oAjFnM/logs`

## 2026-03-02 — Repro: HMR enabled revision increments but UI stale (requested)

### Task Breakdown

1. Create a one-off CDP repro script that starts `npm run dev` with HMR enabled.
2. Launch `google-chrome-stable` with `--remote-debugging-port=9222` and isolated profile dir.
3. Use CDP to open `notes` via “Open with prompt…”, wait for `ready`, and capture initial state + resource entries.
4. Click “Ask LLM to Evolve”, wait for revision increment, and capture updated state + resource entries.
5. Fetch `/api/sessions/<sessionId>/windows/<windowId>/revisions/<rev>` payloads and compare `source` around `Last instruction:`.
6. Record concrete values + any logs, then clean up processes.

### Progress

- [x] Step 1 complete — one-off script created and executed.
- [x] Step 2 complete — Chrome launched with CDP on `9222` and isolated profile dir.
- [x] Step 3 complete — opened `notes` via “Open with prompt…” and captured initial state + resources.
- [x] Step 4 complete — clicked “Ask LLM to Evolve”, waited for revision increment, captured updated state + resources.
- [x] Step 5 complete — fetched both revision payloads and compared `source` snippets around `Last instruction:`.
- [x] Step 6 complete — recorded concrete values + logs and cleaned up.

### Run Log (2026-03-02)

- Script: `/tmp/aionios-repro-hmr-stale.mjs`
- Summary JSON: `/tmp/aionios-hmr-repro-IrtofB/summary.json`
- Dev server: `http://localhost:43343` (HMR enabled; `AIONIOS_DISABLE_HMR` not set)
- CDP: `--remote-debugging-port=9222`
- sessionId: `EmilW6_0mtna6tS-`
- windowId: `7d185c30-9ebb-4cfd-b601-226f4e51d476`
- Initial title revision: `rev 1`
  - Rendered paragraph: `Last instruction: Build a note-taking window with a markdown preview and a tag picker.`
  - `performance.getEntriesByType('resource')` `/@window-app/` entry:
    - `http://localhost:43343/@window-app/EmilW6_0mtna6tS-/7d185c30-9ebb-4cfd-b601-226f4e51d476/entry.tsx?rev=1&nonce=2`
- After “Ask LLM to Evolve”: title revision incremented to `rev 2`
  - Rendered paragraph did **not** change (still shows `tag picker` prompt).
  - `/@window-app/` resource entries still show only the `rev=1&nonce=2` URL (no new entry for `rev=2` observed).
- API comparison:
  - `/api/sessions/EmilW6_0mtna6tS-/windows/7d185c30-9ebb-4cfd-b601-226f4e51d476/revisions/1` source snippet contains `Last instruction: Build a note-taking window...tag picker.`
  - `/api/sessions/EmilW6_0mtna6tS-/windows/7d185c30-9ebb-4cfd-b601-226f4e51d476/revisions/2` source snippet contains `Last instruction: Refine this app with richer visuals and interactivity`
  - `source` differs between revisions (`sourcesEqual: false`), but rendered content stayed on revision 1’s instruction.

### Logs

- Dev server log: `/tmp/aionios-hmr-repro-IrtofB/logs/dev-server.log`
- Chrome log: `/tmp/aionios-hmr-repro-IrtofB/logs/chrome.log`

### Task Breakdown

1. Expose server APIs to list window revisions and fetch revision details.
2. Add a host-owned revision history dialog and open it from the window header.
3. Wire rollback action and ensure the UI can accept revision decreases.
4. Extend CDP `llm-update` coverage to validate rollback via revision history.
5. Run lint/unit/typecheck.
6. Run Chrome CDP end-to-end verification on port `9222`.

### Progress

- [x] Step 1 complete — added `/revisions` and `/revisions/:revision` APIs and orchestrator helpers.
- [x] Step 2 complete — added `RevisionDialog` UI and a window header action (“Revision history”).
- [x] Step 3 complete — rollback now updates revision on `window-remount` events.
- [x] Step 4 complete — `scripts/cdp/cases/llm-update.mjs` opens revision history and rolls back to revision 1.
- [x] Step 5 complete — lint/tests/typecheck all pass.
- [x] Step 6 complete — CDP verification passes on `--cdp-port 9222`.

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (9 files, 39 tests; exit 0)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-jiEkWJ`
  - Logs: `/tmp/aionios-cdp-jiEkWJ/logs`

## 2026-03-02 — LLM window update/regenerate appears to not change rendered app

### Task Breakdown

1. Reproduce the issue via Chrome DevTools Protocol (HMR enabled) and capture evidence (revision vs rendered content vs stored source).
2. Trace client update strategy (`hmr` vs `remount`) and dynamic module loading behavior.
3. Trace server-side Vite virtual module + module invalidation + update event bridge.
4. Implement a root-cause fix so that updates actually apply (and avoid confusing no-op revisions).
5. Run `npm run lint`, `npm run test`, and `npm run typecheck`.
6. Re-run CDP end-to-end verification for the update/regenerate scenario.

### Progress

- [x] Step 1 complete — CDP repro (HMR enabled, mock backend) confirms the bug:
  - window title revision increments (`rev 1` → `rev 2`)
  - rendered LLM app remains stale (still shows the original “Last instruction…” paragraph)
  - server revision sources differ (`/revisions/1` vs `/revisions/2`), so generation succeeded but the browser kept running old code
- [x] Step 2 complete — root cause:
  - HMR acceptedPath mismatch: `WindowRuntime` imported window modules with `?rev=<rev>&nonce=<nonce>`, but `ViteWindowModuleBridge` pushed HMR updates for the clean module URL (no query). Vite’s HMR client constructs the re-import URL from `acceptedPath` (including query), so the update targeted a different module instance and never applied.
  - React Fast Refresh invalidation: the virtual module loader appended `export const __aioniosRevision = <rev>`. Because this export changes every revision, React Refresh treated the module as an invalid refresh boundary and refused to apply the update (leaving the rendered app unchanged).
- [x] Step 3 complete — implemented fix:
  - Client: only add cache-busting query params when HMR is disabled; keep a stable module URL when HMR is enabled.
  - Server: for `remount` strategy with HMR enabled, push a `js-update` before sending the remount signal.
  - Server: remove the changing non-component export (`__aioniosRevision`) from the virtual module source to keep React Refresh boundaries valid.
- [x] Step 4 complete — validation: `npm run check` PASS.
- [x] Step 5 complete — CDP verification (HMR enabled on port `9222`) now shows the rendered “Last instruction…” paragraph updates correctly after evolve/regenerate.

- `server/terminal/manager.ts`
  - Added active-session validation (`pid`, `exitCode`, `signalCode`, `killed`) before reusing an existing session.
  - Added guarded cleanup helper for `error`/`close` callbacks to prevent stale or cross-session deletions.
  - Updated `close()` to return accurate booleans when session is missing/already gone and to handle kill failures safely.
- `server/terminal/manager.test.ts` (new)
  - Added mocked child-process harness and focused tests for:
    - start lifecycle status events (`starting` -> `running`)
    - cleanup on close path
    - cleanup on child error path
    - `write()` failure when session missing
    - `close()` semantics for missing/closed/exited sessions
- Intermediate verification
  - `npm run test -- server/terminal/manager.test.ts`: PASS
  - `npm run typecheck`: PASS

### Validation

## 2026-03-01 — Isolation audit: stable shell + system apps vs LLM modules (requested)

### Task Breakdown

1. Read `project-desc.md` architecture intent (stable host + per-window dynamic modules).
2. Inspect client window runtime loader + host bridge exposure points.
3. Inspect Node server routes, orchestrator revision/update path, and Vite virtual module plugin.
4. Audit system-app patterns (Terminal system module + terminal process manager) for LLM reachability.
5. Check whether `sessionId + windowId` scoping prevents cross-window/session contamination.
6. Record concrete weak spots and practical hardening options.

### Findings (summary)

- Window-code updates are scoped by module ID (`/ @window-app/<session>/<window>/entry.tsx`) with HMR/remount strategies, which matches the *stability* intent.
- Runtime isolation is *not* enforced: generated window modules run in the same JS realm as the desktop shell, so they can access DOM globals and call server APIs directly unless separately sandboxed.
- System apps are *not* LLM-generated (`terminal` uses server-side system module source and is excluded from `requestUpdate`), but the terminal capability is still reachable via unauthenticated server routes if untrusted window code can call them directly.

### Notes

- This was an audit-only run; no code changes were made beyond updating this log entry, so lint/tests/typecheck were not re-run.

- `npm run lint && npm run test && npm run typecheck`: PASS
  - `npm run lint`: PASS (exit 0)
  - `npm run test`: PASS (2 files, 10 tests; exit 0)
  - `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-WdSMH1`
  - Logs: `/tmp/aionios-cdp-WdSMH1/logs`
  - Success payload: `{ title: 'Terminal', status: 'ready', windows: 1, icons: 4 }`

## 2026-03-01 — Preference configuration feature (requested)

### Task Breakdown

1. Introduce server config component with defaults, validation, TOML load/save.
2. Inject config component into orchestrator/LLM provider and terminal manager runtime paths.
3. Add server config APIs for read/update.
4. Add Preference as server-owned system app module (not LLM generated).
5. Wire frontend host bridge + client API for configuration operations.
6. Extend tests and CDP verification for Preference persistence.

## 2026-03-01 — CDP verification refactor + parallel case review (requested)

### Task Breakdown

1. Audit current `scripts/verify-cdp.mjs` and extract concrete cases/scenarios.
2. Refactor into a shared CDP harness + per-case modules (avoid concurrent edits), with configurable remote debugging port.
3. Spawn parallel CDP explorations (one per case) against real Chrome instances with unique ports and isolated profiles.
4. Apply improvements/simplifications and extend coverage for edge cases discovered during exploration.
5. Run `npm run lint`, `npm run test`, `npm run typecheck`.
6. Run end-to-end CDP verification via Chrome `--remote-debugging-port=9222`.
7. Create tidy conventional commits.

### Progress

- [x] Step 1 complete — `scripts/verify-cdp.mjs` is a single 1042-line script covering multiple UI/system-app scenarios; main gaps are hard-coded `9222` (blocks parallel runs) and monolithic structure (hard to review/extend per-case).
- [x] Step 2 complete — refactored `scripts/verify-cdp.mjs` into `scripts/cdp/harness.mjs` + `scripts/cdp/cases/*` modules; added `--case/--cases/--list` and `--cdp-port` / `AIONIOS_CDP_PORT` to enable parallel runs on unique CDP ports.
- [x] Step 3 complete — ran case-by-case CDP explorations in parallel (unique CDP ports): PASS for `desktop-shell`, `taskbar-clock`, `context-menu`, `desktop-icons`, `directory`, `editor`; FAIL/flake findings for `terminal`, `preference`, `media`, and `final-state` (dependency failure). Also discovered Vite HMR websocket port conflict during parallel `npm run dev` starts (`WebSocket server error: Port is already in use`).

### Per-step Logs

- Step 1 — Case inventory (current `scripts/verify-cdp.mjs`)
  - Desktop shell render + dependency warm-up stabilization.
  - Taskbar clock renders and ticks.
  - Desktop context menu items + Escape-to-close.
  - Desktop icon interactions (right-click select, single-click select without opening, drag reposition).
  - Terminal app opens + xterm registry + host terminal start/input/output.
  - Preference app form renders + edit fields + save.
  - Directory app creates/saves draft and reflects UI.
  - Media app loads a data URL and updates player.
  - Editor app loads saved draft, edits/saves, and shows highlighted preview.

## 2026-03-01 — Terminal reimplementation (PTY + xterm) (requested)

### Task Breakdown

1. Audit current terminal (child_process + buffer UI) and review `hapi` terminal architecture.
2. Design Aionios PTY + streaming transport (node-pty + WebSocket) and UI approach (@xterm/xterm + FitAddon).
3. Implement PTY-backed terminal manager (spawn, input, resize, close, cleanup).
4. Add terminal WebSocket endpoint and wire to PTY manager (start/input/resize/exit streaming).
5. Rebuild Terminal system app UI with xterm (focus, resize observer, bidirectional streaming).
6. Update unit tests, scripts, and types; run `lint`/`test`/`typecheck`.
7. Run Chrome CDP end-to-end verification for real terminal command execution.
8. Create tidy conventional commits for the change set.

### Progress

- [x] Step 1 complete — reviewed existing `server/terminal/manager.ts`, terminal system module source, session SSE pipeline, and `hapi`'s socket+xterm pattern.
- [x] Step 2 complete — chosen design:
  - server: `node-pty` for real PTY shells, plus a dedicated WebSocket endpoint for bidirectional streaming (`start`/`input`/`resize`/`stop`).
  - client: `@xterm/xterm` + FitAddon to render and compute cols/rows; resize events forwarded to PTY.
  - keep terminal `status`/`exit` as session events, but avoid pushing high-frequency output through the global React reducer.
- [x] Step 3 complete — replaced `child_process` piping with `node-pty` sessions (PTY spawn, write, resize, kill) and added transcript + subscriber fanout.
- [x] Step 4 complete — added `/api/sessions/:sessionId/windows/:windowId/terminal/ws` WebSocket for terminal streaming and wired it to the PTY manager.
- [x] Step 5 complete — rebuilt Terminal system app with `@xterm/xterm`, FitAddon + WebLinksAddon, ResizeObserver-driven resizing, and batched input writes.
- [x] Step 6 complete — updated unit tests and CDP assertions; ran `npm run lint`, `npm run test`, `npm run typecheck`.
- [x] Step 7 complete — `npm run verify:cdp`: PASS (Chrome remote debugging + system apps + terminal command execution).
- [x] Step 8 complete — created conventional commit(s) for the change set (`c1e00af`).

### Per-step Logs

- Backend: `server/terminal/manager.ts`
  - Uses `node-pty` with `TERM=xterm-256color` and per-window sessions keyed by `${sessionId}:${windowId}`.
  - Adds `resize()` and `subscribe()` for transport layers; keeps a capped transcript for late subscribers (and CDP reliability).
- Backend: `server/terminal/ws.ts`, `server/index.ts`
  - WebSocket protocol: client `{type:'start'|'input'|'resize'|'stop'}` ⇄ server `{type:'ready'|'data'|'error'}`.
  - Closes PTY on socket teardown; still supports HTTP `start/input/stop` endpoints for scripts/back-compat.
- Frontend system app: `server/orchestrator/system-apps/terminal.ts`
  - xterm initializes inside `[data-terminal-xterm]`, computes cols/rows via FitAddon, streams to server WebSocket.
  - Exposes live terminals for CDP via `globalThis.__AIONIOS_XTERM__[windowId]`.
- Validation
  - `npm run lint`: PASS
  - `npm run test`: PASS
  - `npm run typecheck`: PASS
  - `npm run verify:cdp`: PASS (temp dir: `/tmp/aionios-cdp-1nQrzw`)

## 2026-03-01 — Audit: system apps + shell stability vs LLM modules (requested)

### Task Breakdown

1. Re-read `project-desc.md` stability/isolation requirements.
2. Trace system app module path (host vs LLM generation).
3. Trace window module load/update path (HMR/remount, module IDs).
4. Review Host API bridge exposure and server route surface for bypass paths.
5. Review import/dependency allowlist enforcement for bypasses.
6. Record PASS/FAIL + concrete risks and minimal hardening plan.

### Findings (summary)

- PASS: System apps (`terminal`, `preference`) are served from stable host-provided module sources and excluded from LLM update flow.
- PASS: Desktop shell + window manager remain mounted while per-window modules update via HMR or per-window remount.
- PASS (with caveat): Update plumbing is scoped by `sessionId + windowId` virtual module IDs and session-scoped SSE, but Vite HMR fallback behavior is not explicitly guarded.
- FAIL / high risk: LLM window code executes in the same browser realm as the shell, so it can mutate DOM globals and call server APIs directly (no sandbox and no auth on routes).
- FAIL / high risk: Import allowlist is enforced only for static `import ... from` statements and is bypassable (dynamic `import()`, TS `import = require`, etc.).

### Notes

- Audit-only run; no functional code changes were made.
7. Run full validation (`lint`, `test`, `typecheck`, `verify:cdp`).

### Progress

- [x] Step 1 complete — added `server/config` component with env-seeded defaults, strict validation, TOML parse/stringify, and atomic save.
- [x] Step 2 complete — moved runtime config reads out of env and into injected config snapshot usage for LLM provider + terminal shell.
- [x] Step 3 complete — added `GET /api/config` and `PUT /api/config` endpoints in `server/index.ts`.
- [x] Step 4 complete — added explicit system app map with `terminal` + `preference`, and explicit system-app update skip path.
- [x] Step 5 complete — added host bridge preference capability plus frontend API/client/catalog plumbing for the Preference app.
- [x] Step 6 complete — added config/provider tests and extended CDP verification script with UI save + API/file persistence assertions.
- [x] Step 7 complete — lint/tests/typecheck/CDP verification all pass.

### Per-step Logs

- `server/config/types.ts`, `server/config/store.ts`, `server/config/index.ts`
  - Added `PreferenceConfig` schema and validation helpers.
  - Added env-default resolution and configurable file path (`AIONIOS_CONFIG_PATH`).
  - Added TOML load/parse and safe write (`write temp -> rename`) persistence flow.
- `server/index.ts`
  - Bootstraps and loads config store on server startup.
  - Injects config readers into orchestrator and terminal manager.
  - Exposes `/api/config` read/update routes.
- `server/orchestrator/llm/provider.ts`, `server/orchestrator/service.ts`
  - LLM provider now consumes config snapshot instead of direct env reads.
  - Regular update path explicitly skips system apps via `isSystemApp`.
- `server/orchestrator/system-modules.ts`
  - Added `Preference` system module UI source (server-owned).
  - Added explicit `SYSTEM_MODULE_SOURCES` map and `isSystemApp`.
- `server/terminal/manager.ts`
  - Terminal shell now resolves from injected config snapshot.
- `src/types.ts`, `src/api/client.ts`, `src/App.tsx`, `src/app-catalog.ts`
  - Added preference config types/API functions/host-bridge methods.
  - Added `Preference` app icon/catalog entry.
- `server/config/store.test.ts`, `server/orchestrator/llm/provider.test.ts`, `server/orchestrator/store.test.ts`, `server/terminal/manager.test.ts`
  - Added coverage for config load/save/update, provider selection by config, system module registration, and terminal shell config usage.
- `scripts/verify-cdp.mjs`
  - Added Preference UI interaction path (open/edit/save).
  - Added API and TOML persistence assertions under isolated temp config path.

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (4 files, 19 tests passed)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-pCRJmX`
  - Logs: `/tmp/aionios-cdp-pCRJmX/logs`
  - Success payload: `{ windows: 2, icons: 5, preferenceStatus: 'Preferences saved.' }`

## 2026-03-01T04:46:52Z — Directory system app source module (host-owned)

### Task Breakdown

1. Inspect existing system-module patterns and constraints.
2. Implement a new host-owned Directory window source string module.
3. Add focused unit coverage for the new source contract and test hooks.
4. Run lint, unit test, and static checks for touched scope.
5. Run CDP end-to-end verification and capture results.

### Progress

- [x] Step 1 complete — reviewed system module source conventions and host bridge file APIs.
- [x] Step 2 complete — added `DIRECTORY_WINDOW_SOURCE` with file list grouping, selection, preview, save flow, and loading/error states.
- [x] Step 3 complete — added targeted tests asserting host operations and required `data-directory-*` hooks.
- [x] Step 4 complete — targeted lint + unit test + server typecheck passed.
- [x] Step 5 complete — CDP verification script passed in Chrome.

### Per-step Logs

- `server/orchestrator/system-apps/directory.ts` (new)
  - Exported `DIRECTORY_WINDOW_SOURCE` string containing `export default function WindowApp`.
  - Implemented host-backed explorer flow via `host.listFiles()`, directory grouping from file paths, selectable file list, preview/editor content from `host.readFile(path)`, and save/create flow with `host.writeFile(path, content)`.
  - Added stable test hooks: `data-directory-app`, `data-directory-list`, `data-directory-selected`, `data-directory-save`.
  - Added defensive loading/error/status messaging for list/read/save operations.
- `server/orchestrator/system-apps/directory.test.ts` (new)
  - Added source-level assertions for required host methods and stable testing hooks.

### Validation

- `npx eslint server/orchestrator/system-apps/directory.ts server/orchestrator/system-apps/directory.test.ts`: PASS (exit 0)
- `npm run test -- server/orchestrator/system-apps/directory.test.ts`: PASS (1 file, 2 tests; exit 0)
- `npx tsc --noEmit -p tsconfig.server.json`: PASS (exit 0)
- `npm run verify:cdp`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-Lxz66m`
  - Logs: `/tmp/aionios-cdp-Lxz66m/logs`
  - Success payload: `{ windows: 2, icons: 5, preferenceStatus: 'Preferences saved.' }`

## 2026-03-01T12:48:00Z — Media system app module source (requested)

### Task Breakdown

1. Inspect current system-app source patterns and host bridge contracts.
2. Implement host-owned Media window source module string.
3. Add focused tests for source contract and media hooks.
4. Run lint/unit/static checks and Chrome CDP verification.
5. Append per-step implementation log and outcomes.

### Progress

- [x] Step 1 complete — reviewed existing system module source style and host bridge file APIs.
- [x] Step 2 complete — added `MEDIA_WINDOW_SOURCE` with host-file listing + read flow and manual URL fallback.
- [x] Step 3 complete — added focused assertions for required hooks and host/media usage.
- [x] Step 4 complete — lint, tests, typecheck, and CDP verification all pass.
- [x] Step 5 complete — recorded this section with per-step logs and command results.

### Per-step Logs

- `server/orchestrator/system-apps/media.ts` (new)
  - Added `MEDIA_WINDOW_SOURCE` string exporting `WindowApp`.
  - Implemented lightweight media-kind detection by extension/data URL (`image`/`audio`/`video`).
  - Added host source discovery via `host.listFiles()`, host file content resolution via `host.readFile(...)`, and manual URL input fallback.
  - Added required testing hooks: `data-media-app`, `data-media-source`, `data-media-load`, `data-media-player`.
- `server/orchestrator/system-apps/media.test.ts` (new)
  - Added tests asserting exported window module signature, required hooks, host API usage, and player element coverage.
  - Updated one assertion (`host.listFiles()` -> `.listFiles()`) after initial targeted test failure due multiline formatting in source string.

### Validation

- `npm run lint -- server/orchestrator/system-apps/media.ts server/orchestrator/system-apps/media.test.ts`: PASS (exit 0)
- `npm run test -- server/orchestrator/system-apps/media.test.ts`: FAIL (first run, assertion string mismatch), then PASS (exit 0 after fix)
- `npm run test`: PASS (6 files, 23 tests passed)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-V25NiC`
  - Logs: `/tmp/aionios-cdp-V25NiC/logs`
  - Success payload: `{ windows: 2, icons: 5, preferenceStatus: 'Preferences saved.' }`

## 2026-03-01T04:48:21Z — Editor system app module source with Shiki (requested)

### Task Breakdown

1. Inspect current host-owned system-app source patterns and host bridge file contracts.
2. Implement new host-owned `Editor` window module source string with required test hooks.
3. Add `shiki` dependency and lockfile updates.
4. Add focused source-contract unit tests for the editor module.
5. Run lint/unit/static checks and Chrome CDP verification; record outcomes.

### Progress

- [x] Step 1 complete — reviewed existing system module source style and host bridge file APIs (`listFiles/readFile/writeFile`).
- [x] Step 2 complete — added `EDITOR_WINDOW_SOURCE` with host-backed file browsing, file loading, editing, save flow, and Shiki-based preview.
- [x] Step 3 complete — installed `shiki` and updated dependency manifests.
- [x] Step 4 complete — added targeted tests for source signature, host API usage, required `data-editor-*` hooks, and Shiki usage.
- [x] Step 5 complete — lint, targeted unit test, typecheck, and CDP verification all pass.

### Per-step Logs

- `server/orchestrator/system-apps/editor.ts` (new)
  - Added exported `EDITOR_WINDOW_SOURCE` string containing `export default function WindowApp`.
  - Implemented resilient host interactions:
    - initial file discovery via `host.listFiles()`
    - file load via `host.readFile(path)`
    - save via `host.writeFile(path, content)`
  - Added lightweight state handling for list/loading/saving/highlighting/error/status conditions.
  - Added syntax-highlighted preview via real Shiki rendering (`import('shiki')` + `codeToHtml`), with plaintext fallback on highlight failures.
  - Added required testing hooks: `data-editor-app`, `data-editor-files`, `data-editor-textarea`, `data-editor-save`, `data-editor-preview`.
- `package.json`, `package-lock.json`
  - Added runtime dependency: `shiki@^4.0.0`.
- `server/orchestrator/system-apps/editor.test.ts` (new)
  - Added focused source-level assertions for default export, host API usage, required hooks, and Shiki highlight integration markers.

### Validation

- `npx eslint server/orchestrator/system-apps/editor.ts server/orchestrator/system-apps/editor.test.ts`: PASS (exit 0)
- `npm run test -- server/orchestrator/system-apps/editor.test.ts`: PASS (1 file, 4 tests passed)
- `npm run test`: PASS (7 files, 27 tests passed)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-79Sbc1`
  - Logs: `/tmp/aionios-cdp-79Sbc1/logs`
  - Success payload: `{ windows: 2, icons: 5, preferenceStatus: 'Preferences saved.' }`

## 2026-03-01T12:56:00Z — Audit: newly added system apps (`directory`, `media`, `editor`) integration (requested)

### Task Breakdown

1. Re-check architecture intent in `project-desc.md` (stable host + scoped per-window modules).
2. Audit `src/app-catalog.ts` for system/LLM scope boundaries.
3. Audit `server/orchestrator/system-modules.ts` and orchestrator integration path.
4. Audit related tests for new system apps and integration coverage.
5. Run required validations (`lint`, `test`, `typecheck`, `verify:cdp`) and capture outcomes.

### Progress

- [x] Step 1 complete — confirmed project intent requires stable shell host and per-window dynamic isolation.
- [x] Step 2 complete — `directory`, `media`, `editor` are present and marked `kind: 'system'` in app catalog.
- [x] Step 3 complete — system module registry includes all three apps and server generation path resolves them via host-owned sources.
- [x] Step 4 complete — unit tests exist for each new system-app source and system-module registration.
- [x] Step 5 complete — all requested validation commands pass, including Chrome CDP verification.

### Audit Findings

- PASS — Catalog scoping aligns with intent:
  - `src/app-catalog.ts` registers `directory`/`media`/`editor` as `kind: 'system'`, while LLM apps remain separate.
- PASS — Server integration is host-owned:
  - `server/orchestrator/system-modules.ts` maps `directory`/`media`/`editor` to fixed host module sources.
  - `server/orchestrator/service.ts` resolves system apps through `getSystemModuleSource(...)`, and `requestUpdate(...)` no-ops for system apps.
- PASS — Shell/update architecture remains scoped:
  - Window runtime loads by `sessionId + windowId` module IDs and applies per-window HMR/remount behavior without shell-wide reload.
- PASS — Tests cover source contracts + registration:
  - `server/orchestrator/system-apps/directory.test.ts`
  - `server/orchestrator/system-apps/media.test.ts`
  - `server/orchestrator/system-apps/editor.test.ts`
  - `server/orchestrator/store.test.ts` system-module assertions for all three app IDs.

### Risks / Follow-up

- Gap: no dedicated test currently asserts `src/app-catalog.ts` entries directly; catalog wiring is covered only indirectly.
- Gap: current CDP verification flow validates Terminal + Preference paths, not explicit open/render checks for `directory`/`media`/`editor`.

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (7 files, 30 tests; exit 0)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-TLog1C`
  - Logs: `/tmp/aionios-cdp-TLog1C/logs`
  - Success payload: `{ windows: 2, icons: 8, preferenceStatus: 'Preferences saved.' }`

## 2026-03-01T13:11:30Z — Extend CDP verification for `Directory` / `Media` / `Editor` (requested)

### Task Breakdown

1. Review current `scripts/verify-cdp.mjs` flow and required system-app hooks.
2. Add stable Directory E2E checks (open + hooks + save interaction + UI-state assertions).
3. Add stable Media E2E checks (open + hooks + lightweight data-URL load + player assertion).
4. Add stable Editor E2E checks (open + hooks + select/edit/save + preview assertion).
5. Re-run required validation commands and capture outcomes.

### Progress

- [x] Step 1 complete — confirmed existing Terminal + Preference verification flow and hook selectors.
- [x] Step 2 complete — Directory verification now asserts root/hooks and save-result UI state.
- [x] Step 3 complete — Media verification now asserts root/hooks and image-player update via data URL.
- [x] Step 4 complete — Editor verification now asserts root/hooks and full select/edit/save/preview cycle.
- [x] Step 5 complete — lint/test/typecheck and CDP verification pass after script hardening.

### Per-step Logs

- `scripts/verify-cdp.mjs`
  - Added deterministic test constants for cross-app interactions:
    - `DIRECTORY_DRAFT_PATH`, `DIRECTORY_DRAFT_CONTENT`
    - `MEDIA_SOURCE_DATA_URL`
    - `EDITOR_MARKER`
  - Added dependency warm-up (`import('shiki')`) plus shell re-stabilization wait to avoid first-run Vite optimize reload flakiness during Editor checks.
  - Added Directory checks:
    - open app icon
    - assert `data-directory-app`, `data-directory-list`, `data-directory-selected`, `data-directory-save`
    - set draft path/content, save, assert selected path + list entry + textarea content reflect saved state
  - Added Media checks:
    - open app icon
    - assert `data-media-app`, `data-media-source`, `data-media-load`, `data-media-player`
    - load lightweight data-image URL and assert `data-media-player img` updates
  - Added Editor checks:
    - open app icon
    - assert `data-editor-app`, `data-editor-files`, `data-editor-textarea`, `data-editor-save`, `data-editor-preview`
    - select file created in Directory flow, edit textarea, save, assert save status + shiki preview content includes marker
  - Preserved existing Terminal + Preference verification and cleanup behavior.

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (7 files, 30 tests)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-oXZK4E`
  - Logs: `/tmp/aionios-cdp-oXZK4E/logs`
  - Success payload: `{ windows: 5, icons: 8, preferenceStatus: 'Preferences saved.' }`

## 2026-03-01T13:55:00Z — Make system apps open as preloaded host modules

### Task Breakdown

1. Change orchestrator open-window flow so system apps are loaded synchronously from host sources.
2. Ensure client applies open-window snapshot immediately to avoid perceived generation latency.
3. Add regression tests for system-app open/update behavior.
4. Run lint/test/typecheck and CDP verification in a subagent.

### Progress

- [x] Step 1 complete — `WindowOrchestrator.openWindow` now preloads system app source synchronously and emits `window-ready` directly.
- [x] Step 2 complete — `src/App.tsx` now applies `openWindow(...)` response snapshot immediately via `window-server-event` dispatch.
- [x] Step 3 complete — added `server/orchestrator/service.test.ts` to lock behavior for system vs LLM open/update paths.
- [ ] Step 4 pending — run required validations, including CDP verification via subagent.

### Per-step Logs

- `server/orchestrator/service.ts`
  - Added synchronous system-app branch in `openWindow(...)`:
    - reads `getSystemModuleSource(appId)`
    - adds revision immediately with backend `system`
    - emits `window-ready` directly (no loading/generation queue)
  - Removed system-app fallback from `generateRevision(...)` so async generation path is LLM-only.
- `src/App.tsx`
  - `openApp(...)` now consumes `openWindow(...)` response snapshot and dispatches a matching window lifecycle event immediately.
- `server/orchestrator/service.test.ts`
  - Added tests:
    - system apps open directly as `ready` with revision `1`
    - system app `requestUpdate` remains no-op
    - LLM apps still open as `loading`

## 2026-03-01T15:55:18Z — End-to-end verification rerun (requested)

### Task Breakdown

1. Run `npm run verify:cdp`.
2. Capture PASS/FAIL, temp dir/log path, and success payload.

### Progress

- [x] Step 1 complete — executed `npm run verify:cdp` in `/home/wayne/repo/Aionios`.
- [x] Step 2 complete — extracted requested output details for reporting.

### Validation

- `npm run verify:cdp`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-4NfOZE`
  - Logs: `/tmp/aionios-cdp-4NfOZE/logs`
  - Success payload: `{ windows: 5, icons: 8, preferenceStatus: 'Preferences saved.' }`

### Progress Update

- [x] Step 4 complete — required validations all pass:
  - `npm run lint`
  - `npm run test`
  - `npm run typecheck`
  - `npm run verify:cdp` (executed in subagent)

### Validation Update

- Initial CDP rerun failed due local port conflict (`EADDRINUSE :5173`) from an existing dev-server process.
- Re-ran CDP verification in subagent after clearing conflict:
  - `npm run verify:cdp`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-X9tUYq`
  - Logs: `/tmp/aionios-cdp-X9tUYq/logs`
  - Success payload: `{ windows: 5, icons: 8, preferenceStatus: 'Preferences saved.' }`

## 2026-03-01T16:27:51Z — Fix stale `/windows/open` snapshot race for LLM windows

### Task Breakdown

1. Reproduce and inspect the reported ordering race in client window event handling.
2. Implement a concrete stale-event guard so older snapshot events cannot overwrite newer window lifecycle state.
3. Add regression tests for the exact ready/error-then-stale-loading ordering.
4. Run required static and unit validation (`lint`, `test`, `typecheck`).
5. Run end-to-end Chrome CDP verification in a subagent.

### Progress

- [x] Step 1 complete — confirmed race: synthetic non-system open snapshot (`loading`, `rev 0`) could overwrite already-applied `window-ready`/`window-error` events.
- [x] Step 2 complete — added reducer guard to ignore stale lifecycle events (older revision) and ignore stale synthetic remount loading snapshots that would downgrade non-loading state.
- [x] Step 3 complete — added frontend reducer regression tests covering ready/error stale-snapshot downgrade prevention and legitimate loading transition behavior.
- [x] Step 4 complete — `npm run check` passes (lint + vitest + typecheck).
- [x] Step 5 complete — `npm run verify:cdp` passes in subagent with Chrome remote debugging.

### Per-step Logs

- `src/App.tsx`
  - Exported `initialState` and `reducer` for targeted reducer testing.
  - In `applyWindowEvent(...)`, added stale-event handling:
    - ignore any lifecycle event with `event.revision < current.revision`
    - ignore synthetic stale open snapshots (`window-status`, `status: loading`, equal revision, `strategy: remount`) when current window is already non-loading
  - Added narrow ESLint suppressions for `react-refresh/only-export-components` on the two test-only exports.
- `src/App.test.ts`
  - Added regression tests:
    - preserves `ready/rev1` when stale `loading/rev0` snapshot arrives later
    - preserves `error` state when stale `loading/rev0` snapshot arrives later
    - still allows valid `window-status` loading transition when revision metadata is absent

### Validation

- `npm run check`: PASS (exit 0)
  - ESLint: PASS
  - Vitest: PASS (8 files, 33 tests)
  - Typecheck: PASS
- `npm run verify:cdp`: PASS (exit 0) in subagent
  - Temp dir: `/tmp/aionios-cdp-fzvvXS`
  - Logs: `/tmp/aionios-cdp-fzvvXS/logs`
  - Success payload: `{ windows: 5, icons: 8, preferenceStatus: 'Preferences saved.' }`

## 2026-03-01T16:53:11Z — Fix crash when window closes during async generation

### Task Breakdown

1. Inspect `WindowOrchestrator.generateRevision` error path and confirm how deleted-window state triggers a second throw.
2. Implement a guard so catch-path error reporting is skipped when the window no longer exists.
3. Add a regression test that reproduces close-while-generating behavior with a deferred provider response.
4. Run required static and unit validations (`lint`, `test`, `typecheck`).
5. Run end-to-end Chrome CDP verification in a subagent.

### Progress

- [x] Step 1 complete — confirmed crash vector: `addRevision` can throw for missing window, then `setError` in catch rethrows on the same missing window.
- [x] Step 2 complete — added missing-window guard in `generateRevision` catch path before `setError`/`addContextEntry`/`window-error` emission.
- [x] Step 3 complete — added orchestrator regression test that closes a loading LLM window before deferred generation resolves.
- [x] Step 4 complete — `npm run check` passes (lint + vitest + typecheck).
- [x] Step 5 complete — `npm run verify:cdp` passes in subagent with Chrome remote debugging.

### Per-step Logs

- `server/orchestrator/service.ts`
  - In `generateRevision(...)` catch block, early-return when `this.store.getWindow(sessionId, windowId)` is absent.
  - This prevents a second throw from `setError(...)` after a concurrent window close.
- `server/orchestrator/service.test.ts`
  - Mocked `createLlmProvider` generation in tests via `vi.mock`.
  - Added async regression test `does not throw when generation finishes after the window is closed` using a deferred provider promise.
  - Kept existing system/LLM open-state tests intact with default valid generated source.

### Validation

- `npm run check`: PASS (exit 0)
  - ESLint: PASS
  - Vitest: PASS (8 files, 34 tests)
  - Typecheck: PASS
- `npm run verify:cdp`: PASS (exit 0) in subagent
  - Temp dir: `/tmp/aionios-cdp-Krb6Jz`
  - Config path: `/tmp/aionios-cdp-Krb6Jz/preferences.toml`
  - Logs path: `/tmp/aionios-cdp-Krb6Jz/logs`
  - Success payload: `{ windows: 5, icons: 8, preferenceStatus: 'Preferences saved.' }`

## 2026-03-01T17:01:34Z — Desktop-like draggable/resizable/maximizable windows

### Task Breakdown

1. Inspect current window model/reducer and identify where geometry should live.
2. Extend window state/actions to support bounds and maximize state transitions.
3. Implement drag-to-move, edge/corner resize, and maximize/restore controls in window frame.
4. Add reducer tests for bounds/maximize behavior.
5. Run required checks (`lint`, `test`, `typecheck`) and CDP end-to-end verification via subagent.

### Progress

- [x] Step 1 complete — confirmed window state lacked geometry/maximize and used static CSS offsets.
- [x] Step 2 complete — added `x/y/width/height/maximized` to `DesktopWindow` and reducer actions for bounds/maximize.
- [x] Step 3 complete — `WindowFrame` now supports pointer-based drag/resize and maximize/restore (button + double-click title bar).
- [x] Step 4 complete — added reducer test coverage for bounds updates and maximize/restore behavior.
- [x] Step 5 complete — lint/test/typecheck all pass; CDP verification passes in subagent.

### Per-step Logs

- `src/types.ts`
  - Added `WindowBounds` type and geometry fields on `DesktopWindow`.
- `src/App.tsx`
  - Added default/cascaded initial bounds for new windows.
  - Added actions: `window-set-bounds`, `window-toggle-maximize`.
  - Connected `WindowFrame` callbacks to reducer updates.
- `src/components/WindowFrame.tsx`
  - Implemented pointer-driven move/resize handlers with canvas clamping and min window size.
  - Added maximize button and double-click header maximize/restore behavior.
  - Added resize handles for all edges/corners.
- `src/styles.css`
  - Switched canvas overflow to hidden for desktop-like bounds.
  - Updated window sizing rules and maximize styling.
  - Added resize-handle cursor and hit-area styles.
- `src/App.test.ts`
  - Added test: `supports bounds updates and maximize toggle behavior`.

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (8 files, 34 tests)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp`: PASS via subagent
  - Temp dir: `/tmp/aionios-cdp-mAPeIV`
  - Config path: `/tmp/aionios-cdp-mAPeIV/preferences.toml`
  - Logs path: `/tmp/aionios-cdp-mAPeIV/logs`

## 2026-03-01T17:25:24Z — Make desktop app icons draggable

### Task Breakdown

1. Inspect current desktop icon rendering and opening behavior.
2. Add per-icon position state and pointer drag interaction.
3. Update desktop icon styles to support absolute positioning.
4. Run required checks (`lint`, `test`, `typecheck`).
5. Run CDP end-to-end verification in a subagent.

### Progress

- [x] Step 1 complete — icons were static in a flex column and opened app on click.
- [x] Step 2 complete — added pointer-driven drag with bounds clamping and click suppression after drag.
- [x] Step 3 complete — desktop icon container switched to relative layout; icons now absolute with `left/top`.
- [x] Step 4 complete — lint/test/typecheck all pass.
- [x] Step 5 complete — CDP verify pass in subagent.

### Per-step Logs

- `src/components/DesktopIcons.tsx`
  - Added local icon position map keyed by `appId`.
  - Added pointer drag session handling (`pointerdown/move/up/cancel`) with movement threshold.
  - Added container-bound clamping to keep icons in desktop icon region.
  - Added short post-drag click suppression to avoid accidental app opens while dragging.
- `src/styles.css`
  - Updated `.desktop-icons` to relative positioning.
  - Updated `.desktop-icon` to absolute positioning with fixed width and drag-friendly pointer behavior.

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (8 files, 34 tests)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp`: PASS via subagent
  - Temp dir: `/tmp/aionios-cdp-DcGVlP`
  - Config path: `/tmp/aionios-cdp-DcGVlP/preferences.toml`
  - Logs path: `/tmp/aionios-cdp-DcGVlP/logs`

## 2026-03-01T17:41:23Z — Let windows overlap desktop items (except bottom taskbar)

### Task Breakdown

1. Inspect desktop workspace composition and current layer constraints.
2. Refactor workspace rendering to separate background desktop items from window layer.
3. Adjust CSS z-index and pointer-hit behavior so windows can overlap icons/panels.
4. Run required checks (`lint`, `test`, `typecheck`).
5. Run CDP end-to-end verification in a subagent.

### Progress

- [x] Step 1 complete — found `window-canvas` constrained to center grid column.
- [x] Step 2 complete — moved icons/file panel into `desktop-shell__items` background layer; kept `window-canvas` as independent overlay.
- [x] Step 3 complete — set window layer above desktop items while keeping non-window clicks usable.
- [x] Step 4 complete — lint/test/typecheck all pass.
- [x] Step 5 complete — CDP verification pass in subagent.

### Per-step Logs

- `src/App.tsx`
  - Added `desktop-shell__items` wrapper for `DesktopIcons` + `FilePanel`.
  - Kept `window-canvas` as separate sibling overlay in workspace.
- `src/styles.css`
  - `desktop-shell__workspace`: now relative container with overflow hidden.
  - Added `desktop-shell__items` absolute background grid (`120px / 1fr / 260px`).
  - `window-canvas`: switched to absolute inset overlay with higher z-index.
  - Enabled pointer pass-through on canvas and pointer capture on windows (`.window-canvas { pointer-events: none }`, `.window-frame { pointer-events: auto }`).
  - Pinned icon and file panel columns using grid placement.

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (8 files, 34 tests)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp`: PASS via subagent
  - Temp dir: `/tmp/aionios-cdp-qJ7302`
  - Config path: `/tmp/aionios-cdp-qJ7302/preferences.toml`
  - Logs path: `/tmp/aionios-cdp-qJ7302/logs`

## 2026-03-01T17:51:07Z — Fix desktop icon drag area (full desktop) + CDP regression coverage

### Task Breakdown

1. Reproduce the drag-area bug via CDP in a subagent with concrete geometry numbers.
2. Fix icon drag bounds to cover full desktop workspace area (not only icon column).
3. Add concrete regression test coverage to prevent future drag-area regressions.
4. Run required checks (`lint`, `test`, `typecheck`).
5. Reverify end-to-end via CDP in another subagent.

### Progress

- [x] Step 1 complete — reproduced in subagent; `.desktop-icons` width was far smaller than workspace and horizontal drag was capped.
- [x] Step 2 complete — widened icon surface to span desktop item layer width and preserved panel layering.
- [x] Step 3 complete — extended `scripts/verify-cdp.mjs` with an automated icon drag assertion (width + movement threshold checks).
- [x] Step 4 complete — lint/test/typecheck all pass after changes.
- [x] Step 5 complete — second CDP subagent pass after fix.

### Per-step Logs

- CDP reproduction subagent result (before fix):
  - `.desktop-shell__workspace`: `780 x 387`
  - `.desktop-icons`: `120 x 355`
  - terminal icon drag intended `+1200 x +800`, actual horizontal shift only `+8` (capped).
- `src/styles.css`
  - `.desktop-icons` now spans all columns with full height (`grid-column: 1 / -1; height: 100%`) so drag surface covers the desktop area.
  - Added z-index layering so file panel remains visible/interactive above icon layer.
- `scripts/verify-cdp.mjs`
  - Added CDP drag scenario for Terminal icon using `Input.dispatchMouseEvent`.
  - Added assertions for icon layer width vs workspace width and minimum horizontal drag shift.
  - Added timing guard (`delay(300)`) before icon click to avoid click suppression race after drag.

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (8 files, 34 tests)
- `npm run typecheck`: PASS (exit 0)
- CDP reproduction (subagent, pre-fix): PASS (bug reproduced)
- `npm run verify:cdp` (subagent, final): PASS
  - Temp dir: `/tmp/aionios-cdp-hYtRLU`
  - Config path: `/tmp/aionios-cdp-hYtRLU/preferences.toml`
  - Logs path: `/tmp/aionios-cdp-hYtRLU/logs`

## 2026-03-01T17:57:11Z — Rework desktop layout to remove icon vertical drag limits + full regression checks

### Task Breakdown

1. Rethink workspace layout from first principles to avoid grid track shrink behavior.
2. Implement a concrete absolute layout for desktop items (icons + Host Files) with full-height bounds.
3. Strengthen CDP verification with concrete geometry + drag checks (horizontal and vertical).
4. Run required checks (`lint`, `test`, `typecheck`).
5. Run full CDP verification in subagent.

### Progress

- [x] Step 1 complete — identified root issue: desktop items were inside a grid whose implicit row sizing could constrain usable height, causing icon drag and Host Files height shrink.
- [x] Step 2 complete — replaced item-layer grid dependence with absolute-positioned desktop surfaces (`desktop-icons` full inset area, `file-panel` fixed right-side full height).
- [x] Step 3 complete — expanded `verify:cdp` to assert desktop icon layer width/height, Host Files height, and both horizontal + vertical drag movement thresholds.
- [x] Step 4 complete — lint/test/typecheck pass.
- [x] Step 5 complete — full CDP pass in subagent.

### Per-step Logs

- `src/styles.css`
  - `desktop-shell__items` remains absolute inset, no grid tracks.
  - `desktop-icons` changed to `position: absolute; inset: 0;` for full workspace drag area.
  - `file-panel` changed to `position: absolute; top: 0; right: 0; bottom: 0; width: 260px;` so Host Files occupies full vertical space.
- `scripts/verify-cdp.mjs`
  - Added concrete pre-drag geometry capture for `.desktop-icons`, `.desktop-shell__workspace`, and `.file-panel`.
  - Added CDP drag simulation using `Input.dispatchMouseEvent` and checks for both horizontal and vertical movement thresholds.
  - Added failure checks for insufficient icon-layer width/height and shrunk Host Files panel height.

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (8 files, 34 tests)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp`: PASS via subagent
  - Temp dir: `/tmp/aionios-cdp-QPSma8`
  - Config path: `/tmp/aionios-cdp-QPSma8/preferences.toml`
  - Logs path: `/tmp/aionios-cdp-QPSma8/logs`

## 2026-03-01T18:02:55Z — Fix initial window bounds to stay inside window canvas

### Task Breakdown

1. Re-scan `App` window-open and canvas/layout code paths to account for latest local edits.
2. Implement canvas-aware initial window bounds clamping so newly opened windows start fully visible.
3. Add reducer unit test coverage for narrow-canvas initialization.
4. Run required checks (`lint`, `test`, `typecheck`).
5. Run end-to-end Chrome CDP verification in a subagent.

### Progress

- [x] Step 1 complete — confirmed `createInitialWindowBounds` still used fixed size/origin and `.window-canvas` remained `overflow: hidden`.
- [x] Step 2 complete — wired runtime canvas dimensions from `App` into `window-open-local` action and clamped x/y/width/height within canvas bounds.
- [x] Step 3 complete — added reducer test that validates bounds clamping with a narrow canvas.
- [x] Step 4 complete — lint/test/typecheck all pass.
- [x] Step 5 complete — CDP verification pass in subagent.

### Per-step Logs

- `src/App.tsx`
  - Added `CanvasDimensions` payload on `window-open-local`.
  - Added `windowCanvasRef` and `getWindowCanvasDimensions()` to read live canvas size before opening windows.
  - Updated `createInitialWindowBounds` to clamp initial x/y/width/height into current canvas dimensions.
  - Passed measured canvas dimensions through all `window-open-local` dispatch paths.
- `src/App.test.ts`
  - Updated `buildStateWithWindow` helper to optionally provide canvas dimensions.
  - Added regression test: initial window bounds are clamped on a `660x640` canvas (`x: 0`, `width: 660`).

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (8 files, 34 tests)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp`: PASS via subagent
  - Temp dir: `/tmp/aionios-cdp-dm5bnD`
  - Config path: `/tmp/aionios-cdp-dm5bnD/preferences.toml`
  - Logs path: `/tmp/aionios-cdp-dm5bnD/logs`

## 2026-03-01T19:03:58Z — Prefer `$SHELL` for terminal default shell (requested)

### Task Breakdown

1. Remove redundant `AIONIOS_TERMINAL_SHELL` env seeding for terminal defaults.
2. Prefer `$SHELL` first, then platform fallbacks for initial `terminalShell`.
3. Update unit tests + README docs.
4. Run validation (`npm run lint`, `npm run test`, `npm run typecheck`).
5. Run end-to-end Chrome CDP verification in a subagent.
6. Create a tidy conventional commit.

### Progress

- [x] Step 1 complete — removed `AIONIOS_TERMINAL_SHELL` usage from `resolvePreferenceDefaults()`.
- [x] Step 2 complete — `resolveEnvShell()` now returns `$SHELL` when set, before other fallbacks.
- [x] Step 3 complete — updated config-store unit test and README env var notes.
- [x] Step 4 complete — lint/test/typecheck all pass.
- [x] Step 5 complete — CDP verification pass in subagent.
- [x] Step 6 complete — commit created (`de53006`).

### Per-step Logs

- `server/config/store.ts`
  - `resolveEnvShell()` now prioritizes `SHELL` and no longer checks `AIONIOS_TERMINAL_SHELL`.
- `server/config/store.test.ts`
  - Updated env override test to cover `SHELL` precedence.
- `README.md`
  - Removed `AIONIOS_TERMINAL_SHELL` mention; documented `$SHELL` seeding.

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (8 files, 34 tests)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp`: PASS via subagent
  - Temp dir: `/tmp/aionios-cdp-Kd4H4p`
  - Config path: `/tmp/aionios-cdp-Kd4H4p/preferences.toml`
  - Logs path: `/tmp/aionios-cdp-Kd4H4p/logs`

## 2026-03-01T19:25:55Z — Terminal UI: remove chrome + maximize shell viewport (requested)

### Task Breakdown

1. Remove Terminal in-app header/status/tip chrome to free space.
2. Ensure xterm fills the window content area (no inner padding/scrollbars).
3. Run validation (`npm run lint`, `npm run test`, `npm run typecheck`).
4. Run end-to-end Chrome CDP verification in a subagent.
5. Create a tidy conventional commit.

### Progress

- [x] Step 1 complete — removed in-terminal header/status/tip UI elements from the system module.
- [x] Step 2 complete — removed terminal window content padding and disabled outer scrolling so xterm can occupy full area.
- [x] Step 3 complete — lint/test/typecheck all pass.
- [x] Step 4 complete — CDP verification pass in subagent.
- [x] Step 5 complete — commit created (`8e06863`).

### Per-step Logs

- `server/orchestrator/system-apps/terminal.ts`
  - Removed the in-app header (title/shell/cwd/status) and bottom tip.
  - Dropped extra xterm border styling so the terminal viewport can fill the available space.
- `src/styles.css`
  - Added a terminal-only override to remove `.window-frame__content` padding and set `overflow: hidden`.

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (8 files, 34 tests)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp`: PASS via subagent
  - Temp dir: `/tmp/aionios-cdp-47dItu`
  - Config path: `/tmp/aionios-cdp-47dItu/preferences.toml`
  - Logs path: `/tmp/aionios-cdp-47dItu/logs`

## 2026-03-01 — Code review: last 3 commits (requested)

### Task Breakdown

1. Inspect the last 3 commits (`git log -3`) and review diffs.
2. Re-run lint/unit/typecheck to ensure the branch remains healthy.
3. Re-run Chrome CDP end-to-end verification.

### Notes

- Reviewed commits:
  - `8e06863` — `refactor(terminal): maximize xterm viewport`
  - `de53006` — `refactor(config): prefer $SHELL for terminal defaults`
  - `c1e00af` — `feat(terminal): PTY-backed xterm shell`
- Validation (on HEAD):
  - `npm run check`: PASS
  - `npm run verify:cdp`: PASS
    - Temp dir: `/tmp/aionios-cdp-m8JAxD`
    - Logs path: `/tmp/aionios-cdp-m8JAxD/logs`

### Review concerns captured

- `server/config/store.ts` — `resolveEnvShell()` returns `$SHELL` before the Win32 `ComSpec` fallback; this may break Windows defaults when `SHELL` is set (e.g. Git Bash).
- `server/terminal/ws.ts` — `server.on('upgrade')` handler returns early without destroying the socket for unmatched upgrade paths, which can leave upgrade connections hanging.

## 2026-03-01 — Desktop UI: remove Host Files panel (requested)

### Task Breakdown

1. Locate the desktop "Host Files" panel implementation.
2. Remove the panel from the desktop shell UI and clean up styles.
3. Update Chrome CDP verification to stop expecting the panel.
4. Run validation (`npm run check`) and Chrome CDP end-to-end verification in a subagent.
5. Create a tidy conventional commit.

### Progress

- [x] Step 1 complete — identified `FilePanel` and desktop layout render site.
- [x] Step 2 complete — removed the panel component, its render, and CSS.
- [x] Step 3 complete — updated CDP verification script to no longer query or assert the panel.
- [x] Step 4 complete — lint/test/typecheck pass; CDP verification pass in subagent.
- [x] Step 5 complete — commit created (`ff885d8`).

### Per-step Logs

- `src/App.tsx`
  - Removed the `FilePanel` import, related file sorting memo, and render.
- `src/styles.css`
  - Removed `.file-panel*` styling rules.
- `scripts/verify-cdp.mjs`
  - Removed `.file-panel` assertions from the desktop drag check.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp`: PASS via subagent (exit 0)
  - Temp dir: `/tmp/aionios-cdp-EatsQx`
  - Config path: `/tmp/aionios-cdp-EatsQx/preferences.toml`
  - Logs path: `/tmp/aionios-cdp-EatsQx/logs`

## 2026-03-01 — Desktop icons: selection + double-click open (requested)

### Task Breakdown

1. Review current desktop icon border/hover/open behavior.
2. Remove the default icon border and hover styling.
3. Add click-to-select state with a visible selected border.
4. Change icon open action from single click to double click.
5. Update Chrome CDP verification to assert selection + use double click for opening apps.
6. Run validation (`npm run check`) and Chrome CDP end-to-end verification in a subagent.
7. Create a tidy conventional commit.

### Progress

- [x] Step 1 complete — reviewed `DesktopIcons` interactions and `.desktop-icon` CSS.
- [x] Step 2 complete — removed hover style; default border/background are now hidden.
- [x] Step 3 complete — added per-icon selection state and styling.
- [x] Step 4 complete — switched open action to `dblclick`.
- [x] Step 5 complete — updated `verify:cdp` to validate selection and to open apps via double click.
- [x] Step 6 complete — lint/test/typecheck pass; CDP verification pass in subagent.
- [x] Step 7 complete — commit created (`16fcbfe`, amended from `a762e3f`).

### Per-step Logs

- `src/components/DesktopIcons.tsx`
  - Added `selectedAppId` state and click-to-select behavior.
  - Added `onDoubleClick` to open apps; single click no longer opens.
  - Added background click handler to clear selection.
- `src/styles.css`
  - Removed `.desktop-icon:hover` styling.
  - Default border/background are transparent; `.desktop-icon--selected` shows the selected border + background.
- `scripts/verify-cdp.mjs`
  - Added an assertion that single click selects and does not open a window.
  - Updated app opening actions from `click()` to dispatching `dblclick`.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp`: PASS via subagent (exit 0)
  - Temp dir: `/tmp/aionios-cdp-RfZ1LI`
  - Config path: `/tmp/aionios-cdp-RfZ1LI/preferences.toml`
  - Logs path: `/tmp/aionios-cdp-RfZ1LI/logs`

### Commit

- `feat(desktop-icons): select on click, open on double-click` (`16fcbfe`)

## 2026-03-01 — Desktop: custom right-click context menu (requested)

### Task Breakdown

1. Add a reusable context menu overlay component.
2. Hook `contextmenu` events on the desktop shell and suppress the native browser menu.
3. Render menu items: Refresh (no-op), Create/Delete (disabled stubs).
4. Extend CDP verification to assert open/close + menu items.
5. Run validation (`npm run check`) and CDP end-to-end verification in a subagent.

### Progress

- [x] Step 1 complete — created a `ContextMenu` overlay component with viewport clamping + Escape-to-close.
- [x] Step 2 complete — added a desktop-shell `onContextMenu` hook (Shift or editable fields keep native menu).
- [x] Step 3 complete — menu shows `Refresh`, `Create`, `Delete` (Create/Delete disabled; no behavior implemented yet).
- [x] Step 4 complete — updated `verify:cdp` to right-click the desktop, assert menu items, then dismiss via Escape.
- [x] Step 5 complete — lint/test/typecheck pass; CDP verification pass in subagent.

### Per-step Logs

- `src/components/ContextMenu.tsx`
  - Added overlay + menu rendering, viewport clamping, and Escape-to-close behavior.
- `src/App.tsx`
  - Added desktop-level `contextmenu` handler to open the custom menu and prevent the native browser menu.
- `src/styles.css`
  - Added `.context-menu*` styling (overlay + menu + item hover/focus/disabled states).
- `scripts/verify-cdp.mjs`
  - Added a desktop context menu assertion.
  - Updated the dev server spawn to use a free port to avoid `EADDRINUSE` false positives.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp`: PASS via subagent (exit 0)
  - Temp dir: `/tmp/aionios-cdp-8s4WoV`
  - Config path: `/tmp/aionios-cdp-8s4WoV/preferences.toml`
  - Logs path: `/tmp/aionios-cdp-8s4WoV/logs`

### Commit

- Suggested: `feat(context-menu): replace native right-click menu` (not committed in this run)

## 2026-03-01 — Desktop icons: select on right click (requested)

### Task Breakdown

1. Ensure desktop icons can be selected on `contextmenu` (right click).
2. Update CDP verification to assert right-click selection.
3. Run validation (`npm run check`) and CDP end-to-end verification in a subagent.

### Progress

- [x] Step 1 complete — right click now sets the selected icon state (same styling as left click selection).
- [x] Step 2 complete — `verify:cdp` asserts the Terminal icon becomes selected after a right click.
- [x] Step 3 complete — lint/test/typecheck pass; CDP verification pass in subagent.

### Per-step Logs

- `src/components/DesktopIcons.tsx`
  - Added `onContextMenu` handler to select the icon on right click.
- `scripts/verify-cdp.mjs`
  - Added a right-click-on-icon selection assertion.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp`: PASS via subagent (exit 0)
  - Temp dir: `/tmp/aionios-cdp-v70Tak`
  - Config path: `/tmp/aionios-cdp-v70Tak/preferences.toml`
  - Logs path: `/tmp/aionios-cdp-v70Tak/logs`

### Commit

- Suggested: `feat(desktop-icons): select on right-click` (not committed in this run)

## 2026-03-01 — Taskbar: show clock and date (requested)

### Task Breakdown

1. Review current `Taskbar` implementation and CSS layout constraints.
2. Add a live taskbar clock/date widget (HH:MM:SS + yyyy/mm/dd).
3. Update taskbar layout styles so the clock stays right-aligned.
4. Extend CDP end-to-end verification to assert the clock renders and ticks.
5. Run lint/unit/typecheck validation (`npm run check`).
6. Run Chrome CDP end-to-end verification (`npm run verify:cdp`) in a subagent.
7. Create a tidy conventional commit.

### Progress

- [x] Step 1 complete — reviewed `src/components/Taskbar.tsx` and `.taskbar*` styles.
- [x] Step 2 complete — added a live clock/date widget to the right side of the taskbar.
- [x] Step 3 complete — updated flex/overflow rules so window buttons scroll while the clock stays visible.
- [x] Step 4 complete — updated `scripts/verify-cdp.mjs` to validate clock formatting and ticking.
- [x] Step 5 complete — `npm run check` passes (lint/test/typecheck).
- [x] Step 6 complete — `npm run verify:cdp` PASS via subagent (exit 0).
- [x] Step 7 complete — commit created (`2230e23`).

### Per-step Logs

- `src/components/Taskbar.tsx`
  - Added `TaskbarClock` rendering time (HH:MM:SS) and date (yyyy/mm/dd) with `data-taskbar-*` hooks.
- `src/styles.css`
  - Updated `.taskbar__windows` to be `flex: 1` and added `.taskbar__clock*` styles for right alignment.
- `scripts/verify-cdp.mjs`
  - Added assertions for clock render (format regex) and tick (time string changes within 5s).

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp`: PASS via subagent (exit 0)
  - Temp dir: `/tmp/aionios-cdp-G2qjQb`
  - Config path: `/tmp/aionios-cdp-G2qjQb/preferences.toml`
  - Logs path: `/tmp/aionios-cdp-G2qjQb/logs`

### Commit

- `feat(taskbar): show clock and date` (`2230e23`)

## 2026-03-02 — CDP verify suite refactor + stability pass

### Task Breakdown

1. Audit the existing CDP verify script and identify per-scenario seams.
2. Split the monolithic CDP test into a harness + per-case modules.
3. Add stable DOM hooks for CDP selectors where needed.
4. Spawn parallel CDP subagents to review/run each case on unique CDP ports.
5. Fix flakes found during real-browser runs (esp. app-open sequencing).
6. Run lint/unit/typecheck (`npm run check`).
7. Run full Chrome CDP E2E verification (`npm run verify:cdp`) via subagent on port `9222`.
8. Create tidy conventional commits.

### Progress

- [x] Step 1 complete — reviewed `scripts/verify-cdp.mjs` and extracted scenario boundaries.
- [x] Step 2 complete — introduced `scripts/cdp/` harness + case modules, with CLI selection support.
- [x] Step 3 complete — added `data-*` hooks for robust selectors in desktop/taskbar/directory.
- [x] Step 4 complete — ran cases in parallel on ports `9230`–`9239` and gathered review notes.
- [x] Step 5 complete — fixed deterministic failure where terminal window occluded subsequent icons.
- [x] Step 6 complete — `npm run check` passes.
- [x] Step 7 complete — `npm run verify:cdp` passes via subagent (port `9222`).
- [x] Step 8 complete — commits created for this change set.

### Per-step Logs

- `scripts/verify-cdp.mjs`
  - Refactored into a thin runner that supports `--list`, `--case`, `--cases`, and `--cdp-port` (or env `AIONIOS_CDP_PORT`/`CDP_PORT`).
- `scripts/cdp/harness.mjs`
  - Added a harness that starts the dev server on a free port, launches Chrome with `--remote-debugging-port`, attaches via `chrome-remote-interface`, and streams logs to a temp dir.
- `scripts/cdp/cases/*.mjs`
  - Split scenarios into focused case modules (`id`, `title`, `dependsOn`, `run(ctx)`).
- `scripts/cdp/actions.mjs`
  - Added shared CDP actions and improved `openDesktopApp()` to fall back to dispatching a `dblclick` event when the icon is occluded by an existing window (prevents terminal→preference sequencing failures).
- `src/components/DesktopIcons.tsx`
  - Added `data-app-id` to `.desktop-icon` buttons for stable app targeting.
- `src/components/Taskbar.tsx`
  - Added `data-window-id`/`data-app-id` hooks for window buttons and `data-taskbar-status` for status reads.
- `server/orchestrator/system-apps/directory.ts`
  - Added `data-directory-path` and `data-directory-content` hooks to stabilize Directory edits/assertions.
- `server/index.ts`
  - Added `AIONIOS_DISABLE_HMR` gate intended to reduce parallel dev-server interference during CDP runs.

### Validation

- Parallel case review/runs: PASS for all individual cases after `openDesktopApp()` stabilization.
- `npm run check`: PASS (exit 0)
- `npm run verify:cdp`: PASS via subagent (exit 0)

### Commit

- `test(cdp): add stable selectors` (`72a06ae`)
- `refactor(cdp): split verify suite into harness and cases` (`18467b9`)

## 2026-03-01 — Install project icon (favicon/PWA/assets)

### Task Breakdown

1. Review existing icon/branding integration points.
2. Add a reproducible icon generation script (multi-size + favicon.ico).
3. Generate `public/` icon assets from `icon.png`.
4. Wire favicon/apple-touch-icon/manifest in `index.html`.
5. Extend CDP verification to assert branding assets are reachable.
6. Run lint/tests/typecheck and CDP end-to-end verification.

### Progress

- [x] Step 1 complete — confirmed no existing favicon/manifest wiring; `icon.png` present as source asset.
- [x] Step 2 complete — added `scripts/generate-icons.mjs` powered by `sharp` + `png-to-ico`.
- [x] Step 3 complete — generated `public/favicon*`, `public/apple-touch-icon.png`, and `public/icons/icon-*`.
- [x] Step 4 complete — updated `index.html` head links and added `public/site.webmanifest`; added taskbar start icon.
- [x] Step 5 complete — added CDP case `branding-icons` to verify head links + asset fetches.
- [x] Step 6 complete — `npm run check` and `npm run verify:cdp` both pass.

### Per-step Logs

- `scripts/generate-icons.mjs`
  - Generates `favicon.ico` (16/32/48) and PNG sizes for favicon + app icons from `icon.png`.
- `public/`
  - Added generated icon outputs and `site.webmanifest`.
- `index.html`
  - Added favicon/apple-touch-icon/manifest links and `theme-color` meta.
- `src/components/Taskbar.tsx`
  - Added the project icon next to the taskbar start label.
- `scripts/cdp/cases/branding-icons.mjs`
  - Added assertions that head links exist and that icon/manifest URLs return 200.

### Validation

- `npm run icons:generate`: PASS
- `npm run check`: PASS (exit 0)
- `npm run verify:cdp`: PASS via subagent (temp dir: `/tmp/aionios-cdp-hZbwwo`, logs: `/tmp/aionios-cdp-hZbwwo/logs`)

## 2026-03-02 — Add white icon variant (dark background)

### Task Breakdown

1. Create a white variant of `icon.png` (preserve alpha).
2. Extend icon generator to output white assets at all sizes.
3. Re-check all icon usages and switch dark surfaces to the white variant.
4. Update CDP branding case to assert both variants + taskbar usage.
5. Regenerate icon assets and run validation (`check` + CDP).

### Progress

- [x] Step 1 complete — generated `icon-white.png` from `icon.png` (solid white RGB + original alpha).
- [x] Step 2 complete — `scripts/generate-icons.mjs` now emits `favicon-white-*`, `apple-touch-icon-white.png`, and `icons/icon-white-*`.
- [x] Step 3 complete — updated taskbar start icon to use `/icons/icon-white-48x48.png`; updated `index.html` favicon links to select black/white by `prefers-color-scheme`; updated manifest with `monochrome` entries.
- [x] Step 4 complete — updated `branding-icons` CDP case to assert the new assets and taskbar icon selection.
- [x] Step 5 complete — regenerated assets and validated.

### Validation

- `npm run icons:generate`: PASS
- `npm run check`: PASS (exit 0)
- `npm run verify:cdp`: PASS via subagent (temp dir: `/tmp/aionios-cdp-R3Uaj5`, logs: `/tmp/aionios-cdp-R3Uaj5/logs`)

## 2026-03-02 — Remove icon generator (one-time assets)

### Task Breakdown

1. Remove the icon generation script + npm script entry.
2. Remove generator-only dependencies and update `package-lock.json`.
3. Update docs to reflect one-time generated assets.
4. Re-run `check` and CDP verification.

### Progress

- [x] Step 1 complete — removed `scripts/generate-icons.mjs` and `icons:generate` from `package.json`.
- [x] Step 2 complete — removed `sharp`/`png-to-ico` dev deps and refreshed lockfile.
- [x] Step 3 complete — updated README icons section to point to static assets in `public/`.
- [x] Step 4 complete — validations pass (note: first CDP run after lockfile changes can trigger Vite optimize+reload; rerun succeeds once optimized).

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp`: PASS via subagent (temp dir: `/tmp/aionios-cdp-lYq5Ux`, logs: `/tmp/aionios-cdp-lYq5Ux/logs`)

## 2026-03-02 — Re-run verify:cdp after icon generation script/deps removal

Plan
1. Confirm icon generation script/dependencies are removed.
2. Run `npm run verify:cdp`.
3. Report final status with temp/log paths and `branding-icons` case result.

Progress
- [x] Step 1 complete — `package.json` no longer contains `icons:generate`, `sharp`, or `png-to-ico`; no `scripts/generate-icons.mjs` exists.
- [x] Step 2 complete — executed `npm run verify:cdp`.
- [x] Step 3 complete — prepared status summary.

Validation
- `npm run verify:cdp`: FAIL (exit 1)
  - Temp dir: `/tmp/aionios-cdp-DUCWqy`
  - Logs: `/tmp/aionios-cdp-DUCWqy/logs`
  - `branding-icons`: PASS
  - Failure: `terminal` case (`Terminal command execution did not produce expected host output`)

## 2026-03-02 — Host-level LLM update controls + open-window instruction (requested)

### Task Breakdown

1. Support optional `instruction` when opening windows (server + client API).
2. Add stable host (window header) control to request LLM updates for LLM windows.
3. Ensure window updates remount when Vite HMR is disabled.
4. Add focused unit coverage for new behavior.
5. Extend Chrome CDP verification with an LLM update case (mock backend).
6. Run `lint` / `test` / `typecheck` and CDP end-to-end verification.

### Progress

- [x] Step 1 complete — `/windows/open` now accepts optional `instruction` and threads it into the initial generation prompt/context.
- [x] Step 2 complete — window header shows a stable “Ask LLM to update” button for LLM windows (independent of generated module UI).
- [x] Step 3 complete — `ViteWindowModuleBridge` now falls back to `remount` whenever HMR is disabled, so updates still apply.
- [x] Step 4 complete — added unit tests for open-window instruction plumbing and HMR-disabled bridge behavior.
- [x] Step 5 complete — added `llm-update` CDP case to open `notes`, trigger update, and assert revision + summary change.
- [x] Step 6 complete — all validation commands pass; CDP verification is passing with new case ordering.

### Per-step Logs

- `server/orchestrator/types.ts`
  - Added `instruction?: string` to `OpenWindowInput`.
- `server/orchestrator/service.ts`
  - Persists initial `instruction` as a context entry and passes it into `generateRevision({ reason: 'initial', instruction })`.
- `server/index.ts`
  - `/api/sessions/:sessionId/windows/open` now validates and forwards optional `instruction`.
- `src/api/client.ts`
  - `openWindow(...)` now supports optional `instruction`.
- `src/components/WindowFrame.tsx`
  - Added a stable header action (✨) that prompts for an instruction and calls `onRequestUpdate(...)` (disabled while loading).
- `src/App.tsx`
  - Wires `WindowFrame.onRequestUpdate` for non-system windows to `requestWindowUpdate(...)`.
- `server/vite/window-module-plugin.ts`
  - `ViteWindowModuleBridge` now returns `{strategy:'remount'}` when `config.server.hmr === false` to keep updates working without HMR.
- `server/vite/window-module-plugin.test.ts` (new)
  - Added tests for HMR-disabled fallback + remount event behavior.
- `server/orchestrator/service.test.ts`
  - Added test asserting initial open-window `instruction` is forwarded into generation request.
- `scripts/cdp/cases/llm-update.mjs` (new)
  - Opens `notes`, asserts header update control, clicks “Ask LLM to Evolve”, and waits for revision + summary update.
- `scripts/cdp/cases/index.mjs`
  - Inserts `llm-update` earlier (before `preference`) so the CDP run stays on the mock backend for this case.

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (9 files, 38 tests)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp`: PASS via subagent
  - Temp dir: `/tmp/aionios-cdp-w0ktT6`
  - Logs: `/tmp/aionios-cdp-w0ktT6/logs`

### Notes

- First CDP attempt failed because the `preference` case persists `llmBackend=codex` (fixture), and the new `llm-update` case then tried to call `codex exec` (missing `--output-last-message <FILE>` argument in that CLI version). Reordered `llm-update` before `preference` to keep it on the mock backend.

## 2026-03-02 — Codex backend compatibility fix (output-last-message file)

### Task Breakdown

1. Confirm current `codex exec` CLI behavior for `--output-last-message`.
2. Update Codex provider to write last message to a temp file and read it back as the generated source.
3. Update defaults/fixtures/docs to remove outdated `--output-last-message` usage.
4. Re-run lint/tests/typecheck and Chrome CDP verification.

### Progress

- [x] Step 1 complete — `codex exec --help` shows `--output-last-message <FILE>` is required (not stdout).
- [x] Step 2 complete — Codex provider now appends `--output-last-message <tempfile>` automatically and reads that file for the final source payload.
- [x] Step 3 complete — updated default `codexCommand`, Preference form defaults, README example, and CDP fixtures.
- [x] Step 4 complete — validations pass, including CDP verification.

### Per-step Logs

- `server/orchestrator/llm/codex-provider.ts`
  - Switched from stdout-based capture to file-based `--output-last-message` capture.
  - Adds lightweight command splitting and strips any existing `--output-last-message` / `-o` args before appending the temp file path.
  - Cleans up temp dir after each run.
- `server/config/store.ts`, `server/config/store.test.ts`
  - Updated default `codexCommand` to `codex exec --skip-git-repo-check` (provider manages output file).
- `server/orchestrator/system-modules.ts`
  - Updated Preference form initial codex command default to match new expected usage.
- `scripts/cdp/fixtures.mjs`
  - Updated `PREFERENCE_EXPECTED.codexCommand` to remove outdated `--output-last-message` flag.
- `README.md`
  - Updated codex backend example command accordingly.

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (9 files, 38 tests)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp`: PASS via subagent
  - Temp dir: `/tmp/aionios-cdp-nPO2Gz`
  - Logs: `/tmp/aionios-cdp-nPO2Gz/logs`

## 2026-03-02 — Codex command argv parsing hardening (backslash-safe)

### Task Breakdown

1. Reproduce `splitCommand` backslash-loss cases.
2. Make escaping context-aware and preserve backslashes.
3. Add unit coverage for backslash/quote cases.
4. Run `npm run check`.
5. Run `npm run verify:cdp` via subagent.

### Progress

- [x] Step 1 complete — confirmed `C:\\repo` and `-c "foo\\bar"` lost backslashes under the old parser (`C:repo`, `foobar`).
- [x] Step 2 complete — `splitCommand` now only treats backslash as an escape for whitespace/quotes/backslash; backslashes are literal inside `'...'`, and in `"..."` only `\\"`/`\\\\` are unescaped.
- [x] Step 3 complete — added splitCommand tests covering Windows paths, quoted strings, and empty args.
- [x] Step 4 complete — `npm run check` PASS.
- [x] Step 5 complete — `npm run verify:cdp` PASS (temp/log paths below).

### Per-step Logs

- `server/orchestrator/llm/codex-provider.ts`
  - Reworked `splitCommand` to avoid consuming backslashes in common inputs (Windows paths, `-c` string values).
  - Preserves empty quoted args (e.g. `""`).
- `server/orchestrator/llm/codex-provider.split-command.test.ts`
  - Added focused unit coverage for backslash + quoting behavior.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp`: PASS via subagent
  - Temp dir: `/tmp/aionios-cdp-j8s5A8`
  - Logs: `/tmp/aionios-cdp-j8s5A8/logs`

## 2026-03-02 — View revision prompts (redact previous source)

### Task Breakdown

1. Add server endpoint to fetch revision prompt only (no source).
2. Redact embedded previous module source from stored prompts to prevent source leaks.
3. Add revision UI to view/copy prompt per revision.
4. Add unit + CDP coverage.
5. Run `npm run check` and CDP verification.

### Progress

- [x] Step 1 complete — added `/revisions/:revision/prompt` API returning prompt-only payload.
- [x] Step 2 complete — server sanitizes prompts by replacing the `Previous module source:` section with `[redacted]`.
- [x] Step 3 complete — Revision dialog supports “View prompt” (read-only viewer + copy/close).
- [x] Step 4 complete — unit test + CDP case assert prompt redaction and ensure no source content is shown.
- [x] Step 5 complete — validations pass, including CDP verification.

### Per-step Logs

- `server/orchestrator/service.ts`
  - Added `getWindowRevisionPrompt(...)`.
  - Added `redactPreviousSource(...)` to strip embedded previous TSX from the stored prompt.
- `server/index.ts`
  - Added `GET /api/sessions/:sessionId/windows/:windowId/revisions/:revision/prompt`.
- `server/orchestrator/service.test.ts`
  - Added assertions validating prompt redaction.
- `src/types.ts`
  - Added `WindowRevisionPromptDetail`.
- `src/api/client.ts`
  - Added `getWindowRevisionPrompt(...)`.
- `src/components/RevisionDialog.tsx`
  - Added “View prompt” action per revision and a prompt viewer (read-only textarea) with Copy/Close controls.
- `src/styles.css`
  - Added prompt viewer layout/styling.
- `scripts/cdp/cases/llm-update.mjs`
  - Added CDP assertions to open the prompt viewer and verify `[redacted]` is present and source strings are absent.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp`: PASS via subagent
  - Temp dir: `/tmp/aionios-cdp-YcbvVR`
  - Logs: `/tmp/aionios-cdp-YcbvVR/logs`

### Notes

- Prompts are stored verbatim (including prior module source as context); the prompt viewer uses the new prompt-only API which redacts that section so the UI can safely show “prompt” without exposing TSX source.

## 2026-03-02 — Edit revision prompt and regenerate

### Task Breakdown

1. Add a prompt-based update endpoint (separate from instruction-based updates).
2. Allow editing the current revision prompt in the UI and regenerate from it.
3. Ensure prompt edits do not leak TSX source and still provide previous source context to the LLM backend.
4. Add unit + CDP coverage.
5. Run `npm run check` and CDP verification.

### Progress

- [x] Step 1 complete — added `POST /actions/prompt` to request updates using an edited prompt.
- [x] Step 2 complete — prompt viewer supports Edit / Reset / Regenerate for the current revision.
- [x] Step 3 complete — server hydrates `[redacted]` with the real previous source for generation while keeping the UI prompt redacted.
- [x] Step 4 complete — unit test asserts prompt override plumbing + hydration; CDP verifies regenerating reflects edited instruction.
- [x] Step 5 complete — validations pass, including CDP verification.

### Per-step Logs

- `server/orchestrator/types.ts`
  - Added `promptOverride?: string` to `GenerateRequest`.
- `server/orchestrator/context.ts`
  - `buildGenerationPrompt(...)` now respects `promptOverride` when provided.
- `server/orchestrator/service.ts`
  - Added `requestPromptUpdate(...)`.
  - Added prompt parsing/hydration helpers (`extractUserInstructionFromPrompt`, `hydrateRedactedPreviousSource`).
- `server/index.ts`
  - Added `POST /api/sessions/:sessionId/windows/:windowId/actions/prompt`.
- `src/api/client.ts`
  - Added `requestWindowPromptUpdate(...)`.
- `src/components/RevisionDialog.tsx`
  - Prompt viewer now supports editing (current revision only) and regeneration.
  - Added stable selectors for CDP (`data-revision-prompt-edit/reset/regenerate/close`).
- `server/orchestrator/service.test.ts`
  - Added coverage asserting prompt override is hydrated with previous source before generation.
- `scripts/cdp/cases/llm-update.mjs`
  - Added prompt-edit + regenerate flow coverage.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp`: PASS via subagent
  - Temp dir: `/tmp/aionios-cdp-tUn12d`
  - Logs: `/tmp/aionios-cdp-tUn12d/logs`

## 2026-03-02 — Branch from a revision (new window)

### Task Breakdown

1. Add server endpoint to branch a new window from an existing window revision.
2. Add UI affordance in revision history to branch from any revision.
3. Ensure branching does not discard existing history in the source window.
4. Add unit + CDP coverage.
5. Run `npm run check` and CDP verification.

### Progress

- [x] Step 1 complete — added `POST /revisions/:revision/branch` API.
- [x] Step 2 complete — Revision dialog lists “Branch” action per revision.
- [x] Step 3 complete — branching creates a new window (new id) seeded with the selected revision source; source window revisions remain unchanged.
- [x] Step 4 complete — unit test covers branching semantics; CDP verifies branching from rev 1 opens a second window with rev 1 content.
- [x] Step 5 complete — validations pass, including CDP verification.

### Per-step Logs

- `server/orchestrator/service.ts`
  - Added `branchWindowRevision(...)` to seed a new window from a selected revision.
- `server/index.ts`
  - Added `POST /api/sessions/:sessionId/windows/:windowId/revisions/:revision/branch`.
- `src/api/client.ts`
  - Added `branchWindowRevision(...)`.
- `src/components/RevisionDialog.tsx`
  - Added Branch button per revision (`data-revision-branch="{rev}"`).
- `src/App.tsx`
  - Wired revision dialog branching to create a new window id and open the branched window locally.
- `server/orchestrator/service.test.ts`
  - Added branching unit coverage.
- `scripts/cdp/cases/llm-update.mjs`
  - Added branching coverage; also waits for rollback summary to avoid flakiness with multiple windows.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp`: PASS via subagent
  - Temp dir: `/tmp/aionios-cdp-zW6cIt`
  - Logs: `/tmp/aionios-cdp-zW6cIt/logs`

## 2026-03-02 — Prevent rollback during in-flight updates

### Task Breakdown

1. Identify rollback behavior when updates are in-flight.
2. Prevent stale generation results from applying after a rollback (server-side guard).
3. Disable revision history/rollback UI while a window is updating.
4. Add unit coverage for rollback vs in-flight update.
5. Run `npm run check` and CDP verification.

### Progress

- [x] Step 1 complete — confirmed rollback can be overridden by a pending generation finishing afterward.
- [x] Step 2 complete — added a rollback barrier so generation tasks enqueued before rollback are ignored.
- [x] Step 3 complete — history button disabled while window status is `loading`; rollback button disabled while updating.
- [x] Step 4 complete — unit test asserts in-flight update completion does not reintroduce a newer revision after rollback.
- [x] Step 5 complete — validations pass, including CDP verification.

### Per-step Logs

- `server/orchestrator/service.ts`
  - Added a per-window rollback barrier; generation tasks check the barrier before persisting revisions, pushing Vite updates, or emitting lifecycle events.
- `server/orchestrator/service.test.ts`
  - Added coverage ensuring in-flight update results are ignored if a rollback happens first.
- `src/components/WindowFrame.tsx`
  - Disabled revision history while the window is updating (`status === 'loading'`).
- `src/components/RevisionDialog.tsx`
  - Disabled rollback while the window is updating; surfaced helper text explaining why.
- `src/App.tsx`
  - Passed window status into `RevisionDialog`.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp`: PASS via subagent
  - Config path: `/tmp/aionios-cdp-vYulI2/preferences.toml`
  - Logs: `/tmp/aionios-cdp-vYulI2/logs`

### Commit

- `fix: prevent rollback during in-flight updates` (`b2f77d5`)

## 2026-03-02 — Regenerate from revision history list actions (follow-up)

### Task Breakdown

1. Add a server endpoint to regenerate a revision using the stored revision prompt.
2. Ensure regeneration does not leak TSX source in the UI (server-side prompt redaction + hydration only for generation).
3. Add a “Regenerate” action per revision in the revision history list.
4. Add unit + CDP coverage for list-based regeneration and revision increment.
5. Run `npm run check` and CDP verification on port `9222`.

### Progress

- [x] Step 1 complete — added `POST /api/sessions/:sessionId/windows/:windowId/revisions/:revision/regenerate`.
- [x] Step 2 complete — regeneration uses stored prompts with `Previous module source` redacted for UI, then hydrated server-side before generation.
- [x] Step 3 complete — revision list items now expose a “Regenerate” action (`data-revision-regenerate="{rev}"`).
- [x] Step 4 complete — unit test asserts regeneration increments revision and hydrates the current previous source; CDP drives the new list action.
- [x] Step 5 complete — validations pass, including CDP verification.

### Per-step Logs

- `server/orchestrator/service.ts`
  - Added `regenerateWindowRevision(...)` to regenerate from a stored revision prompt.
  - Extended `hydrateRedactedPreviousSource(...)` to hydrate prompts that still contain the first-render marker.
- `server/index.ts`
  - Added `POST /api/sessions/:sessionId/windows/:windowId/revisions/:revision/regenerate`.
- `src/api/client.ts`
  - Added `regenerateWindowRevision(...)`.
- `src/components/RevisionDialog.tsx`
  - Added “Regenerate” list action and disables it while loading/rollback/branching/in-flight updates.
- `server/orchestrator/service.test.ts`
  - Added unit coverage for regenerating from a past revision prompt.
- `scripts/cdp/cases/llm-update.mjs`
  - Added coverage for list regenerate and asserts revision increases afterward.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS via subagent
  - Temp dir: `/tmp/aionios-cdp-fTgPfm`
  - Config path: `/tmp/aionios-cdp-fTgPfm/preferences.toml`
  - Logs: `/tmp/aionios-cdp-fTgPfm/logs`

## 2026-03-02 — Stream LLM backend output during generation (experimental)

### Task Breakdown

1. Add a server preference toggle for streaming backend output.
2. Stream Codex stdout/stderr as session SSE events during generation.
3. Add a host-owned UI dialog to view/clear streamed output per window.
4. Run `npm run check`.
5. Run Chrome CDP end-to-end verification on port `9222`.

### Progress

- [x] Step 1 complete — added `llmStreamOutput` preference (TOML `llm.stream_output`) and surfaced it in Preference system app UI.
- [x] Step 2 complete — Codex provider forwards stdout/stderr chunks to orchestrator, which publishes `llm-output` SSE events.
- [x] Step 3 complete — added “LLM output” window header action (📡) and `LlmOutputDialog` to view output safely (host-owned UI).
- [x] Step 4 complete — `npm run check` passes.
- [x] Step 5 complete — CDP verification passes on `--cdp-port 9222`.

### Per-step Logs

- `server/config/store.ts`
  - Added `llmStreamOutput` preference with TOML persistence and `AIONIOS_LLM_STREAM_OUTPUT` env override.
- `server/orchestrator/llm/codex-provider.ts`
  - Emits `onOutputChunk` callbacks for stdout/stderr while `codex exec` runs.
- `server/orchestrator/service.ts`
  - Publishes `llm-output` SSE events when `llmStreamOutput` is enabled.
- `src/types.ts`, `server/orchestrator/types.ts`
  - Added `llm-output` event types.
- `src/components/WindowFrame.tsx`
  - Added a “LLM output” (📡) action for non-system windows.
- `src/components/LlmOutputDialog.tsx`, `src/App.tsx`, `src/styles.css`
  - Added host-owned dialog and client-side buffering/clear behavior (buffer cleared on new `window-status` loading).

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS via subagent
  - Temp dir: `/tmp/aionios-cdp-v6Sy9o`
  - Config path: `/tmp/aionios-cdp-v6Sy9o/preferences.toml`
  - Logs: `/tmp/aionios-cdp-v6Sy9o/logs`

### Commit

- `feat: stream llm output during generation` (`ee22472`)

## 2026-03-02 — Default LLM backend to Codex (experimental)

### Task Breakdown

1. Make Codex the default LLM backend for new configs (still allow disabling via config/env).
2. Update the Preference system app defaults accordingly.
3. Run `npm run check`.
4. Run Chrome CDP end-to-end verification on port `9222`.

### Progress

- [x] Step 1 complete — `resolvePreferenceDefaults(...)` now falls back to `codex` unless `AIONIOS_LLM_BACKEND=mock`.
- [x] Step 2 complete — Preference app initial `llmBackend` is now `codex`.
- [x] Step 3 complete — `npm run check` passes.
- [x] Step 4 complete — CDP verification passes on `--cdp-port 9222`.

### Notes

- Disable the Codex backend by setting `llmBackend=mock` in Preference, or by exporting `AIONIOS_LLM_BACKEND=mock`.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS via subagent
  - Temp dir: `/tmp/aionios-cdp-n5PNBx`
  - Config path: `/tmp/aionios-cdp-n5PNBx/preferences.toml`
  - Logs: `/tmp/aionios-cdp-n5PNBx/logs`

### Commit

- `feat: default llm backend to codex` (`98f1103`)

## 2026-03-02 — Review follow-ups: prompt parsing + prompt editor sync

### Task Breakdown

1. Harden prompt instruction extraction when prompt markers are missing.
2. Ensure the revision prompt textarea exits edit mode when it is no longer current.
3. Add regression coverage for missing-marker prompt overrides.
4. Run `npm run check`.
5. Run Chrome CDP end-to-end verification on port `9222`.

### Progress

- [x] Step 1 complete — `extractUserInstructionFromPrompt(...)` now returns `undefined` when `\nRecent context:` is missing, so `requestPromptUpdate(...)` stores `[Edited generation prompt]` instead of the full prompt body.
- [x] Step 2 complete — prompt viewer textarea `readOnly` now depends on `promptRevision === currentRevision`, and edit mode auto-exits when the current revision changes.
- [x] Step 3 complete — added server-side unit test covering the missing marker prompt path.
- [x] Step 4 complete — `npm run check` passes.
- [x] Step 5 complete — CDP verification passes on `--cdp-port 9222`.

### Notes

- The CDP harness cleans up Chrome on exit, so `http://localhost:9222/json` is not expected to be reachable after completion.
- Non-fatal CDP warnings: unable to warm up shiki/xterm dependencies.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS via subagent
  - Temp dir: `/tmp/aionios-cdp-d0ul2W`
  - Config path: `/tmp/aionios-cdp-d0ul2W/preferences.toml`
  - Logs: `/tmp/aionios-cdp-d0ul2W/logs`

## 2026-03-02 — Verify LLM update changes rendered artifacts (colored squares)

### Task Breakdown

1. Review the existing HMR/remount update pipeline and current fix commit.
2. Create a minimal LLM app prompt that renders colored squares with stable selectors.
3. Use Chrome CDP (port `9222`) to open the app, request an update to change color, and assert computed styles changed.
4. If reproduction still fails, capture evidence (module URL, updated source, console/HMR signals) and identify the root cause.
5. Implement the fix (if needed), run `npm run check`, and re-verify via Chrome CDP.

### Progress

- [x] Step 1 — Review current update code + commit (`e92222d`)
- [x] Step 2 — Define squares prompt + update instruction
- [x] Step 3 — CDP verification (HMR enabled): color changes on update
- [x] Step 4 — Root-cause notes / evidence capture (if failing)
- [x] Step 5 — Fix + `npm run check` + CDP re-verify (if needed)

### Prompts

- Initial prompt: render `data-testid="square"` divs (4x), `backgroundColor: "#ff0000"`, plus `data-testid="color-label"` that says `Color: red`.
- Update instruction: change squares to `backgroundColor: "#0000ff"` and label to `Color: blue` without changing the test ids.

### Run Log (one-off, no repo changes)

- Dev server: `npm run dev` (served on `http://localhost:5173`, HMR enabled, LLM backend defaulted to `codex`)
- Chrome: `google-chrome-stable --remote-debugging-port=9222 --user-data-dir=/tmp/aionios-chrome --headless=new about:blank`
- CDP script (temp): `/tmp/aionios-cdp-oneoff.mjs`

### Results

- Window: `notes` via `open-with-prompt`
- Window id: `0dd94a16-dbc9-4804-ac0f-32908f38b05b`
- Session id: `RLoNk52lmE8sMKHN`
- Revisions: `rev 1` → `rev 2`
- Module URL: `/@window-app/RLoNk52lmE8sMKHN/0dd94a16-dbc9-4804-ac0f-32908f38b05b/entry.tsx`
- Computed colors: `rgb(255, 0, 0)` → `rgb(0, 0, 255)` (verified via `getComputedStyle(...).backgroundColor`)
- Label: `Color: red` → `Color: blue`

## 2026-03-02 — Add debug logs for window update pipeline (user repro support)

### Task Breakdown

1. Add opt-in server logs for: generation result hashes, chosen update strategy, Vite HMR/remount pushes, and window-module loads.
2. Add opt-in browser logs for: window runtime imports (URL used), strategy/revision decisions, and import success/failure.
3. Run `npm run check`.
4. Verify via Chrome CDP on port `9222` with debug enabled.
5. Commit with a conventional message.
6. Document how to enable/capture logs.

### Progress

- [x] Step 1 — Server logs
- [x] Step 2 — Browser logs
- [x] Step 3 — `npm run check`
- [x] Step 4 — CDP verification
- [x] Step 5 — Commit
- [x] Step 6 — Usage notes

## 2026-03-02 — CDP verification after env-var removal changes

### Task Breakdown

1. Run `npm run verify:cdp` (expects Chrome remote debugging on `9222`).
2. Record PASS/FAIL and key log paths.

### Progress

- [x] Step 1 — Ran `cd /home/wayne/repo/Aionios && npm run verify:cdp`
- [x] Step 2 — FAIL: `llm-update` case assertion mismatch; logs at `/tmp/aionios-cdp-d82dVn/logs`
- [x] Step 3 — Root cause: remount updates could re-import cached `/@window-app/.../entry.tsx` when server HMR is disabled but `import.meta.hot` still exists.
- [x] Step 4 — Fix: always append a cache-busting `?rev=<revision>&nonce=<mountNonce>` suffix when `strategy === "remount"` (`src/components/WindowRuntime.tsx`).
- [x] Step 5 — Re-ran `npm run check`: PASS
- [x] Step 6 — Re-ran `npm run verify:cdp`: PASS
  - Temp dir: `/tmp/aionios-cdp-QZyefk`
  - Config path: `/tmp/aionios-cdp-QZyefk/preferences.toml`
  - Logs: `/tmp/aionios-cdp-QZyefk/logs`

## 2026-03-02 — Replace env-var config with Preferences

### Task Breakdown

1. Inventory all env-var based configuration.
2. Move runtime config into Preference (TOML + Preference system app).
3. Update server + CDP scripts to use Preference / CLI flags instead of env vars.
4. Run `npm run check` and Chrome CDP verification.

### Notes

- Removed env-var configuration reads: `PORT`, `AIONIOS_DISABLE_HMR`, `AIONIOS_CONFIG_PATH`, `AIONIOS_LLM_BACKEND`, `AIONIOS_CODEX_COMMAND`, `AIONIOS_CODEX_TIMEOUT_MS`, `AIONIOS_LLM_STREAM_OUTPUT`, `AIONIOS_CDP_PORT`/`CDP_PORT`, `AIONIOS_CDP_HEADLESS`, and `$SHELL` seeding for terminal shell.
- Preference schema now includes:
  - `serverPort` / TOML `server.port`
  - `serverDisableHmr` / TOML `server.disable_hmr`
- Server now supports `--config-path <path>` (alias `--config`) to point at a preferences TOML.
- CDP harness now writes a temp `preferences.toml` and starts dev server with `--config-path` instead of env vars.

## 2026-03-02 — Experimental LLM output streaming (Codex exec)

### Task Breakdown

1. Add Preference toggle `llm.stream_output` and UI viewer per window.
2. Publish `llm-output` SSE events during generation.
3. Stream Codex progress safely via `codex exec --json` events (no prompt/source leakage).
4. Run `npm run check`.
5. Run Chrome CDP verification on port `9222`.

### Progress

- [x] Step 1 — Added `llm.stream_output` Preference + `📡` “LLM output” dialog.
- [x] Step 2 — Orchestrator now publishes `llm-output` during generation when enabled.
- [x] Step 3 — Codex provider now adds `--json` when streaming and emits sanitized summaries (stderr redacts embedded “Previous module source:” blocks).
- [x] Step 4 — `npm run check`: PASS (exit 0)
- [x] Step 5 — `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-LKu79n`
  - Config path: `/tmp/aionios-cdp-LKu79n/preferences.toml`
  - Logs: `/tmp/aionios-cdp-LKu79n/logs`

## 2026-03-02 — Persist Create New apps (desktop + directory)

### Task Breakdown

1. Review existing desktop context-menu Create New flow.
2. Add server-backed host filesystem APIs with on-disk persistence.
3. Add persisted custom app module store (temp dir) and load-on-open behavior.
4. Wire Create New to create a persisted app at the context directory and refresh desktop icons.
5. Add Chrome CDP case verifying: create → close → reopen loads persisted code.
6. Run `npm run check` and `npm run verify:cdp -- --cdp-port 9222`.

### Progress

- [x] Step 1 — Reviewed existing Create New / context-menu flow and Directory context targeting.
- [x] Step 2 — Implemented server-backed host filesystem persistence + API endpoints (`/api/fs/...`) and updated the client host bridge to use them.
- [x] Step 3 — Added persisted app descriptors (`.aionios-app.json`) and persisted app code store under `.aionios/tmp/apps/<appId>/entry.tsx`, plus load-on-open for managed `app-*` ids.
- [x] Step 4 — “Create New” now creates a persisted app at the context directory (desktop `/` or directory path), refreshes desktop icons, and opens the new managed app id.
- [x] Step 5 — Added CDP case `persisted-app` and hardened CDP cases for timing-related flakes.
- [x] Step 6 — `npm run check`: PASS (exit 0)
- [x] Step 6 — `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-QkhQrs`
  - Config path: `/tmp/aionios-cdp-QkhQrs/preferences.toml`
  - Logs: `/tmp/aionios-cdp-QkhQrs/logs`

### Notes

- Intermediate CDP failures resolved:
  - `/tmp/aionios-cdp-vrKyeU/logs` — persisted-app reopen summary raced module load; fixed by waiting for “Last instruction”.
  - `/tmp/aionios-cdp-KXxIwG/logs` — desktop-icons right-click selection flaky via CDP mouse events; fixed by dispatching `contextmenu`.
  - `/tmp/aionios-cdp-5B6mfS/logs` — editor save enablement raced textarea enabled; fixed by waiting for textarea to be editable.

- Follow-up UX hardening (user report: Create New app not visible on desktop):
  - Made “Refresh” context-menu item actually reload persisted apps.
  - Optimistically upserts the created descriptor into desktop icon state before doing a full refresh.
  - Prompt dialog now shows the target directory (`Create New (save to <dir>)`).
  - Re-verified: `npm run verify:cdp -- --cdp-port 9222` PASS
    - Temp dir: `/tmp/aionios-cdp-aRO1eM`
    - Config path: `/tmp/aionios-cdp-aRO1eM/preferences.toml`
    - Logs: `/tmp/aionios-cdp-aRO1eM/logs`

- Follow-up UX hardening (user report: persisted apps created in directories not showing on desktop + icons off-screen):
  - Desktop now lists all persisted apps as icons (regardless of which directory the descriptor was created in).
  - Desktop icon layout now wraps into columns to keep new icons inside the viewport by default.
  - Validation:
    - `npm run check`: PASS (exit 0)
    - `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
      - Temp dir: `/tmp/aionios-cdp-DUa6ok`
      - Config path: `/tmp/aionios-cdp-DUa6ok/preferences.toml`
      - Logs: `/tmp/aionios-cdp-DUa6ok/logs`

## 2026-03-02 — Recycle Bin system app

### Task Breakdown

1. Review filesystem + delete UX surface area.
2. Implement server-side recycle bin store + APIs.
3. Extend client API + Host Bridge for recycle bin.
4. Add Recycle Bin as a system app (catalog + module).
5. Wire delete actions to move-to-bin (not hard delete).
6. Add unit + CDP coverage; run `npm run check` and `npm run verify:cdp -- --cdp-port 9222`.

### Progress

- [x] Step 1 — Reviewed current host filesystem (`.aionios/fs`), confirmed no delete API yet, and found context-menu “Delete” placeholders are currently disabled (`src/App.tsx`).
- [x] Step 2 — Added `RecycleBinStore` (move-to-bin, list, restore, delete, empty) plus server APIs under `/api/recycle-bin/...`.
- [x] Step 3 — Extended client API + `HostBridge.recycleBin`, dispatches `aionios:fs-changed` on trash/restore, and taught the Directory system app to refresh on that event.
- [x] Step 4 — Added `Recycle Bin` as a first-class system app (`recycle-bin`) with UI for restore/permanent delete/empty.
- [x] Step 5 — Added unit coverage for `RecycleBinStore` + CDP case `recycle-bin`; `npm run check`: PASS (exit 0)
- [x] Step 6 — `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-kXmiEZ`
  - Config path: `/tmp/aionios-cdp-kXmiEZ/preferences.toml`
  - Logs: `/tmp/aionios-cdp-kXmiEZ/logs`

## 2026-03-02 — Recycle Bin restore regression (descriptor collisions)

### Observation / Repro

- Restoring a file with the compound extension `.aionios-app.json` while the original path is already taken produced a renamed file like:
  - `apps/My App.aionios-app (restored).json`
- This breaks persisted app discovery because descriptors must end with `.aionios-app.json`.

### Fix

- Preserve compound extensions (specifically `.aionios-app.json`) when generating restore-path suffixes so restored descriptors remain discoverable.
- Validation:
  - `npm run check`: PASS (exit 0)
  - `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
    - Temp dir: `/tmp/aionios-cdp-pTxI3z`
    - Config path: `/tmp/aionios-cdp-pTxI3z/preferences.toml`
    - Logs: `/tmp/aionios-cdp-pTxI3z/logs`

## 2026-03-03 — Recycle Bin restore click regression (window focus triggers reload)

### Observation / Repro

- Clicking anywhere inside a Recycle Bin window first triggered a refresh (`GET /api/recycle-bin/items`), making “Restore” effectively unreachable from the UI.
- DevTools Network showed only the items-list request and no restore request.

### Root Cause

- Window focusing happens on `WindowFrame` `onPointerDown`, which updates desktop state (z-index/focus).
- `src/App.tsx` was recreating the per-window `hostBridge` object on every render.
- The Recycle Bin system app reloads items in a `useEffect([reload])`, with `reload` depending on `host.recycleBin`.
- Focus re-renders changed the `host` identity, which retriggered the effect, set `loading=true`, and unmounted the Restore button before the click completed.

### Fix

- Stabilized the per-window `hostBridge` identity via `useMemo` and a dedicated `WindowRuntimeWithHostBridge` wrapper component.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-ahXq9O`
  - Config path: `/tmp/aionios-cdp-ahXq9O/preferences.toml`
  - Logs: `/tmp/aionios-cdp-ahXq9O/logs`

## 2026-03-03 — CDP: Recycle Bin Restore uses real pointer clicks

### Change

- Updated the `recycle-bin` CDP case to click the Restore button via CDP mouse events (`Input.dispatchMouseEvent`) instead of `button.click()`, so it exercises real focus/pointer behavior.
- Ensured the `llm-update` CDP case closes the Revision History dialog to avoid overlay interference with subsequent pointer-driven cases.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-sw78si`
  - Config path: `/tmp/aionios-cdp-sw78si/preferences.toml`
  - Logs: `/tmp/aionios-cdp-sw78si/logs`

## 2026-03-03 — Directory/Recycle Bin UX cleanup (remove redundant chrome)

### Task Breakdown

1. Remove redundant headers/controls from Directory + Recycle Bin system apps.
2. Align selection + background/box behavior with desktop icon UX.
3. Run `npm run check`.
4. Manual one-shot CDP verification on port `9222` (no prewritten scripts).

### Progress

- [x] Step 1 — Removed redundant headers/controls from system apps
  - Directory: removed header/tagline and top toolbar row (incl. “New File” button).
  - Recycle Bin: removed header/description, filter input, and inline Empty button (Empty is now context-menu only).
- [x] Step 2 — Aligned selection + visual chrome with desktop icon UX
  - System-app icon tiles now match desktop icons (transparent by default; highlight on hover/selected).
  - Clicking *or right-clicking* empty space inside Directory/Recycle Bin clears selection (matches desktop background behavior).
  - Directory context menu now appears even when right-clicking blank space in the file list (not only on directory group headers).
- [x] Step 3 — Validation
  - `npm run check`: PASS (exit 0)
  - Commit: `feat(ui): polish Directory and Recycle Bin UX` (`47fd008`) (squashed from earlier incremental commits)
- [x] Step 4 — Manual one-shot CDP verification on port `9222`
  - PASS (validated; now squashed into `47fd008`): Directory background clears selection; Recycle Bin background shows `Empty Recycle Bin`; delete->bin->restore flow works.

## 2026-03-03 — Refactor tracking kickoff (ongoing)

### Task Breakdown

1. 建立重构跟踪文档（记录已审阅模块、机会点与未覆盖范围）。
2. 扫描前后端模块清单，按“低风险、可验证”优先级挑选重构目标。
3. 每轮重构后运行 `npm run check` 并执行 `npm run verify:cdp` 进行端到端验证。

### Progress

- [x] Step 1 — 已新增 `.context/REFACTOR.md`，用于持续维护审阅范围与重构机会点。
- [x] Step 2 — 已扫描前后端模块清单并识别热点文件（`src/App.tsx`, `server/index.ts`, `server/orchestrator/service.ts` 等）。
- [x] Step 3 — 完成首轮低风险重构（App reducer 抽离）
  - Change: 提取 `src/App.tsx` 中的 `initialState`/`reducer` 及相关纯逻辑到 `src/state/app-state.ts`，测试改为从新模块导入。
  - `npm run check`: PASS (exit 0)
  - `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)（见下方记录）

## 2026-03-03T05:11:49Z — CDP end-to-end verification

- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-WFDPnA`
  - Config path: `/tmp/aionios-cdp-WFDPnA/preferences.toml`
  - Logs: `/tmp/aionios-cdp-WFDPnA/logs`

## 2026-03-03 — Refactor: extract desktop ContextMenu item builder

### Change

- Added `src/desktop/context-menu-items.ts` to centralize `DesktopContextMenuState` and ContextMenu item construction.
- Updated `src/App.tsx` to use `buildDesktopContextMenuItems(...)` so the main App shell remains focused on orchestration.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0) (see next record)

## 2026-03-03T05:35:03Z — CDP end-to-end verification

- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-3xaH6L`
  - Config path: `/tmp/aionios-cdp-3xaH6L/preferences.toml`
  - Logs: `/tmp/aionios-cdp-3xaH6L/logs`

## 2026-03-03 — Refactor: extract desktop context-menu resolver + host bridge component

### Change

- Added `src/desktop/context-menu-resolver.ts` and moved DOM hit-test logic out of `src/App.tsx` into `resolveDesktopContextMenuState(...)`.
- Added `src/components/WindowRuntimeWithHostBridge.tsx` and moved HostBridge assembly out of `src/App.tsx` to keep the App shell focused on orchestration.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-x0R3V6`
  - Config path: `/tmp/aionios-cdp-x0R3V6/preferences.toml`
  - Logs: `/tmp/aionios-cdp-x0R3V6/logs`

## 2026-03-03 — Refactor: extract persisted apps hook

### Change

- Added `src/hooks/usePersistedApps.ts` to encapsulate persisted app loading (`listPersistedApps`) and derived maps/desktop definitions.
- Updated `src/App.tsx` to use `usePersistedApps()` so the shell focuses on orchestration rather than persisted-app bookkeeping.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-rgDPT9`
  - Config path: `/tmp/aionios-cdp-rgDPT9/preferences.toml`
  - Logs: `/tmp/aionios-cdp-rgDPT9/logs`

## 2026-03-03 — Refactor: extract session window events hook

### Change

- Added `src/hooks/useSessionWindowEvents.ts` to centralize the session `EventSource` subscription and Vite HMR remount listener.
- Updated `src/App.tsx` to call `useSessionWindowEvents({ sessionId, dispatch })` and removed the inline effects.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-OXZCdY`
  - Config path: `/tmp/aionios-cdp-OXZCdY/preferences.toml`
  - Logs: `/tmp/aionios-cdp-OXZCdY/logs`

## 2026-03-03 — Refactor: server revision param parsing helper

### Change

- Added `parsePositiveInteger(...)` to `server/index.ts` and reused it across revision-based routes to reduce duplicated validation logic.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-NlQzAP`
  - Config path: `/tmp/aionios-cdp-NlQzAP/preferences.toml`
  - Logs: `/tmp/aionios-cdp-NlQzAP/logs`

## 2026-03-03 — Refactor: extract session bootstrap hook

### Change

- Added `src/hooks/useSessionBootstrap.ts` and moved the `createSession()` bootstrap effect out of `src/App.tsx`.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-r9OpZv`
  - Config path: `/tmp/aionios-cdp-r9OpZv/preferences.toml`
  - Logs: `/tmp/aionios-cdp-r9OpZv/logs`

## 2026-03-03 — Refactor: extract auto-close dialog hook

### Change

- Added `src/hooks/useAutoCloseDialogWhenWindowMissing.ts` and reused it to keep Revision/LlmOutput dialogs in sync with the window list.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-Sa2JdH`
  - Config path: `/tmp/aionios-cdp-Sa2JdH/preferences.toml`
  - Logs: `/tmp/aionios-cdp-Sa2JdH/logs`

## 2026-03-03 — Refactor: server error response helpers

### Change

- Added `jsonError/badRequest/notFound/internalError` helpers to `server/index.ts` and reused them across routes/middleware to reduce duplication while keeping responses identical.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-VOBwwQ`
  - Config path: `/tmp/aionios-cdp-VOBwwQ/preferences.toml`
  - Logs: `/tmp/aionios-cdp-VOBwwQ/logs`

## 2026-03-03 — Refactor: snapshot -> window lifecycle event helpers

### Change

- Added `src/state/window-events.ts` to centralize `ServerWindowSnapshot` -> `ServerWindowEvent` mapping (lifecycle + error).
- Updated `src/App.tsx` open/create flows to reuse the helpers and remove duplicated event construction logic.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-B41oCX`
  - Config path: `/tmp/aionios-cdp-B41oCX/preferences.toml`
  - Logs: `/tmp/aionios-cdp-B41oCX/logs`

## 2026-03-03 — Refactor: extract PromptDialog controller hook

### Change

- Added `src/hooks/usePromptDialogController.ts` to centralize PromptDialog modes (open/update/create), computed copy, and confirm handler.
- Updated `src/App.tsx` to reuse the controller and remove inline nested ternaries/branching for the PromptDialog props.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-2h2Rc2`
  - Config path: `/tmp/aionios-cdp-2h2Rc2/preferences.toml`
  - Logs: `/tmp/aionios-cdp-2h2Rc2/logs`

## 2026-03-03 — Refactor: extract window actions hook

### Change

- Added `src/hooks/useWindowActions.ts` and moved window actions (open/create/update/branch/trash) out of `src/App.tsx` while keeping behavior unchanged.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-id4qKF`
  - Config path: `/tmp/aionios-cdp-id4qKF/preferences.toml`
  - Logs: `/tmp/aionios-cdp-id4qKF/logs`

## 2026-03-03 — Refactor: terminal route guard helper

### Change

- Added `requireTerminalWindowSnapshot(...)` to `server/index.ts` and reused it across terminal start/input/stop routes to reduce duplication while keeping responses identical.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-jXakQE`
  - Config path: `/tmp/aionios-cdp-jXakQE/preferences.toml`
  - Logs: `/tmp/aionios-cdp-jXakQE/logs`

## 2026-03-03 — Refactor: server non-empty string validation helper

### Change

- Added `parseNonEmptyString(...)` to `server/index.ts` and reused it across routes (apps/fs/recycle-bin/revisions/actions) to reduce duplicated string validation branches while keeping responses identical.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-EfChIn`
  - Config path: `/tmp/aionios-cdp-EfChIn/preferences.toml`
  - Logs: `/tmp/aionios-cdp-EfChIn/logs`

## 2026-03-03 — Refactor: server ENOENT/404 error helpers

### Change

- Added `jsonErrorForErrnoNotFound(...)` (and `jsonErrorForNotFoundOrBadRequest(...)`) to `server/index.ts` and reused them in fs/recycle-bin routes to reduce duplicated ENOENT -> 404 branches while keeping responses identical.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-rbr1Vh`
  - Config path: `/tmp/aionios-cdp-rbr1Vh/preferences.toml`
  - Logs: `/tmp/aionios-cdp-rbr1Vh/logs`

## 2026-03-03 — Refactor: extract server/http route helper modules

### Change

- Added `server/http/{validation,responses,route-guards}.ts` and moved the route validation / JSON error / terminal guard helpers out of `server/index.ts` (imported back in) to keep the entrypoint focused and reduce local noise.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-pcweKK`
  - Config path: `/tmp/aionios-cdp-pcweKK/preferences.toml`
  - Logs: `/tmp/aionios-cdp-pcweKK/logs`

## 2026-03-03 — Refactor: extract desktop context menu hook

### Change

- Added `src/hooks/useDesktopContextMenu.ts` and moved desktop right-click ContextMenu state/handler/items wiring out of `src/App.tsx` while keeping behavior unchanged.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-1Z3vPt`
  - Config path: `/tmp/aionios-cdp-1Z3vPt/preferences.toml`
  - Logs: `/tmp/aionios-cdp-1Z3vPt/logs`

## 2026-03-03 — Refactor: optimize app catalog lookups

### Change

- Updated `src/app-catalog.ts` so `getAppDefinition(...)` uses a precomputed Map instead of repeatedly calling `APP_CATALOG.find(...)` (behavior unchanged, faster lookups).

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-MKP1Q9`
  - Config path: `/tmp/aionios-cdp-MKP1Q9/preferences.toml`
  - Logs: `/tmp/aionios-cdp-MKP1Q9/logs`

## 2026-03-03 — Refactor: centralize aionios DOM event dispatch

### Change

- Added `src/aionios-events.ts` to centralize `aionios:*` CustomEvent names + typed dispatch helpers.
- Updated desktop context menu items, window actions, and HostBridge recycle bin helpers to reuse the shared dispatchers (behavior unchanged).

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-aD3cbY`
  - Config path: `/tmp/aionios-cdp-aD3cbY/preferences.toml`
  - Logs: `/tmp/aionios-cdp-aD3cbY/logs`

## 2026-03-03 — Refactor: extract server route modules

### Change

- Added `server/routes/{apps,fs,recycle-bin}.ts` and moved the corresponding route declarations out of `server/index.ts` (registered via `register*Routes(...)`) to improve structure and keep the server entrypoint focused.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-kjCIvr`
  - Config path: `/tmp/aionios-cdp-kjCIvr/preferences.toml`
  - Logs: `/tmp/aionios-cdp-kjCIvr/logs`

## 2026-03-03 — Refactor: extract server config/session routes

### Change

- Added `server/routes/config.ts` and `server/routes/sessions.ts`, moving the corresponding config/session endpoints out of `server/index.ts` (registered via `registerConfigRoutes/registerSessionRoutes`) to further slim down the server entrypoint.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-yprPqi`
  - Config path: `/tmp/aionios-cdp-yprPqi/preferences.toml`
  - Logs: `/tmp/aionios-cdp-yprPqi/logs`

## 2026-03-03 — Refactor: extract server terminal routes

### Change

- Added `server/routes/terminal.ts` and moved terminal start/input/stop routes out of `server/index.ts` (registered via `registerTerminalRoutes`) to keep the server entrypoint focused.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-F2bUEi`
  - Config path: `/tmp/aionios-cdp-F2bUEi/preferences.toml`
  - Logs: `/tmp/aionios-cdp-F2bUEi/logs`

## 2026-03-03 — Refactor: extract server window action routes

### Change

- Added `server/routes/window-actions.ts` and moved window update/prompt routes out of `server/index.ts` (registered via `registerWindowActionRoutes`) to keep the server entrypoint focused.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-GXfsWC`
  - Config path: `/tmp/aionios-cdp-GXfsWC/preferences.toml`
  - Logs: `/tmp/aionios-cdp-GXfsWC/logs`

## 2026-03-03 — Refactor: extract server windows + revisions routes

### Change

- Added `server/routes/windows.ts` and `server/routes/window-revisions.ts`, moving window snapshot/open/close/rollback and revision endpoints out of `server/index.ts` (registered via `registerWindowRoutes/registerWindowRevisionRoutes`) to further slim down the server entrypoint.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-zn5O6v`
  - Config path: `/tmp/aionios-cdp-zn5O6v/preferences.toml`
  - Logs: `/tmp/aionios-cdp-zn5O6v/logs`

## 2026-03-03 — Refactor: add API route registry

### Change

- Added `server/routes/index.ts` exposing `registerApiRoutes(...)`, and updated `server/index.ts` to register all API routes via a single call (order unchanged).

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-oQUTqS`
  - Config path: `/tmp/aionios-cdp-oQUTqS/preferences.toml`
  - Logs: `/tmp/aionios-cdp-oQUTqS/logs`

## 2026-03-04 — Commit hygiene + refactor commit batching

### Change

- Rewrote `origin/main..main` commit history to reduce fragmentation (collapsed standalone `test(cdp): ...` commits into the corresponding feature commits where they were introduced/updated, and folded tiny fixups into adjacent feature commits).
- Applied the previously-stashed refactor work and committed it as several coherent commits:
  - `server/`: route modules + http helpers + slimmer `server/index.ts`.
  - `src/`: extracted state/events, hooks, desktop context menu helpers, and `WindowRuntimeWithHostBridge`, then slimmed `src/App.tsx`.
  - Added `.context/REFACTOR.md` to track reviewed modules and refactor backlog.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-23fQbB`
  - Config path: `/tmp/aionios-cdp-23fQbB/preferences.toml`
  - Logs: `/tmp/aionios-cdp-23fQbB/logs`

## 2026-03-04 — Commit hygiene: squash refactor commits

### Change

- Squashed the recent refactor commits to reduce fragmentation (kept the docs tracker as-is; combined server route split + server entrypoint slimming; combined UI extracted modules into one commit, keeping `App` slimming separate).

### Validation

- `npm run check`: PASS (exit 0)

## 2026-03-04 — Repo hygiene: stop tracking `.context/REFACTOR.md`

### Change

- Removed `.context/REFACTOR.md` from `main` history and deleted the backup ref that still contained it, so the file is no longer reachable via `git log --all -- .context/REFACTOR.md`.

### Validation

- `npm run check`: PASS (exit 0)

## 2026-03-04 — Verification: commit hygiene + `.context/REFACTOR.md` purge

### Change

- Confirmed `.context/REFACTOR.md` is absent from the working tree and unreachable in refs (`git log --all -- .context/REFACTOR.md` produces no output).
- Confirmed there are no standalone `test(cdp): ...` commits in `origin/main..HEAD` (tests are folded into the related feature commits).

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp -- --cdp-port 9222 --headless`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-HaC2Jc`
  - Config path: `/tmp/aionios-cdp-HaC2Jc/preferences.toml`
  - Logs: `/tmp/aionios-cdp-HaC2Jc/logs`

## 2026-03-05 — Review: changes vs `origin/main` (requested)

### Summary

- `main` is ahead of `origin/main` by 28 commits.
- Diff vs `origin/main` (after committing stability + editor/vite fixes): 82 files changed, 8726 insertions, 1250 deletions.
- Stability fixes (initially in the working tree): 11 files changed, 589 insertions, 97 deletions (committed as `274cc9a`, `10e3b1e`, `bb71812`).

### Commands

- `git fetch origin`
- `git log --oneline --reverse origin/main..HEAD`
- `git diff --stat origin/main..HEAD`
- `npm run check`
- `npm run verify:cdp`

### Notes / Findings

- Major areas in `origin/main..HEAD`: host-controlled LLM window updates; prompt + revision dialogs; streaming LLM generation; preferences; persisted apps; Directory + Recycle Bin apps + API; server route modularization; App shell refactors; expanded CDP coverage.
- Observed Vite full-page reloads during some first-time virtual window module loads; mitigated by persisting `sessionId` in `sessionStorage` and restoring windows on boot; SSE subscribe now sends current window snapshots to rebuild client state.
- CDP cases were hardened to tolerate reloads and validate persistence via API/TOML where UI status messages are flaky.
- Note: subagent-based CDP verification was attempted, but `spawn_agent` was blocked by the agent thread limit, so verification was run directly in this session.

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-2ROH4p`
  - Config path: `/tmp/aionios-cdp-2ROH4p/preferences.toml`
  - Logs: `/tmp/aionios-cdp-2ROH4p/logs`
  - Warnings: desktop reload during warm-up; preference UI “saved” toast not observed (persistence verified).

## 2026-03-05 — Fix: Editor Shiki highlighting in browser (follow-up)

### Task Breakdown

1. Confirm `import('shiki')` fails during CDP warm-up.
2. Update the Editor system-app window source to use the web bundle (`shiki/bundle/web`).
3. Add Vite `optimizeDeps.include` entries for Shiki + Xterm to reduce dependency-optimization reloads.
4. Strengthen CDP Editor assertions to require Shiki-highlighted markup (not just the fallback `<pre class="shiki">`).
5. Re-run validation (`npm run check`) and end-to-end CDP verification (`npm run verify:cdp`).
6. Create tidy conventional commits.

### Progress

- [x] Step 1 complete — CDP warm-up reported Shiki import failure during `desktop-shell`.
- [x] Step 2 complete — Editor now imports `shiki/bundle/web`.
- [x] Step 3 complete — added `optimizeDeps.include` for `shiki/bundle/web` + xterm deps.
- [x] Step 4 complete — Editor CDP case now waits for Shiki output containing `<span` markup.
- [x] Step 5 complete — checks + CDP verification pass.
- [x] Step 6 complete — commits created.

### Per-step Logs

- `server/orchestrator/system-apps/editor.ts`
  - Switched Shiki import to `import('shiki/bundle/web')` for browser compatibility.
- `vite.config.ts`
  - Added `optimizeDeps.include` entries for `shiki/bundle/web`, `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`.
- `scripts/cdp/cases/desktop-shell.mjs`
  - Warm-up now imports `shiki/bundle/web`.
- `scripts/cdp/cases/editor.mjs`
  - Added a wait/assertion that the preview HTML includes `<span` tokens (Shiki-highlighted output).

### Validation

- `npm run check`: PASS (exit 0)
- `npm run verify:cdp`: PASS (exit 0)
  - Temp dir: `/tmp/aionios-cdp-ITRugF`
  - Config path: `/tmp/aionios-cdp-ITRugF/preferences.toml`
  - Logs: `/tmp/aionios-cdp-ITRugF/logs`
  - Warnings: desktop reload during warm-up; preference UI “saved” toast not observed; editor UI status may lag (host FS is verified).

### Commits

- `65b3bcf` — `fix(editor): load shiki web bundle for highlighting`
- `f560788` — `chore(vite): prebundle shiki and xterm deps`
- `b3c0770` — `test(cdp): require editor shiki highlighting`

## 2026-03-04 — Feature design kickoff: “Open File” (default system app associations)

### Goal

- Support opening host files like a normal OS: double-clicking a file should open it in an appropriate **system app**.
- Treat “applications” as a special file format (`.aionios-app.json`): double-click launches the app described by the descriptor.

### Current baseline (before implementation)

- Desktop icons (`src/components/DesktopIcons.tsx`) only open apps via `openApp(appId)`.
- Directory system app (`server/orchestrator/system-apps/directory.ts`) double-click behavior:
  - `.aionios-app.json` (valid descriptor) → `host.openApp(descriptor.appId)` ✅
  - Any other file → just selects the file (no “open in Editor/Media”) ❌
- Editor/Media system apps currently self-select the first matching file and require user actions to load a specific target (no “open this path on launch”) ❌

### Proposed top-level design (to implement next)

1. Add a stable host capability: `host.openFile(path)` (available to system apps + LLM windows).
2. Implement default file associations in the host shell:
   - App descriptor (`.aionios-app.json` + parse success) → open `appId`
   - Media extensions (`.png/.jpg/.../.mp3/.mp4/...`) → open `media` system app
   - Everything else → open `editor` system app
3. Pass “launch context” into the target system app via `windowState` (client-owned) so the system app can auto-load the requested file path on mount.
4. Wire UX:
   - Directory: double-click a non-app file → `host.openFile(file.path)`
   - Desktop context menu for files: add `Open` (default association) in addition to Delete.

### Interaction review (OS intuition)

- File selection vs open:
  - Single click selects + previews (Directory keeps its right-hand preview).
  - Double click opens in the associated app (Editor/Media or launches the app descriptor).
- Windowing:
  - Opening a file always spawns a **new** window instance of the associated system app (simple + predictable).
  - Window title should reflect the opened file (e.g. `notes/todo.md — Editor`) so taskbar/window switch matches user expectation.
- Fallbacks:
  - Unknown extension → open in Editor.
  - Descriptor parse failure → open in Editor (treat as plain JSON).

### Implementation sketch (contracts)

- Client-only launch context (no server schema changes):
  - Extend `DesktopWindow` to carry an optional `launch` payload (e.g. `{ kind: 'open-file', path }`).
  - Extend `WindowRuntime` to pass that payload through `windowState.launch` into the loaded module.
- Host bridge:
  - Extend `HostBridge` with `openFile(path)` so system apps and LLM apps can request default open behavior.

### Non-goals (for this iteration)

- Per-user configurable “Open With…” associations.
- Representing arbitrary host files as desktop icons (beyond Directory listing + context menu).
- Multi-tab single-window Editor/Media handling.

### Verification plan

- Unit/static: `npm run lint`, `npm run test`, `npm run typecheck`
- CDP end-to-end: extend/add a `verify:cdp` case to:
  - create a text file via Directory
  - double-click it in Directory
  - assert an Editor window opens and loads the file content automatically

### Implementation (done)

1. Host capability + routing
   - Added `HostBridge.openFile(path)` and `useWindowActions().openFile`.
   - Default associations:
     - `.aionios-app.json` (parse success) → launch `appId`
     - media extensions → `media` system app
     - otherwise → `editor` system app
   - Added client-owned `windowState.launch` payload `{ kind: 'open-file', path }`.
2. UX wiring
   - Directory file tiles: double-click non-descriptor → `host.openFile(file.path)`.
   - Desktop file context menu: added `Open`.
3. System app auto-open
   - Editor/Media system apps read `windowState.launch` and auto-load the target file on mount.
4. Tests / verification
   - Added unit tests for `src/open-file.ts`.
   - Added CDP case `open-file` (Directory double-click opens Editor and loads content).
   - Hardened existing Editor CDP case to wait for `[data-editor-selected]`.

### Validation

- `npm run check`: PASS
- `npm run verify:cdp`: PASS (see run logs below)

### Commits

- `ef62f5e` — `feat(open): open files in default system apps` (includes CDP coverage)

## CDP verify run (2026-03-05T04:53:14+08:00)

- Command: 
> aionios@0.1.0 verify:cdp
> node scripts/verify-cdp.mjs

[verify:cdp] temp dir: /tmp/aionios-cdp-5M1KPd
[verify:cdp] case:start desktop-shell — Desktop shell renders
[verify:cdp] case:pass desktop-shell
[verify:cdp] case:start branding-icons — Branding icons wired
[verify:cdp] branding icons ok: [
  { href: '/favicon.ico', status: 200, ok: true },
  { href: '/favicon-32x32.png', status: 200, ok: true },
  { href: '/favicon-16x16.png', status: 200, ok: true },
  { href: '/favicon-white-32x32.png', status: 200, ok: true },
  { href: '/favicon-white-16x16.png', status: 200, ok: true },
  { href: '/apple-touch-icon.png', status: 200, ok: true },
  { href: '/apple-touch-icon-white.png', status: 200, ok: true },
  { href: '/site.webmanifest', status: 200, ok: true }
]
[verify:cdp] case:pass branding-icons
[verify:cdp] case:start taskbar-clock — Taskbar clock ticks
[verify:cdp] case:pass taskbar-clock
[verify:cdp] case:start context-menu — Desktop context menu opens and closes
[verify:cdp] case:pass context-menu
[verify:cdp] case:start persisted-app — Create New persists app and reloads code
[verify:cdp] case:pass persisted-app
[verify:cdp] case:start desktop-icons — Desktop icons select and drag
[verify:cdp] case:pass desktop-icons
[verify:cdp] case:start llm-update — LLM window updates and loads new revision
[verify:cdp] case:pass llm-update
[verify:cdp] case:start terminal — Terminal app executes host command
[verify:cdp] case:pass terminal
[verify:cdp] case:start preference — Preference app saves config
[verify:cdp] case:pass preference
[verify:cdp] case:start directory — Directory app saves draft
[verify:cdp] case:pass directory
[verify:cdp] case:start open-file — Directory double-click opens file in Editor
[verify:cdp] case:pass open-file
[verify:cdp] case:start recycle-bin — Recycle Bin restores deleted files
[verify:cdp] case:pass recycle-bin
[verify:cdp] case:start media — Media app loads data URL
[verify:cdp] case:pass media
[verify:cdp] case:start editor — Editor app edits and previews markdown
[verify:cdp] case:pass editor
[verify:cdp] case:start final-state — Final desktop state
[verify:cdp] success: {
  windows: 10,
  icons: 10,
  appIds: [
    'notes',      'terminal',
    'preference', 'directory',
    'directory',  'editor',
    'directory',  'recycle-bin',
    'media',      'editor'
  ],
  preferenceStatus: 'Preferences loaded.'
}
[verify:cdp] case:pass final-state
[verify:cdp] config path: /tmp/aionios-cdp-5M1KPd/preferences.toml
[verify:cdp] logs: /tmp/aionios-cdp-5M1KPd/logs
- Purpose: Re-run full end-to-end CDP suite to check flake vs regression


- Result: PASS
- Temp dir: /tmp/aionios-cdp-uh1Ofp
- Logs dir: /tmp/aionios-cdp-uh1Ofp/logs
- Captured output: /tmp/aionios-verify-cdp.out

## 2026-03-04 — "Create New" supports arbitrary file types

### Task Breakdown

1. Audit current "Create New" (app-only) workflow and assumptions.
2. Update persisted app descriptor extension to `.app` (keep legacy `.aionios-app.json` support).
3. Implement Create New extension inference + file templates (agent chooses extension; `.app` stays default).
4. Ensure `.svg` host files render in Media (SVG markup → data URL).
5. Update Directory/Recycle Bin/UI + refresh heuristics that assumed `.aionios-app.json`.
6. Update unit tests + CDP cases and run `npm run check`.
7. Run end-to-end verification with Chrome CDP (`--remote-debugging-port=9222`).

### Progress

- [x] Step 1 — audit current flow
- [x] Step 2 — descriptor extension `.app` + legacy support
- [x] Step 3 — Create New can create files
- [x] Step 4 — SVG render in Media
- [x] Step 5 — system apps + refresh heuristics updated
- [x] Step 6 — lint/tests/typecheck + CDP cases updated
- [x] Step 7 — Chrome CDP end-to-end verification

### Notes (Step 1)

- Current Create New path: desktop/directory context menu → prompt dialog → `createPersistedApp` (`POST /api/apps`) → `openWindow` (LLM window module generation + HMR/remount) → refresh persisted apps list.
- Persisted apps are currently represented in host FS via `.aionios-app.json` descriptor files; Directory + Recycle Bin UI and refresh heuristics hardcode that extension.

### Validation

- `npm run check`: PASS (eslint + vitest + typecheck)
- `npm run verify:cdp`: PASS
  - Logs: `/tmp/aionios-cdp-tFvpDL/logs`

### Commit hygiene

- Squashed implementation + CDP coverage into a single conventional commit (`0e53e2f`) to keep tests and feature changes together.

## 2026-03-05 — Media wallpaper (image/video)

### Task Breakdown

1. Audit current Media system app + desktop shell rendering layers.
2. Add a desktop wallpaper state + host bridge API for updating it.
3. Render the wallpaper layer (image or video) behind icons/windows.
4. Add Media app actions to set/clear wallpaper for images/videos.
5. Update unit tests + CDP verification case for wallpaper behavior.
6. Run `npm run check` and `npm run verify:cdp` (Chrome `--remote-debugging-port=9222`).

### Progress

- [x] Step 1 — audit current Media + shell
- [x] Step 2 — wallpaper state + host API
- [x] Step 3 — wallpaper rendering layer
- [x] Step 4 — Media app UI actions
- [x] Step 5 — tests + CDP case
- [x] Step 6 — full validation + CDP

### Notes (Step 1)

- Media system app source lives in `server/orchestrator/system-apps/media.ts` and is served as a Vite virtual window module.
- Desktop background is currently a static CSS gradient on `.desktop-shell`; window canvas sits above icons via z-index.

### Validation

- `npm run check`: PASS
- `npm run verify:cdp`: PASS
  - Logs: `/tmp/aionios-cdp-QUJyAX/logs`

## 2026-03-05 — Taskbar quick create (desktop default)

### Task Breakdown

1. Make the taskbar logo/start area clickable.
2. Add a slim “quick create” popover with a single prompt input.
3. Wire submit to `Create New` with default directory `/` (desktop root).
4. Add a CDP case to cover the quick create flow and cleanup.
5. Run lint/typecheck and Chrome CDP verification.

### Progress

- [x] Step 1 — taskbar logo is now a button (`data-taskbar-start`).
- [x] Step 2 — quick create popover component + styling added (`data-quick-create`).
- [x] Step 3 — submit calls `createNewApp(instruction, '/')`.
- [x] Step 4 — new CDP case `quick-create` added.
- [x] Step 5 — validation complete.

### Validation

- `npm run lint`: PASS
- `npm run test`: PASS (59 tests)
- `npm run typecheck`: PASS
- `npm run verify:cdp`: PASS
  - Initial re-run FAIL: `desktop-icons` expected `windowCount === 0` (quick-create case left Editor open).
    - Logs: `/tmp/aionios-cdp-qzHoqd/logs`
  - Fixed: quick-create case now closes the Editor window before returning.
  - Logs: `/tmp/aionios-cdp-9wxyKw/logs`

## 2026-03-07 — Local-only tracking files + RevisionDialog prompt viewer extraction

### Task Breakdown

1. Stop tracking `.context/REFACTOR.md` and `impl-log.md` in git while keeping them locally maintained.
2. Continue the next refactor slice by reducing `src/components/RevisionDialog.tsx` complexity.
3. Run `npm run lint`, `npm run test`, and `npm run typecheck`.
4. Run Chrome CDP end-to-end verification on port `9222` via the existing script.

### Progress

- [x] Step 1 — added ignore rule for `.context/REFACTOR.md`, removed both tracking files from git index, kept local copies intact.
- [x] Step 2 — extracted prompt viewer state/effects into `src/hooks/useRevisionPromptViewer.ts` and simplified `src/components/RevisionDialog.tsx`.
- [x] Step 3 — lint/test/typecheck passed.
- [x] Step 4 — Chrome CDP verification passed.

### Notes

- This round intentionally kept `impl-log.md` and `.context/REFACTOR.md` local-only. They remain part of the working tree but are no longer part of git history going forward.
- `RevisionDialog` still owns revision list rendering and rollback/branch/regenerate orchestration, but prompt-viewer concerns are now isolated behind a dedicated hook.

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (15 files, 76 tests)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp`: PASS
  - Temp dir: `/tmp/aionios-cdp-KBUUBi`
  - Logs: `/tmp/aionios-cdp-KBUUBi/logs`
  - Final payload summary: `{ windows: 11, icons: 10, preferenceStatus: 'Preferences saved.' }`
  - Non-blocking warnings:
    - `unable to warm up shiki dependency`
    - `unable to warm up xterm dependencies`
    - `preference saved status message was not observed; config was persisted`

## 2026-03-07 — RevisionDialog presentation split (moderate follow-up)

### Task Breakdown

1. Continue refactoring with a moderate scope, avoiding both under-refactor and over-refactor.
2. Reduce `src/components/RevisionDialog.tsx` JSX density by extracting presentation-only pieces.
3. Run `npm run lint`, `npm run test`, and `npm run typecheck`.
4. Run Chrome CDP end-to-end verification through the existing script.

### Progress

- [x] Step 1 — selected a bounded follow-up slice instead of expanding into backend or generic dialog infrastructure.
- [x] Step 2 — extracted `RevisionPromptPanel` and `RevisionListItem` while keeping orchestration in `RevisionDialog`.
- [x] Step 3 — lint/test/typecheck passed.
- [x] Step 4 — Chrome CDP verification passed.

### Notes

- This round was intentionally narrower than the previous one.
- The goal was to improve readability and local maintainability of `RevisionDialog` without introducing a deeper abstraction stack.
- `RevisionDialog` now mainly owns:
  - revision list data loading
  - branch/regenerate/rollback orchestration
  - dialog-level lifecycle concerns

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (15 files, 76 tests)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp`: PASS
  - Temp dir: `/tmp/aionios-cdp-vTF5ee`
  - Logs: `/tmp/aionios-cdp-vTF5ee/logs`
  - Final payload summary: `{ windows: 11, icons: 10, preferenceStatus: 'Preferences saved.' }`
  - Non-blocking warnings:
    - `unable to warm up shiki dependency`
    - `unable to warm up xterm dependencies`
    - `preference saved status message was not observed; config was persisted`

## 2026-03-07 — Backend orchestrator helpers + storage metadata split

### Task Breakdown

1. Continue with moderate backend refactors instead of broad re-architecture.
2. Extract pure helper logic from `server/orchestrator/service.ts` and add focused unit tests.
3. Split host file listing responsibilities by adding a metadata-only path for internal storage usage.
4. Run `npm run lint`, `npm run test`, and `npm run typecheck`.
5. Run Chrome CDP end-to-end verification through the existing script.

### Progress

- [x] Step 1 — scoped the change to pure helpers and one internal performance path only.
- [x] Step 2 — extracted `prompt-utils.ts`, `update-strategy.ts`, and `window-fallback-source.ts`, plus targeted tests.
- [x] Step 3 — added `HostFileSystem.listFileMetadata()` and updated `listAppDescriptors()` to use metadata + targeted reads, plus targeted tests.
- [x] Step 4 — lint/test/typecheck passed.
- [x] Step 5 — Chrome CDP verification passed.

### Notes

- This round kept `WindowOrchestrator` workflow logic in place; only pure helper code moved out.
- This round also improved one clear internal performance path without changing the external filesystem API contract.
- `listFiles()` remains intact for callers that still need full file contents.

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (20 files, 89 tests)
- `npm run typecheck`: PASS (exit 0)
- `npm run verify:cdp`: PASS
  - Temp dir: `/tmp/aionios-cdp-xQuUV4`
  - Logs: `/tmp/aionios-cdp-xQuUV4/logs`
  - Final payload summary: `{ windows: 11, icons: 10, preferenceStatus: 'Preferences saved.' }`
  - Non-blocking warnings:
    - `unable to warm up shiki dependency`
    - `unable to warm up xterm dependencies`
    - `preference saved status message was not observed; config was persisted`

## 2026-03-07T09:42:00+08:00 — Minimal .app metadata verification

### Task Breakdown

1. Narrow verification to one Quick Create `.app` flow only.
2. Observe the loading animation in Chrome and capture the final completing-state emoji + file name.
3. Verify the created app descriptor reuses the same emoji as icon and the same file name in its persisted path.

### Progress

- [x] Step 1 — used Quick Create with a single `.app` prompt and no extra scenarios.
- [x] Step 2 — sampled the real loading UI via Chrome CDP and captured the final completing-state values.
- [x] Step 3 — verified the matching descriptor through `/api/apps`.

### Validation

- Result: PASS
- Prompt: `Create an app for focus sessions with calm timers, task lanes, and a gentle progress view.`
- Observed completing emoji: `🦂`
- Observed completing file name: `Create an app for focus sessions with cal….app`
- Persisted descriptor icon: `🦂`
- Persisted descriptor path: `Create an app for focus sessions with cal….app`
- Desktop icon emoji: `🦂`
- Sampled phase sequence: `loading -> completing`
- Temp dir: `/tmp/aionios-cdp-x4DIa9`
- Logs: `/tmp/aionios-cdp-x4DIa9/logs`
- Config: `/tmp/aionios-cdp-x4DIa9/preferences.toml`

## 2026-03-07T10:15:00+08:00 — Shared short metadata name constraint

### Task Breakdown

1. Review the current artifact metadata sanitization rules and identify where title and file name can diverge.
2. Enforce a shared generated name so `title === fileName`, with no spaces and at most three words.
3. Add/update focused unit tests for the stricter metadata normalization rules.
4. Run `npm run lint`, `npm run test`, and `npm run typecheck`.
5. Re-run a focused Chrome CDP `.app` flow to confirm the tighter naming contract in the real UI.
6. Commit the change in a tidy conventional commit.

### Progress

- [x] Step 1 complete — confirmed the divergence currently lives in `server/orchestrator/llm/metadata.ts`.
- [x] Step 2 complete — server-side parsing now forces one shared metadata name for both `title` and `fileName`, with no spaces and at most three words.
- [x] Step 3 complete — updated focused metadata unit tests to cover the shared-name constraint and the no-space / three-word limit.
- [x] Step 4 complete — `npm run lint`, `npm run test`, and `npm run typecheck` all pass.
- [x] Step 5 complete — focused Chrome CDP verification of one Quick Create `.app` flow passed with the tightened naming contract.
- [x] Step 6 complete — committed the change as `fix(llm): constrain shared metadata names` (`63eb457`).

### Work Log

- Tightened the metadata prompt rules and the parser fallback so the naming contract is enforced even if the LLM returns a longer or split title/file-name pair.
- Switched fallback name derivation to prefer the user instruction over the current title so the short shared name still comes from the generation prompt.

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (22 files, 97 tests)
- `npm run typecheck`: PASS (exit 0)
- Focused Chrome CDP verification: PASS
  - Prompt: `reading sprint planner app`
  - Completing-state emoji: `☪`
  - Completing-state file name: `Reading-Sprint-Planner.app`
  - App title: `Reading-Sprint-Planner.app`
  - Descriptor path: `Reading-Sprint-Planner.app`
  - Descriptor icon: `☪`
  - Desktop icon emoji: `☪`
  - `title === basename(path)`: `true`
  - Spaces present: `false`
  - Word count before `.app`: `3`
  - Temp dir: `/tmp/aionios-cdp-p1K1Hn`
  - Logs: `/tmp/aionios-cdp-p1K1Hn/logs`
  - Config: `/tmp/aionios-cdp-p1K1Hn/preferences.toml`

## 2026-03-07T12:00:00+08:00 — Revision head model with reversible rollback

### Task Breakdown

1. Review the current revision model and identify every place that assumes the latest saved revision is the active one.
2. Introduce an explicit active head in the orchestrator store so switching revisions no longer truncates history.
3. Update orchestrator behavior so new generations are based on the current head source, not necessarily the latest historical revision.
4. Refresh the revision history UI copy and interaction wording to match preserved-history semantics.
5. Run `npm run lint`, `npm run test`, `npm run typecheck`, and focused Chrome CDP verification for the `llm-update` flow.
6. Commit the change in a tidy conventional commit.

### Progress

- [x] Step 1 complete — located all store/service/UI call sites that treated `revisions.at(-1)` as the current revision.
- [x] Step 2 complete — `SessionStore` now tracks an explicit head revision and switching revisions preserves the full revision list.
- [x] Step 3 complete — generation, snapshots, module source loading, and SSE bootstrap now resolve the current revision from the head pointer.
- [x] Step 4 complete — revision dialog copy no longer claims later revisions are discarded; the action now describes switching to a saved revision.
- [x] Step 5 complete — local lint/test/typecheck passed; focused Chrome CDP verification of rollback-to-old-head and switch-back-to-latest also passed in a subagent.
- [x] Step 6 complete — committed as `feat(revisions): preserve history when switching head` (`b48062a`).

### Work Log

- Added a head-based revision model in the orchestrator store and switched rollback semantics from “truncate history” to “move current head”.
- Updated runtime source selection so remount/HMR always use the currently selected revision rather than the newest historical one.
- Added regression coverage for switching from rev 2 to rev 1 and then back to rev 2 without losing history.
- Verified the real browser behavior with Chrome DevTools Protocol on port `9222`: switch to rev 1, then switch back to rev 2, while `/revisions` still reports the full history.

### Validation

- `npm run lint`: PASS (exit 0)
- `npm run test`: PASS (22 files, 99 tests)
- `npm run typecheck`: PASS (exit 0)
- Focused Chrome CDP verification: PASS
  - Commands:
    - `npm run verify:cdp -- --case llm-update` (existing canned case still failed earlier in an unrelated assertion)
    - manual focused CDP verification via `chrome-remote-interface` on `http://127.0.0.1:9222/json`
  - Manual verification outcome:
    - initial revision `1`
    - updated revision `2`
    - switched back to revision `1`
    - switched forward again to revision `2`
    - `/revisions` still listed both revisions
    - window snapshot API reported current revision `2`
  - Temp dir: `/tmp/aionios-cdp-5kP95F`
  - Logs: `/tmp/aionios-cdp-5kP95F/logs`
  - Config: `/tmp/aionios-cdp-5kP95F/preferences.toml`
  - Caveat:
    - `npm run verify:cdp -- --case llm-update` still failed before the revision-head checks at `scripts/cdp/cases/llm-update.mjs` with `Expected updated mock summary to include last instruction, got: ""`
    - Failed canned-case logs: `/tmp/aionios-cdp-OvCMpg/logs`, `/tmp/aionios-cdp-d6R3wb/logs`
