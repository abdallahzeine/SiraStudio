import type { ThreadHistoryAdapter, ThreadMessage } from '@assistant-ui/react';
import { getAgentThread, type AgentThreadMessage } from './agent-threads';

function toAssistantMessage(message: AgentThreadMessage): ThreadMessage | null {
  if (message.role === 'system' || !message.content.trim()) {
    return null;
  }

  const base = {
    id: message.id,
    createdAt: new Date(message.created_at),
    metadata: { custom: { jobId: message.job_id, runId: message.run_id } },
  };

  if (message.role === 'user') {
    return {
      ...base,
      role: 'user',
      content: [{ type: 'text', text: message.content }],
      attachments: [],
    };
  }

  return {
    ...base,
    role: 'assistant',
    content: [{ type: 'text', text: message.content }],
    status: message.status === 'failed'
      ? { type: 'incomplete', reason: 'error', error: message.error ?? message.content }
      : { type: 'complete', reason: 'stop' },
    metadata: {
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
      custom: { jobId: message.job_id, runId: message.run_id },
    },
  };
}

export function createAssistantHistoryAdapter(threadId: string): ThreadHistoryAdapter {
  return {
    async load() {
      let detail;
      try {
        detail = await getAgentThread(threadId);
      } catch {
        return { headId: null, messages: [] };
      }
      const messages = detail.messages
        .map(toAssistantMessage)
        .filter((message): message is ThreadMessage => message !== null)
        .map((message, index, array) => ({
          message,
          parentId: index === 0 ? null : (array[index - 1]?.id ?? null),
        }));

      return {
        headId: messages.at(-1)?.message.id ?? null,
        messages,
      };
    },
    async append() {
      // Backend jobs persist durable user/assistant messages; persisting optimistic local messages here would duplicate history.
    },
  };
}
