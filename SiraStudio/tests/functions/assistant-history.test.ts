import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAgentThread, type AgentThreadDetail } from '../../src/features/assistant/api/agent-threads';
import { createAssistantHistoryAdapter } from '../../src/features/assistant/api/assistant-history';

vi.mock('../../src/features/assistant/api/agent-threads', () => ({
  getAgentThread: vi.fn(),
}));

function threadWithMessage(message: AgentThreadDetail['messages'][number]): AgentThreadDetail {
  return {
    thread_id: 'thread-1',
    status: 'regular',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    messages: [message],
  };
}

function assistantMessage(overrides: Partial<AgentThreadDetail['messages'][number]> = {}) {
  return {
    id: 'message-1',
    thread_id: 'thread-1',
    role: 'assistant' as const,
    content: 'The edit failed.',
    status: 'failed' as const,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    error: 'The edit failed.',
    ...overrides,
  };
}

describe('assistant history flow', () => {
  beforeEach(() => {
    vi.mocked(getAgentThread).mockReset();
  });

  it('surfaces history API failures instead of replacing them with empty history', async () => {
    vi.mocked(getAgentThread).mockRejectedValue(new Error('History is unavailable.'));

    const history = await createAssistantHistoryAdapter('thread-1').load();

    expect(history.messages).toHaveLength(1);
    expect(history.messages[0]?.message.status).toMatchObject({
      type: 'incomplete',
      reason: 'error',
      error: 'History is unavailable.',
    });
  });

  it('uses the incomplete error UI without duplicating failed text as content', async () => {
    vi.mocked(getAgentThread).mockResolvedValue(threadWithMessage(assistantMessage()));

    const history = await createAssistantHistoryAdapter('thread-1').load();

    expect(history.messages[0]?.message.content).toEqual([]);
    expect(history.messages[0]?.message.status).toMatchObject({ type: 'incomplete', reason: 'error' });
  });

  it('loads cancelled assistant messages as cancelled rather than complete', async () => {
    vi.mocked(getAgentThread).mockResolvedValue(threadWithMessage(assistantMessage({
      content: 'Cancelled.',
      status: 'cancelled',
      error: null,
    })));

    const history = await createAssistantHistoryAdapter('thread-1').load();

    expect(history.messages[0]?.message.status).toMatchObject({ type: 'incomplete', reason: 'cancelled' });
  });
});
