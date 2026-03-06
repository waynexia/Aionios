# Refactor Tracker

Last updated: 2026-03-06

## Reviewed Modules

### Root / Tooling

- `eslint.config.js`
- `vite.config.ts`
- `tsconfig.json`
- `tsconfig.app.json`
- `tsconfig.server.json`
- `index.html`
- `README.md`
- `package.json`
- `project-desc.md`
- `impl-log.md`

### Frontend

- Entry and shell: `src/main.tsx`, `src/App.tsx`
- Tests: `src/App.test.ts`, `src/open-file.test.ts`
- Shared contracts and state: `src/types.ts`, `src/state/app-state.ts`, `src/state/window-events.ts`, `src/aionios-events.ts`
- API and helpers: `src/api/client.ts`, `src/app-catalog.ts`, `src/open-file.ts`, `src/runtime/module-id.ts`
- Desktop context menu: `src/desktop/context-menu-items.ts`, `src/desktop/context-menu-resolver.ts`
- Hooks: `src/hooks/useAutoCloseDialogWhenWindowMissing.ts`, `src/hooks/useDesktopContextMenu.ts`, `src/hooks/usePersistedApps.ts`, `src/hooks/usePromptDialogController.ts`, `src/hooks/useSessionBootstrap.ts`, `src/hooks/useSessionWindowEvents.ts`, `src/hooks/useWindowActions.ts`
- Components: `src/components/ContextMenu.tsx`, `src/components/DesktopIcons.tsx`, `src/components/DesktopWallpaper.tsx`, `src/components/ErrorBoundary.tsx`, `src/components/LlmOutputDialog.tsx`, `src/components/PromptDialog.tsx`, `src/components/QuickCreate.tsx`, `src/components/RevisionDialog.tsx`, `src/components/Taskbar.tsx`, `src/components/WindowFrame.tsx`, `src/components/WindowRuntime.tsx`, `src/components/WindowRuntimeWithHostBridge.tsx`
- Styles: `src/styles.css`

### Backend

- Entry and bootstrap: `server/index.ts`
- Config: `server/config/index.ts`, `server/config/store.ts`, `server/config/store.test.ts`, `server/config/types.ts`
- HTTP helpers: `server/http/responses.ts`, `server/http/route-guards.ts`, `server/http/validation.ts`
- Routes: `server/routes/index.ts`, `server/routes/apps.ts`, `server/routes/config.ts`, `server/routes/fs.ts`, `server/routes/recycle-bin.ts`, `server/routes/sessions.ts`, `server/routes/terminal.ts`, `server/routes/window-actions.ts`, `server/routes/window-revisions.ts`, `server/routes/windows.ts`
- Orchestrator core: `server/orchestrator/index.ts`, `server/orchestrator/context.ts`, `server/orchestrator/event-bus.ts`, `server/orchestrator/types.ts`, `server/orchestrator/validator.ts`, `server/orchestrator/store.ts`, `server/orchestrator/store.test.ts`, `server/orchestrator/service.ts`, `server/orchestrator/service.test.ts`, `server/orchestrator/system-modules.ts`
- LLM providers: `server/orchestrator/llm/utils.ts`, `server/orchestrator/llm/provider.ts`, `server/orchestrator/llm/provider.test.ts`, `server/orchestrator/llm/mock-provider.ts`, `server/orchestrator/llm/codex-provider.ts`, `server/orchestrator/llm/codex-provider.split-command.test.ts`
- System app sources: `server/orchestrator/system-apps/directory.ts`, `server/orchestrator/system-apps/directory.test.ts`, `server/orchestrator/system-apps/editor.ts`, `server/orchestrator/system-apps/editor.test.ts`, `server/orchestrator/system-apps/media.ts`, `server/orchestrator/system-apps/media.test.ts`, `server/orchestrator/system-apps/recycle-bin.ts`, `server/orchestrator/system-apps/recycle-bin.test.ts`, `server/orchestrator/system-apps/terminal.ts`
- Storage: `server/storage/app-descriptors.ts`, `server/storage/host-fs.ts`, `server/storage/persisted-apps.ts`, `server/storage/recycle-bin.ts`, `server/storage/recycle-bin.test.ts`
- Terminal: `server/terminal/manager.ts`, `server/terminal/manager.test.ts`, `server/terminal/ws.ts`
- Vite bridge: `server/vite/window-module-plugin.ts`, `server/vite/window-module-plugin.test.ts`

### Verification Scripts

