import type { AppDefinition } from './types';

export const APP_CATALOG: AppDefinition[] = [
  {
    appId: 'terminal',
    title: 'Terminal',
    icon: '🖥️',
    hint: 'Host shell terminal',
    kind: 'system'
  },
  {
    appId: 'preference',
    title: 'Preference',
    icon: '⚙️',
    hint: 'Server runtime configuration',
    kind: 'system'
  },
  {
    appId: 'notes',
    title: 'LLM Notes',
    icon: '📝',
    hint: 'Generate a note-taking window',
    kind: 'llm'
  },
  {
    appId: 'browser',
    title: 'LLM Browser',
    icon: '🌐',
    hint: 'Generate a browser-like window',
    kind: 'llm'
  },
  {
    appId: 'files',
    title: 'LLM Files',
    icon: '🗂️',
    hint: 'Generate a file explorer window',
    kind: 'llm'
  }
];

export function getAppDefinition(appId: string) {
  return APP_CATALOG.find((item) => item.appId === appId);
}
