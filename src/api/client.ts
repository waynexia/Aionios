import type {
  HostFileEntry,
  PersistedAppDescriptor,
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
    const rawMessage = await response.text();
    let parsedMessage: string | null = null;
    if (rawMessage) {
      try {
        const parsed = JSON.parse(rawMessage) as { message?: unknown };
        if (parsed && typeof parsed.message === 'string' && parsed.message.trim().length > 0) {
          parsedMessage = parsed.message.trim();
        }
      } catch {
        // ignore JSON parse errors
      }
    }
    throw new Error(parsedMessage || rawMessage || `Request failed with ${response.status}`);
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

export async function listHostFiles() {
  return requestJson<{ files: HostFileEntry[] }>('/api/fs/files');
}

export async function readHostFile(input: { path: string }) {
  return requestJson<{ content: string }>(`/api/fs/file?path=${encodeURIComponent(input.path)}`);
}

export async function writeHostFile(input: { path: string; content: string }) {
  return requestJson<{ ok: true }>('/api/fs/file', {
    method: 'PUT',
    body: JSON.stringify({
      path: input.path,
      content: input.content
    })
  });
}

export async function listPersistedApps(input?: { directory?: string }) {
  const query =
    typeof input?.directory === 'string'
      ? `?directory=${encodeURIComponent(input.directory)}`
      : '';
  return requestJson<{ apps: PersistedAppDescriptor[] }>(`/api/apps${query}`);
}

export async function createPersistedApp(input: {
  directory?: string;
  title: string;
  icon?: string;
}) {
  return requestJson<PersistedAppDescriptor>('/api/apps', {
    method: 'POST',
    body: JSON.stringify({
      directory: input.directory,
      title: input.title,
      icon: input.icon
    })
  });
}
