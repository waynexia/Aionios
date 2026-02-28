import type { AppDefinition } from './types';

export const APP_CATALOG: AppDefinition[] = [
  {
    appId: 'notes',
    title: 'LLM Notes',
    icon: '📝',
    hint: 'Generate a note-taking window'
  },
  {
    appId: 'browser',
    title: 'LLM Browser',
    icon: '🌐',
    hint: 'Generate a browser-like window'
  },
  {
    appId: 'files',
    title: 'LLM Files',
    icon: '🗂️',
    hint: 'Generate a file explorer window'
  }
];

export function getAppDefinition(appId: string) {
  return APP_CATALOG.find((item) => item.appId === appId);
}
