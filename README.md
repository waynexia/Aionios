# Aionios

Aionios is a React + Vite desktop-like shell with **stable host + dynamic window modules**.
The host (desktop/taskbar/window manager/state) is static React code, while each app window is generated as React TSX per `sessionId + windowId`.

## What it includes

- Desktop shell with icons, window manager, and taskbar.
- Built-in system apps backed by the host Node server: **Terminal**, **Preference**, **Directory**, **Media**, and **Editor**.
- Host API bridge for generated apps (`openApp`, `readFile`, `writeFile`, `requestUpdate`, `listFiles`, `preference`, `terminal`).
- Thin Node orchestrator for session/window lifecycle, prompt context, revision history, rollback, and event streaming.
- Terminal API endpoints for start/input/stop with per-window stream events over SSE.
- Preference API endpoints (`GET /api/config`, `PUT /api/config`) with TOML persistence.
- Vite virtual module plugin: generated window code is kept in memory and loaded from `/@window-app/<session>/<window>/entry.tsx`.
- Update loop:
  1. user opens app → window appears in loading state
  2. server generates module source
  3. window loads virtual module
  4. user requests evolution
  5. only that window is updated (HMR preferred, remount fallback)

## Run

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

## Icons

- Source icon: `icon.png`
- White variant (for dark surfaces): `icon-white.png`
- Static favicon/PWA assets live in `public/` (including `public/icons/`).

## Preferences

- Runtime preferences are server-owned and persisted in TOML at `.aionios/preferences.toml`.
- Override the config path with:

```bash
npm run dev -- --config-path /path/to/preferences.toml
```

- The Preference system app can edit:
  - `serverPort` (restart required)
  - `serverDisableHmr` (restart required)
  - `llmBackend` (`mock` or `codex`)
  - `codexCommand`
  - `codexTimeoutMs`
  - `llmStreamOutput`
  - `terminalShell`
- Environment variables are not used for configuration.

## Quality checks

```bash
npm run lint
npm run test
npm run typecheck
```
