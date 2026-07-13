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
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  reply?: string | null;
  cv?: unknown;
  run_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  thread_id?: string | null;
  message_preview?: string | null;
  error_code?: string | null;
  error?: string | null;
}

export interface AgentToolEvent {
  id: number;
  job_id: string;
  type: 'tool';
  created_at: string;
  data: {
    id: string;
    name: string;
    status: 'running' | 'completed' | 'failed';
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
  signal?: AbortSignal;
  onJobStatus?: (job: AgentJobStatusResponse) => void;
}

const SERVER_CANCELLED_MESSAGE = 'The assistant job was cancelled. Please try again.';

export class AgentAPIError extends Error {
  readonly status: number | null;
  readonly code?: string;

  constructor(
    status: number | null,
    message: string,
    code?: string,
  ) {
    super(message);
    this.name = 'AgentAPIError';
    this.status = status;
    this.code = code;
  }
}

function abortError(signal?: AbortSignal): DOMException {
  return signal?.reason instanceof DOMException
    ? signal.reason
    : new DOMException('The assistant request was cancelled.', 'AbortError');
}

function serverCancelledError(job: AgentJobStatusResponse): Error {
  const message = typeof job.error === 'string' && job.error.trim()
    ? job.error
    : SERVER_CANCELLED_MESSAGE;
  return new AgentAPIError(null, message, job.error_code ?? 'CANCELLED');
}

async function readErrorResponse(res: Response): Promise<{ message: string; code?: string }> {
  const text = await res.text();
  if (!text.trim()) {
    return { message: res.statusText || 'Request failed.' };
  }
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    const message = [body.message, body.error, body.detail].find((value): value is string => typeof value === 'string' && value.trim().length > 0);
    const code = [body.error_code, body.code].find((value): value is string => typeof value === 'string' && value.trim().length > 0);
    return { message: message ?? res.statusText ?? 'Request failed.', code };
  } catch {
    return { message: res.statusText || 'Request failed.' };
  }
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);

  if (!res.ok) {
    const error = await readErrorResponse(res);
    throw new AgentAPIError(res.status, error.message, error.code);
  }

  return res.json() as Promise<T>;
}

