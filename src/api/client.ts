import type { ServerWindowSnapshot } from '../types';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json'
    },
    ...init
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function createSession() {
  return requestJson<{ sessionId: string }>('/api/sessions', {
    method: 'POST'
  });
}

export async function openWindow(input: {
  sessionId: string;
  windowId: string;
  appId: string;
  title: string;
}) {
  return requestJson<ServerWindowSnapshot>(`/api/sessions/${input.sessionId}/windows/open`, {
    method: 'POST',
    body: JSON.stringify({
      windowId: input.windowId,
      appId: input.appId,
      title: input.title
    })
  });
}

export async function requestWindowUpdate(input: {
  sessionId: string;
  windowId: string;
  instruction: string;
}) {
  return requestJson<ServerWindowSnapshot>(
    `/api/sessions/${input.sessionId}/windows/${input.windowId}/actions`,
    {
      method: 'POST',
      body: JSON.stringify({
        instruction: input.instruction
      })
    }
  );
}

export async function rollbackWindow(input: {
  sessionId: string;
  windowId: string;
  revision: number;
}) {
  return requestJson<ServerWindowSnapshot>(
    `/api/sessions/${input.sessionId}/windows/${input.windowId}/rollback`,
    {
      method: 'POST',
      body: JSON.stringify({
        revision: input.revision
      })
    }
  );
}
