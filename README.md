# Aionios

Aionios is a React + Vite desktop-like shell with **stable host + dynamic window modules**.
The host (desktop/taskbar/window manager/state) is static React code, while each app window is generated as React TSX per `sessionId + windowId`.

## What it includes

- Desktop shell with icons, window manager, and taskbar.
- Host API bridge for generated apps (`openApp`, `readFile`, `writeFile`, `requestUpdate`, `listFiles`).
- Thin Node orchestrator for session/window lifecycle, prompt context, revision history, rollback, and event streaming.
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

## LLM backend

- Default backend is mock (`AIONIOS_LLM_BACKEND=mock`).
- Codex backend is supported through CLI execution:

```bash
AIONIOS_LLM_BACKEND=codex AIONIOS_CODEX_COMMAND="codex exec --skip-git-repo-check --output-last-message" npm run dev
```

## Quality checks

```bash
npm run lint
npm run test
npm run typecheck
```
