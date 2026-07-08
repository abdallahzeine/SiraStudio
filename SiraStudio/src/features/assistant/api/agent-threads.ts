export interface AgentThreadSummary {
  thread_id: string;
  title?: string | null;
  status: 'regular' | 'archived' | 'deleted';
  created_at: string;
  updated_at: string;
  last_message_at?: string | null;
  last_job_id?: string | null;
  message_preview?: string | null;
}

export interface AgentThreadMessage {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
  job_id?: string | null;
  run_id?: string | null;
  error?: string | null;
}

export interface AgentThreadDetail extends AgentThreadSummary {
  messages: AgentThreadMessage[];
}

interface AgentThreadListResponse {
  threads: AgentThreadSummary[];
}

interface ListAgentThreadsOptions {
  limit?: number;
  status?: 'regular' | 'archived' | 'deleted';
}

async function readErrorResponse(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.trim() || res.statusText;
  } catch {
    return res.statusText;
  }
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);

  if (!res.ok) {
    const text = await readErrorResponse(res);
    throw new Error(`Agent thread API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

export async function listAgentThreads(options: ListAgentThreadsOptions = {}): Promise<AgentThreadSummary[]> {
  const params = new URLSearchParams();
  params.set('limit', String(options.limit ?? 50));
  params.set('status', options.status ?? 'regular');
  const data = await fetchJson<AgentThreadListResponse>(`/api/agent/threads?${params.toString()}`);
  return data.threads;
}

export function createAgentThread(title?: string): Promise<AgentThreadSummary> {
  return fetchJson<AgentThreadSummary>('/api/agent/threads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
}

export function getAgentThread(threadId: string): Promise<AgentThreadDetail> {
  return fetchJson<AgentThreadDetail>(`/api/agent/threads/${encodeURIComponent(threadId)}`);
}

export function renameAgentThread(threadId: string, title: string): Promise<AgentThreadSummary> {
  return fetchJson<AgentThreadSummary>(`/api/agent/threads/${encodeURIComponent(threadId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
}

export function archiveAgentThread(threadId: string): Promise<AgentThreadSummary> {
  return fetchJson<AgentThreadSummary>(`/api/agent/threads/${encodeURIComponent(threadId)}/archive`, {
    method: 'POST',
  });
}

export function deleteAgentThread(threadId: string): Promise<AgentThreadSummary> {
  return fetchJson<AgentThreadSummary>(`/api/agent/threads/${encodeURIComponent(threadId)}`, {
    method: 'DELETE',
  });
}