- `scripts/verify-cdp.mjs`
- `scripts/cdp/harness.mjs`
- `scripts/cdp/actions.mjs`
- `scripts/cdp/fixtures.mjs`
- `scripts/cdp/cases/index.mjs`
- `scripts/cdp/cases/branding-icons.mjs`
- `scripts/cdp/cases/context-menu.mjs`
- `scripts/cdp/cases/create-new-file.mjs`
- `scripts/cdp/cases/desktop-icons.mjs`
- `scripts/cdp/cases/desktop-shell.mjs`
- `scripts/cdp/cases/directory.mjs`
- `scripts/cdp/cases/editor.mjs`
- `scripts/cdp/cases/final-state.mjs`
- `scripts/cdp/cases/llm-update.mjs`
- `scripts/cdp/cases/media.mjs`
- `scripts/cdp/cases/open-file.mjs`
- `scripts/cdp/cases/persisted-app.mjs`
- `scripts/cdp/cases/preference.mjs`
- `scripts/cdp/cases/quick-create.mjs`
- `scripts/cdp/cases/recycle-bin.mjs`
- `scripts/cdp/cases/taskbar-clock.mjs`
- `scripts/cdp/cases/terminal.mjs`

## Refactor Opportunities

### Frontend

- `src/hooks/useWindowActions.ts`
  - Still the heaviest frontend hook.
  - Continue splitting by domain: file creation, window opening, persisted-app mutations, path heuristics.
- `src/App.tsx`
  - Split into shell/container layers such as desktop layer, window layer, dialog layer.
  - Reduce repeated `getAppDefinition(...).kind === 'system'` checks behind a small selector/helper.
- `src/components/RevisionDialog.tsx`
  - Separate data loading, prompt viewer/editor, and action button state into smaller hooks/components.
- Dialog-style components
  - `QuickCreate`, `PromptDialog`, `LlmOutputDialog`, `RevisionDialog` all repeat overlay-close / escape / focus patterns.
  - Extract shared modal interaction hooks or a common surface wrapper.
- `src/components/WindowRuntimeWithHostBridge.tsx`
  - Move bridge construction into a dedicated factory/helper to shrink the component and make host capabilities easier to test.
- `src/components/DesktopIcons.tsx`
  - Replace some repeated `apps.some(...)` scans with `Set`-based lookups.
  - If icon count grows, split drag session state from persisted position state to reduce rerenders.
- `src/state/app-state.ts`
  - Array-based window updates are still simple but not ideal for scaling.
  - Consider `byId + order` if window count grows or reducer logic keeps expanding.
- `src/types.ts`
  - Shared types file is becoming a catch-all; split by domain once the current refactor wave settles.

### Backend

- `server/orchestrator/service.ts`
  - Highest-priority backend refactor target.
  - Split prompt redaction/hydration, queueing, generation pipeline, fallback module source, and event publishing into smaller collaborators.
- `server/routes/*.ts`
  - Parameter parsing and error mapping are repetitive.
  - Introduce route helpers for required string/body fields, positive-int params, and common error-to-status mapping.
- `server/storage/host-fs.ts`
  - `listFiles()` eagerly reads every file body; this is the clearest performance issue in the current backend.
  - Add a metadata-only listing path, then migrate directory/app-descriptor scans to it.
- `server/orchestrator/system-apps/*.ts`
  - There is repeated path parsing and icon resolution logic across `directory.ts` and `recycle-bin.ts`.
  - Prefer shared source builders/helpers instead of copy-paste inside string modules.
- `server/orchestrator/system-modules.ts`
  - Move Preference source into `system-apps/preference.ts` so this file becomes a registry only.
- `server/terminal/ws.ts`
  - Message parsing and command dispatch can be split into smaller handlers.
  - Add focused tests; this area currently has less coverage than `manager.ts`.
- `server/vite/window-module-plugin.ts`
  - Split module-id helpers, HMR push helpers, and bridge class for clearer responsibilities.

### Verification / Tooling

- `scripts/cdp/cases/*.mjs`
  - Repeated selectors and interaction sequences should move into shared helpers.
- `vite.config.ts`
  - Fixed in this round: include `src/**/*.test.ts` in default Vitest scope so frontend pure unit tests actually run under `npm test`.

## Completed In This Round

- Extracted Create New heuristics and file-template builders out of `src/hooks/useWindowActions.ts` into `src/window-actions/create-new.ts`.
- Added focused unit tests for the extracted Create New helpers in `src/window-actions/create-new.test.ts`.
- Deduplicated LLM window open flow inside `src/hooks/useWindowActions.ts` through a shared `openGeneratedWindow(...)` path.
- Expanded default Vitest discovery in `vite.config.ts` so `src/**/*.test.ts` is no longer skipped.

## Not Yet Reviewed

- No remaining frontend/backend/code-script modules are currently marked unread.
- Non-code assets are not deeply reviewed yet: `public/**`, icon/image binaries, `package-lock.json`, `LICENSE`.

## Next Candidates

1. Continue shrinking `src/hooks/useWindowActions.ts` by extracting persisted-app and open-file flows.
2. Split `src/components/RevisionDialog.tsx` into a data hook plus presentation subcomponents.
3. Start backend refactor with `server/orchestrator/service.ts` helper extraction.
