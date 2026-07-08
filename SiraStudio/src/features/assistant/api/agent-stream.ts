import type { ChatModelAdapter, ChatModelRunOptions, ChatModelRunResult } from '@assistant-ui/react';
import type { ThreadAssistantMessagePart } from '@assistant-ui/react';
import type { CVData } from '../../../shared/types';
import { editCVEvents, type AgentJobStatusResponse, type AgentToolEvent } from './agent';

interface EditCVAdapterOptions {
  getCV: () => CVData;
  getRevision: () => number;
  onCV: (cv: CVData) => void;
  getThreadId: () => string;
  onJobStatus?: (job: AgentJobStatusResponse) => void;
  onThreadUpdated?: (threadId: string) => void;
}

function getLastUserMessageText(messages: ChatModelRunOptions['messages']): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user') {
      return m.content
        .map((p) => (p.type === 'text' && typeof p.text === 'string' ? p.text : ''))
        .join('');
    }
  }
  return '';
}

function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    read_cv: 'Reading CV',
    update_header: 'Editing header',
    manage_sections: 'Editing sections',
    reorder_sections: 'Reordering sections',
    resolve_sections: 'Finding sections',
    resolve_items: 'Finding items',
    replace_cv_content: 'Replacing CV',
    add_item: 'Adding item',
    remove_item: 'Removing item',
    update_item: 'Updating item',
    set_item_bullets: 'Editing bullets',
    set_item_skill_groups: 'Editing skills',
  };
  return labels[name] ?? name.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function upsertToolPart(parts: ThreadAssistantMessagePart[], event: AgentToolEvent): ThreadAssistantMessagePart[] {
  const part: ThreadAssistantMessagePart = {
    type: 'tool-call',
    toolCallId: event.data.id,
    toolName: event.data.name,
    args: {},
    argsText: event.data.name,
    isError: event.data.status === 'failed',
  };
  const index = parts.findIndex((item) => item.type === 'tool-call' && item.toolCallId === event.data.id);
  if (index < 0) {
    return [part];
  }
  return parts.map((item, itemIndex) => itemIndex === index ? part : item);
}

export function createEditCVAdapter({ getCV, getRevision, onCV, getThreadId, onJobStatus, onThreadUpdated }: EditCVAdapterOptions): ChatModelAdapter {
  return {
    async *run(options: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult> {
      const cv = getCV();
      const message = getLastUserMessageText(options.messages);
      const threadId = getThreadId();
      const signal = options.abortSignal;

      let toolParts: ThreadAssistantMessagePart[] = [];
      let lastToolLabel = '';

      for await (const event of editCVEvents(cv, message, threadId, {
        revision: getRevision(),
        signal,
        onJobStatus: (job) => {
          onJobStatus?.(job);
          if (job.status === 'completed' || job.status === 'failed') {
            onThreadUpdated?.(job.thread_id ?? threadId);
          }
        },
      })) {
        if (event.type === 'tool') {
          if (event.tool.data.status !== 'running') {
            continue;
          }
          
          const nextLabel = toolLabel(event.tool.data.name);
          if (nextLabel !== lastToolLabel) {
            lastToolLabel = nextLabel;
          }
          const normalizedEvent: AgentToolEvent = {
            ...event.tool,
            data: {
              ...event.tool.data,
              name: lastToolLabel,
            },
          };
          toolParts = upsertToolPart(toolParts, normalizedEvent);
          yield { content: toolParts, status: { type: 'running' } };
        }

        if (event.type !== 'done') {
          continue;
        }

        onCV(event.result.cv);
        onThreadUpdated?.(threadId);

        const content: ThreadAssistantMessagePart[] = [
          { type: 'text', text: event.result.reply || 'Done.' },
        ];

        yield { content };

      }
    },
  };
}
