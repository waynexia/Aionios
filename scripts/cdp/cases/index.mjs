import brandingIcons from './branding-icons.mjs';
import contextMenu from './context-menu.mjs';
import createNewFile from './create-new-file.mjs';
import quickCreate from './quick-create.mjs';
import desktopIcons from './desktop-icons.mjs';
import desktopShell from './desktop-shell.mjs';
import directory from './directory.mjs';
import openFile from './open-file.mjs';
import pwaShell from './pwa-shell.mjs';
import editor from './editor.mjs';
import finalState from './final-state.mjs';
import llmUpdate from './llm-update.mjs';
import media from './media.mjs';
import mobileShell from './mobile-shell.mjs';
import persistedApp from './persisted-app.mjs';
import preference from './preference.mjs';
import recycleBin from './recycle-bin.mjs';
import taskbarClock from './taskbar-clock.mjs';
import terminal from './terminal.mjs';

export const cases = [
  desktopShell,
  brandingIcons,
  taskbarClock,
  quickCreate,
  pwaShell,
  contextMenu,
  persistedApp,
  createNewFile,
  desktopIcons,
  llmUpdate,
  terminal,
  preference,
  directory,
  openFile,
  recycleBin,
  media,
  mobileShell,
  editor,
  finalState
];
