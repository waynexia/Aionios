import contextMenu from './context-menu.mjs';
import desktopIcons from './desktop-icons.mjs';
import desktopShell from './desktop-shell.mjs';
import directory from './directory.mjs';
import editor from './editor.mjs';
import finalState from './final-state.mjs';
import media from './media.mjs';
import preference from './preference.mjs';
import taskbarClock from './taskbar-clock.mjs';
import terminal from './terminal.mjs';

export const cases = [
  desktopShell,
  taskbarClock,
  contextMenu,
  desktopIcons,
  terminal,
  preference,
  directory,
  media,
  editor,
  finalState
];

