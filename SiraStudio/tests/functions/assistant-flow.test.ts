import type { ChatModelRunOptions, ChatModelRunResult } from '@assistant-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialCVData } from '../../src/features/cv-editor/data/initialCVData';
import { createEditCVAdapter } from '../../src/features/assistant/api/agent-stream';
import { editCVEvents } from '../../src/features/assistant/api/agent';

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();
  onerror: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const callback = listener as (event: MessageEvent<string>) => void;
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), callback]);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const callback = listener as (event: MessageEvent<string>) => void;
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== callback));
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: unknown) {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type, { data: text }));
    }
  }
}

const runOptions = {
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Improve it' }] }],
  abortSignal: undefined,
} as unknown as ChatModelRunOptions;

function completedJob(cv: unknown = initialCVData) {
  return {
    job_id: 'job-1',
    status: 'completed' as const,
    thread_id: 'thread-1',
    reply: 'Updated.',
    cv,
  };
}

function mockAgentFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url === '/api/agent/edit') {
      return Response.json({ job_id: 'job-1' });
    }
    if (url.endsWith('/cancel')) {
      return Response.json({ job_id: 'job-1', status: 'cancelled' });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

async function startAdapterRun(options: {
  cv?: typeof initialCVData;
  onCV?: (cv: typeof initialCVData) => boolean;
  onThreadUpdated?: (threadId: string) => void;
  signal?: AbortSignal;
} = {}) {
  const sourceCount = FakeEventSource.instances.length;
  const onCV = options.onCV ?? vi.fn(() => true);
  const adapter = createEditCVAdapter({
    getCV: () => options.cv ?? initialCVData,
    getRevision: () => 0,
    onCV,
    getThreadId: () => 'thread-1',
    onThreadUpdated: options.onThreadUpdated,
  });
  const generator = adapter.run({ ...runOptions, abortSignal: options.signal });
  const first = generator.next();
  await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(sourceCount + 1));
  return { generator, first, source: FakeEventSource.instances[sourceCount]!, onCV };
}

