import type {
  PreferenceConfig,
  PreferenceConfigUpdate,
  ServerWindowSnapshot,
  WindowRevisionDetail,
  WindowRevisionPromptDetail,
  WindowRevisionSummary
} from '../types';

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

export async function getPreferenceConfig() {
  return requestJson<PreferenceConfig>('/api/config');
}

export async function updatePreferenceConfig(input: PreferenceConfigUpdate) {
  return requestJson<PreferenceConfig>('/api/config', {
    method: 'PUT',
    body: JSON.stringify(input)
  });
}

export async function openWindow(input: {
  sessionId: string;
  windowId: string;
  appId: string;
  title: string;
  instruction?: string;
}) {
  return requestJson<ServerWindowSnapshot>(`/api/sessions/${input.sessionId}/windows/open`, {
    method: 'POST',
    body: JSON.stringify({
      windowId: input.windowId,
      appId: input.appId,
      title: input.title,
      instruction: input.instruction
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

export async function requestWindowPromptUpdate(input: {
  sessionId: string;
  windowId: string;
  prompt: string;
}) {
  return requestJson<ServerWindowSnapshot>(
    `/api/sessions/${input.sessionId}/windows/${input.windowId}/actions/prompt`,
    {
      method: 'POST',
      body: JSON.stringify({
        prompt: input.prompt
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

export async function listWindowRevisions(input: { sessionId: string; windowId: string }) {
  return requestJson<{ revisions: WindowRevisionSummary[] }>(
    `/api/sessions/${input.sessionId}/windows/${input.windowId}/revisions`
  );
}

export async function getWindowRevision(input: {
  sessionId: string;
  windowId: string;
  revision: number;
}) {
  return requestJson<WindowRevisionDetail>(
    `/api/sessions/${input.sessionId}/windows/${input.windowId}/revisions/${String(input.revision)}`
  );
}

export async function getWindowRevisionPrompt(input: {
  sessionId: string;
  windowId: string;
  revision: number;
}) {
  return requestJson<WindowRevisionPromptDetail>(
    `/api/sessions/${input.sessionId}/windows/${input.windowId}/revisions/${String(input.revision)}/prompt`
  );
}

export async function branchWindowRevision(input: {
  sessionId: string;
  windowId: string;
  revision: number;
  newWindowId: string;
  title?: string;
}) {
  return requestJson<ServerWindowSnapshot>(
    `/api/sessions/${input.sessionId}/windows/${input.windowId}/revisions/${String(input.revision)}/branch`,
    {
      method: 'POST',
      body: JSON.stringify({
        newWindowId: input.newWindowId,
        title: input.title
      })
    }
  );
}

export async function regenerateWindowRevision(input: {
  sessionId: string;
  windowId: string;
  revision: number;
}) {
  return requestJson<ServerWindowSnapshot>(
    `/api/sessions/${input.sessionId}/windows/${input.windowId}/revisions/${String(input.revision)}/regenerate`,
    { method: 'POST' }
  );
}

export async function closeWindow(input: { sessionId: string; windowId: string }) {
  const response = await fetch(`/api/sessions/${input.sessionId}/windows/${input.windowId}`, {
    method: 'DELETE'
  });
  if (!response.ok && response.status !== 404) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }
}

export async function startTerminal(input: { sessionId: string; windowId: string }) {
  return requestJson<{ shell: string; cwd: string; status: 'running' }>(
    `/api/sessions/${input.sessionId}/windows/${input.windowId}/terminal/start`,
    {
      method: 'POST'
    }
  );
}

export async function sendTerminalInput(input: {
  sessionId: string;
  windowId: string;
  payload: string;
}) {
  return requestJson<{ ok: true }>(
    `/api/sessions/${input.sessionId}/windows/${input.windowId}/terminal/input`,
    {
      method: 'POST',
      body: JSON.stringify({
        input: input.payload
      })
    }
  );
}

export async function stopTerminal(input: { sessionId: string; windowId: string }) {
  return requestJson<{ closed: boolean }>(
    `/api/sessions/${input.sessionId}/windows/${input.windowId}/terminal/stop`,
    {
      method: 'POST'
    }
  );
}
