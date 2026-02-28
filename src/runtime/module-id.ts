export function getWindowModuleId(sessionId: string, windowId: string) {
  return `/@window-app/${encodeURIComponent(sessionId)}/${encodeURIComponent(windowId)}/entry.tsx`;
}
