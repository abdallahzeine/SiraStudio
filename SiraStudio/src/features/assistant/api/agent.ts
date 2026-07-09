import type { CVData } from '../../../shared/types';
import { isValidCVData } from '../../saves/utils/snapshots';

export interface AgentEditResult {
  cv: CVData;
  reply: string;
}

interface AgentJobCreateResponse {
  job_id: string;
}

export interface AgentJobStatusResponse {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | string;
  reply?: string | null;
  cv?: unknown;
  run_id?: string | null;
  revision_mismatch?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  thread_id?: string | null;
  message_preview?: string | null;
  error_code?: string | null;
  error?: string | null;
}

export interface AgentToolEvent {
  id: string;
  job_id: string;
  type: 'tool';
  created_at: string;
  data: {
    id: string;
    name: string;
    status: 'running' | 'completed' | 'failed';
    args?: Record<string, unknown>;
    summary?: string;
  };
}

export type AgentEditEvent =
  | { type: 'job'; job: AgentJobStatusResponse }
  | { type: 'tool'; tool: AgentToolEvent }
  | { type: 'done'; job: AgentJobStatusResponse; result: AgentEditResult };

function isToolEvent(event: AgentJobStatusResponse | AgentToolEvent): event is AgentToolEvent {
  return 'type' in event && event.type === 'tool';
}

interface EditCVOptions {
  revision?: number;
  signal?: AbortSignal;
  onJobStatus?: (job: AgentJobStatusResponse) => void;
}

const JOB_TIMEOUT_MS = 120_000;

async function readErrorResponse(res: Response): Promise<string> {
  const text = await res.text();
  return text.trim() || res.statusText;
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);

  if (!res.ok) {
    const text = await readErrorResponse(res);
    throw new Error(`Agent API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

async function createEditJob(cv: CVData, message: string, threadId: string, options: EditCVOptions = {}): Promise<string> {
  const data = await fetchJson<AgentJobCreateResponse>('/api/agent/edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: options.signal,
    body: JSON.stringify({ cv, message, thread_id: threadId, revision: options.revision }),
  });

  if (!data.job_id) {
    throw new Error('Agent API did not return a job id.');
  }

  return data.job_id;
}

function createEventQueue<T>() {
  const values: T[] = [];
  const waiters: Array<(value: IteratorResult<T>) => void> = [];
  const failures: Array<(reason?: unknown) => void> = [];
  let done = false;
  let error: unknown;

  return {
    push(value: T) {
      const waiter = waiters.shift();
      if (waiter) {
        waiter({ value, done: false });
        return;
      }
      values.push(value);
    },
    end() {
      done = true;
      for (const waiter of waiters.splice(0)) {
        waiter({ value: undefined, done: true });
      }
    },
    fail(reason: unknown) {
      done = true;
      error = reason;
      for (const failure of failures.splice(0)) {
        failure(reason);
      }
    },
    next(): Promise<IteratorResult<T>> {
      const value = values.shift();
      if (value) {
        return Promise.resolve({ value, done: false });
      }
      if (done) {
        if (error) {
          return Promise.reject(error);
        }
        return Promise.resolve({ value: undefined, done: true });
      }
      return new Promise((resolve, reject) => {
        waiters.push(resolve);
        failures.push(reject);
      });
    },
  };
}

async function* streamJob(jobId: string, options: EditCVOptions = {}): AsyncGenerator<AgentJobStatusResponse | AgentToolEvent> {
  const queue = createEventQueue<AgentJobStatusResponse | AgentToolEvent>();
  if (options.signal?.aborted) {
    throw options.signal.reason ?? new DOMException('Aborted', 'AbortError');
  }

  const source = new EventSource(`/api/agent/jobs/${encodeURIComponent(jobId)}/events`);
  let settled = false;

  const finish = (callback: () => void) => {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timer);
    source.close();
    callback();
  };

  const handleJob = (event: MessageEvent<string>) => {
    const job = JSON.parse(event.data) as AgentJobStatusResponse;
    options.onJobStatus?.(job);
    queue.push(job);
  };

  const handleTool = (event: MessageEvent<string>) => {
    queue.push(JSON.parse(event.data) as AgentToolEvent);
  };

  const handleCompleted = (event: MessageEvent<string>) => {
    const job = JSON.parse(event.data) as AgentJobStatusResponse;
    options.onJobStatus?.(job);
    queue.push(job);
    finish(queue.end);
  };

  const handleFailed = (event: MessageEvent<string>) => {
    const job = JSON.parse(event.data) as AgentJobStatusResponse;
    options.onJobStatus?.(job);
    queue.push(job);
    finish(() => queue.fail(new Error(job.error || 'Agent job failed.')));
  };

  const timer = setTimeout(() => {
    finish(() => queue.fail(new Error('Agent job timed out.')));
  }, JOB_TIMEOUT_MS);

  options.signal?.addEventListener('abort', () => {
    finish(() => queue.fail(options.signal?.reason ?? new DOMException('Aborted', 'AbortError')));
  }, { once: true });

  source.addEventListener('job', handleJob);
  source.addEventListener('tool', handleTool);
  source.addEventListener('completed', handleCompleted);
  source.addEventListener('failed', handleFailed);
  source.onerror = () => {
    finish(() => queue.fail(new Error('Agent job stream failed.')));
  };

  while (true) {
    const item = await queue.next();
    if (item.done) {
      return;
    }
    yield item.value;
  }
}

export async function* editCVEvents(cv: CVData, message: string, threadId: string, options: EditCVOptions = {}): AsyncGenerator<AgentEditEvent> {
  const jobId = await createEditJob(cv, message, threadId, options);
  let terminalJob: AgentJobStatusResponse | null = null;

  for await (const event of streamJob(jobId, options)) {
    if (isToolEvent(event)) {
      yield { type: 'tool', tool: event };
      continue;
    }

    yield { type: 'job', job: event };
    if (event.status === 'completed') {
      terminalJob = event;
    }
  }

  if (!terminalJob) {
    throw new Error('Agent job stream ended before completion.');
  }

  yield { type: 'done', job: terminalJob, result: completedJobToEditResponse(terminalJob) };
}

function completedJobToEditResponse(job: AgentJobStatusResponse): AgentEditResult {
  if (job.revision_mismatch) {
    throw new Error(job.reply || 'CV changed while the agent was editing. Refresh and try again.');
  }

  if (!isValidCVData(job.cv)) {
    throw new Error('Agent completed without returning valid CV data.');
  }

  return {
    cv: job.cv,
    reply: typeof job.reply === 'string' && job.reply.trim() ? job.reply : 'Done.',
  };
}