describe('assistant edit user flow', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    mockAgentFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not apply an unchanged CV and refreshes the terminal thread once', async () => {
    const onCV = vi.fn(() => true);
    const onThreadUpdated = vi.fn();
    const { generator, first, source } = await startAdapterRun({ onCV, onThreadUpdated });

    source.emit('completed', completedJob());
    await first;
    await generator.next();

    expect(onCV).not.toHaveBeenCalled();
    expect(onThreadUpdated).toHaveBeenCalledTimes(1);
  });

  it('treats reordered keys and omitted undefined optionals as a no-op CV', async () => {
    const onCV = vi.fn(() => true);
    const { first, source } = await startAdapterRun({ onCV });
    const backendShaped = {
      template: initialCVData.template,
      sections: initialCVData.sections,
      header: {
        socialLinks: initialCVData.header.socialLinks,
        email: initialCVData.header.email,
        phone: initialCVData.header.phone,
        location: initialCVData.header.location,
        name: initialCVData.header.name,
      },
    };

    source.emit('completed', completedJob(backendShaped));
    await first;

    expect(onCV).not.toHaveBeenCalled();
  });

  it('applies a changed CV exactly once and requires apply success', async () => {
    const changedCV = { ...initialCVData, header: { ...initialCVData.header, name: 'Changed by AI' } };
    const onCV = vi.fn(() => true);
    const { generator, first, source } = await startAdapterRun({ onCV });

    source.emit('completed', completedJob(changedCV));
    await first;
    await generator.next();

    expect(onCV).toHaveBeenCalledOnce();
    expect(onCV).toHaveBeenCalledWith(changedCV);

    const failedApply = await startAdapterRun({ onCV: () => false });
    failedApply.source.emit('completed', completedJob(changedCV));
    await expect(failedApply.first).rejects.toThrow(/could not apply/i);
  });

  it('cancels a job when aborted after its id is created', async () => {
    let releaseJob!: (response: Response) => void;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (String(input) === '/api/agent/edit') {
        return new Promise<Response>((resolve) => { releaseJob = resolve; });
      }
      return Promise.resolve(Response.json({ job_id: 'job-1', status: 'cancelled' }));
    });
    const controller = new AbortController();
    const events = editCVEvents(initialCVData, 'Improve it', 'thread-1', { signal: controller.signal });
    const pending = events.next();

    await vi.waitFor(() => expect(releaseJob).toBeTypeOf('function'));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });

    releaseJob(Response.json({ job_id: 'job-1' }));
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/agent/jobs/job-1/cancel',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(fetchMock.mock.calls.find((call) => String(call[0]) === '/api/agent/edit')?.[1]).not.toHaveProperty('signal');
  });

  it('rejects abort promptly while create is delayed and still cancels the late job id', async () => {
    let releaseJob!: (response: Response) => void;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (String(input) === '/api/agent/edit') {
        return new Promise<Response>((resolve) => { releaseJob = resolve; });
      }
      return Promise.resolve(Response.json({ job_id: 'job-late', status: 'cancelled' }));
    });
    const controller = new AbortController();
    const events = editCVEvents(initialCVData, 'Improve it', 'thread-1', { signal: controller.signal });
    const pending = events.next();

    await vi.waitFor(() => expect(releaseJob).toBeTypeOf('function'));
    controller.abort();

    await expect(Promise.race([
      pending,
      new Promise((_, reject) => setTimeout(() => reject(new Error('abort hung on create')), 50)),
    ])).rejects.toMatchObject({ name: 'AbortError' });

    releaseJob(Response.json({ job_id: 'job-late' }));
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/agent/jobs/job-late/cancel',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('surfaces a descriptive error for server-side cancelled jobs', async () => {
    const events = editCVEvents(initialCVData, 'Improve it', 'thread-1');
    const consume = (async () => {
      for await (const event of events) {
        void event;
      }
    })();
    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    FakeEventSource.instances[0]!.emit('cancelled', {
      job_id: 'job-1',
      status: 'cancelled',
      error: 'This job was cancelled on the server.',
    });

    await expect(consume).rejects.toThrow(/cancelled/i);
    await expect(consume).rejects.not.toMatchObject({ name: 'AbortError' });
  });

  it('updates one tool part from running to a useful completed result and keeps it with the reply', async () => {
    const changedCV = { ...initialCVData, header: { ...initialCVData.header, name: 'Changed by AI' } };
    const { generator, first, source } = await startAdapterRun();
    const baseTool = {
      id: 1,
      job_id: 'job-1',
      type: 'tool' as const,
      created_at: '2026-01-01T00:00:00Z',
      data: { id: 'tool-1', name: 'apply_cv_edits', status: 'running' as const },
    };

    source.emit('tool', baseTool);
    const running = (await first).value as ChatModelRunResult;
    const terminalPending = generator.next();
    source.emit('tool', {
      ...baseTool,
      data: {
        ...baseTool.data,
        status: 'completed',
        summary: JSON.stringify({ patches: [{ path: 'header.name', value: 'x' }] }),
      },
    });
    const terminal = (await terminalPending).value as ChatModelRunResult;
    const completedPending = generator.next();
    source.emit('completed', completedJob(changedCV));
    const done = (await completedPending).value as ChatModelRunResult;

    expect(running.content).toHaveLength(1);
    expect(terminal.content[0]).toMatchObject({
      type: 'tool-call',
      toolCallId: 'tool-1',
      toolName: 'Editing CV',
      argsText: 'Editing CV',
      result: 'Completed.',
      isError: false,
    });
    expect(done.content).toEqual([
      expect.objectContaining({ type: 'tool-call', toolCallId: 'tool-1', toolName: 'Editing CV', result: 'Completed.' }),
      expect.objectContaining({ type: 'text', text: 'Updated.' }),
    ]);
  });

  it('fails promptly when terminal SSE contains malformed JSON', async () => {
    const events = editCVEvents(initialCVData, 'Improve it', 'thread-1');
    const pending = events.next();
    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    FakeEventSource.instances[0]!.emit('completed', '{not-json');

    await expect(Promise.race([
      pending,
      new Promise((_, reject) => setTimeout(() => reject(new Error('stream hung')), 100)),
    ])).rejects.not.toThrow('stream hung');
  });
});
