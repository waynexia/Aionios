import brandingIcons from './branding-icons.mjs';
import contextMenu from './context-menu.mjs';
import desktopIcons from './desktop-icons.mjs';
import desktopShell from './desktop-shell.mjs';
import directory from './directory.mjs';
import editor from './editor.mjs';
import finalState from './final-state.mjs';
import llmUpdate from './llm-update.mjs';
import media from './media.mjs';
import persistedApp from './persisted-app.mjs';
import preference from './preference.mjs';
import taskbarClock from './taskbar-clock.mjs';
import terminal from './terminal.mjs';

export const cases = [
  desktopShell,
  brandingIcons,
  taskbarClock,
  contextMenu,
  persistedApp,
  desktopIcons,
  llmUpdate,
  terminal,
  preference,
  directory,
  media,
  editor,
  finalState
];