async function createEditJob(cv: CVData, message: string, threadId: string, options: EditCVOptions = {}): Promise<string> {
  const createPromise = fetchJson<AgentJobCreateResponse>('/api/agent/edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cv, message, thread_id: threadId }),
  }).then((data) => {
    if (!data.job_id) {
      throw new Error('Agent API did not return a job id.');
    }
    return data.job_id;
  });

  const signal = options.signal;
  if (!signal) {
    return createPromise;
  }

  return new Promise<string>((resolve, reject) => {
    let settled = false;

    const settleReject = (reason: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      reject(reason);
    };

    const settleResolve = (jobId: string) => {
      if (settled) {
        void cancelAgentJob(jobId).catch(() => undefined);
        return;
      }
      settled = true;
      signal.removeEventListener('abort', onAbort);
      resolve(jobId);
    };

    const onAbort = () => {
      settleReject(abortError(signal));
    };

    createPromise.then(settleResolve, settleReject);

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function getJobStatus(jobId: string, signal?: AbortSignal): Promise<AgentJobStatusResponse> {
  return fetchJson<AgentJobStatusResponse>(`/api/agent/jobs/${encodeURIComponent(jobId)}`, { signal });
}

export function cancelAgentJob(jobId: string): Promise<AgentJobStatusResponse> {
  return fetchJson<AgentJobStatusResponse>(`/api/agent/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
}

function createEventQueue<T>() {
  const values: T[] = [];
  const waiters: Array<{ resolve: (value: IteratorResult<T>) => void; reject: (reason?: unknown) => void }> = [];
  let done = false;
  let error: unknown;

  return {
    push(value: T) {
      const waiter = waiters.shift();
      if (waiter) {
        waiter.resolve({ value, done: false });
        return;
      }
      values.push(value);
    },
    end() {
      done = true;
      for (const waiter of waiters.splice(0)) {
        waiter.resolve({ value: undefined, done: true });
      }
    },
    fail(reason: unknown) {
      done = true;
      error = reason;
      for (const waiter of waiters.splice(0)) {
        waiter.reject(reason);
      }
    },
    next(): Promise<IteratorResult<T>> {
      if (values.length > 0) {
        const value = values.shift()!;
        return Promise.resolve({ value, done: false });
      }
      if (done) {
        if (error) {
          return Promise.reject(error);
        }
        return Promise.resolve({ value: undefined, done: true });
      }
      return new Promise((resolve, reject) => {
        waiters.push({ resolve, reject });
      });
    },
  };
}

async function* streamJob(jobId: string, options: EditCVOptions = {}): AsyncGenerator<AgentJobStatusResponse | AgentToolEvent> {
  const queue = createEventQueue<AgentJobStatusResponse | AgentToolEvent>();
  if (options.signal?.aborted) {
    throw abortError(options.signal);
  }

  const source = new EventSource(`/api/agent/jobs/${encodeURIComponent(jobId)}/events`);
  let settled = false;
  let checkingStatus = false;
  let cancelRequested = false;

  const finish = (callback: () => void) => {
    if (settled) {
      return;
    }
    settled = true;
    source.close();
    callback();
  };

  const parseEvent = <T>(event: MessageEvent<string>): T | null => {
    try {
      return JSON.parse(event.data) as T;
    } catch {
      finish(() => queue.fail(new AgentAPIError(null, 'The assistant sent an invalid event. Please retry.')));
      return null;
    }
  };

  const handleJob = (event: MessageEvent<string>) => {
    if (settled) {
      return;
    }
    const job = parseEvent<AgentJobStatusResponse>(event);
    if (!job) return;
    options.onJobStatus?.(job);
    queue.push(job);
  };

  const handleTool = (event: MessageEvent<string>) => {
    if (settled) {
      return;
    }
    const tool = parseEvent<AgentToolEvent>(event);
    if (tool) queue.push(tool);
  };

  const handleCompleted = (event: MessageEvent<string>) => {
    if (settled) {
      return;
    }
    const job = parseEvent<AgentJobStatusResponse>(event);
    if (!job) return;
    options.onJobStatus?.(job);
    queue.push(job);
    finish(queue.end);
  };

  const handleFailed = (event: MessageEvent<string>) => {
    if (settled) {
      return;
    }
    const job = parseEvent<AgentJobStatusResponse>(event);
    if (!job) return;
    options.onJobStatus?.(job);
    queue.push(job);
    finish(() => queue.fail(new AgentAPIError(null, job.error || 'Agent job failed.', job.error_code ?? undefined)));
  };

  const handleCancelled = (event: MessageEvent<string>) => {
    if (settled) return;
    const job = parseEvent<AgentJobStatusResponse>(event);
    if (!job) return;
    options.onJobStatus?.(job);
    queue.push(job);
    if (options.signal?.aborted) {
      finish(() => queue.fail(abortError(options.signal)));
      return;
    }
    finish(() => queue.fail(serverCancelledError(job)));
  };

  const checkJobStatus = async () => {
    if (settled || checkingStatus) {
      return;
    }
    checkingStatus = true;
    try {
      const job = await getJobStatus(jobId, options.signal);
      if (job.status === 'completed') {
        handleCompleted({ data: JSON.stringify(job) } as MessageEvent<string>);
      } else if (job.status === 'failed') {
        handleFailed({ data: JSON.stringify(job) } as MessageEvent<string>);
      } else if (job.status === 'cancelled') {
        handleCancelled({ data: JSON.stringify(job) } as MessageEvent<string>);
      } else {
        options.onJobStatus?.(job);
      }
    } catch {
      // EventSource remains open and will retry with its Last-Event-ID cursor.
    } finally {
      checkingStatus = false;
    }
  };

  const handleAbort = () => {
    if (!cancelRequested) {
      cancelRequested = true;
      void cancelAgentJob(jobId).catch(() => undefined);
    }
    finish(() => queue.fail(abortError(options.signal)));
  };
  options.signal?.addEventListener('abort', handleAbort, { once: true });

  source.addEventListener('job', handleJob);
  source.addEventListener('tool', handleTool);
  source.addEventListener('completed', handleCompleted);
  source.addEventListener('failed', handleFailed);
  source.addEventListener('cancelled', handleCancelled);
  source.onerror = () => {
    void checkJobStatus();
  };

  try {
    while (true) {
      const item = await queue.next();
      if (item.done) {
        return;
      }
      yield item.value;
    }
  } finally {
    source.close();
    options.signal?.removeEventListener('abort', handleAbort);
    source.removeEventListener('job', handleJob);
    source.removeEventListener('tool', handleTool);
    source.removeEventListener('completed', handleCompleted);
    source.removeEventListener('failed', handleFailed);
    source.removeEventListener('cancelled', handleCancelled);
  }
}

export async function* editCVEvents(cv: CVData, message: string, threadId: string, options: EditCVOptions = {}): AsyncGenerator<AgentEditEvent> {
  const jobId = await createEditJob(cv, message, threadId, options);
  if (options.signal?.aborted) {
    await cancelAgentJob(jobId).catch(() => undefined);
    throw abortError(options.signal);
  }
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
  if (!isValidCVData(job.cv)) {
    throw new Error('Agent completed without returning valid CV data.');
  }

  return {
    cv: job.cv,
    reply: typeof job.reply === 'string' && job.reply.trim() ? job.reply : 'Done.',
  };
}
