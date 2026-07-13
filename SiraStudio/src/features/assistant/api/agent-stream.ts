import type { ChatModelAdapter, ChatModelRunOptions, ChatModelRunResult } from '@assistant-ui/react';
import type { ThreadAssistantMessagePart } from '@assistant-ui/react';
import type { CVData } from '../../../shared/types';
import { editCVEvents, type AgentJobStatusResponse, type AgentToolEvent } from './agent';

interface EditCVAdapterOptions {
  getCV: () => CVData;
  getRevision: () => number;
  onCV: (cv: CVData) => boolean;
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
    apply_cv_edits: 'Editing CV',
    plan_changes: 'Planning changes',
    prepare_response: 'Preparing response',
    fix_review: 'Fixing missing changes',
    review_changes: 'Reviewing changes',
  };
  return labels[name] ?? name.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function toolStatusText(status: AgentToolEvent['data']['status']): string {
  return status === 'failed' ? 'This step could not be completed.' : 'Completed.';
}

export function jsonValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (left === null || right === null || typeof left !== typeof right) {
    return left === right;
  }

  if (Array.isArray(left)) {
    if (!Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((item, index) => jsonValuesEqual(item, right[index]));
  }

  if (typeof left === 'object') {
    if (typeof right !== 'object' || right === null || Array.isArray(right)) {
      return false;
    }

    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord).filter((key) => leftRecord[key] !== undefined);
    const rightKeys = Object.keys(rightRecord).filter((key) => rightRecord[key] !== undefined);

    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    const rightKeySet = new Set(rightKeys);
    return leftKeys.every((key) => rightKeySet.has(key) && jsonValuesEqual(leftRecord[key], rightRecord[key]));
  }

  return false;
}

function upsertToolPart(parts: ThreadAssistantMessagePart[], event: AgentToolEvent): ThreadAssistantMessagePart[] {
  const terminal = event.data.status !== 'running';
  const label = toolLabel(event.data.name);
  const part: ThreadAssistantMessagePart = {
    type: 'tool-call',
    toolCallId: event.data.id,
    toolName: label,
    args: {},
    argsText: label,
    result: terminal ? toolStatusText(event.data.status) : undefined,
    isError: event.data.status === 'failed',
  };
  const index = parts.findIndex((item) => item.type === 'tool-call' && item.toolCallId === event.data.id);
  if (index < 0) {
    return [...parts, part];
  }
  return parts.map((item, itemIndex) => itemIndex === index ? part : item);
}

export function createEditCVAdapter({ getCV, getRevision, onCV, getThreadId, onJobStatus, onThreadUpdated }: EditCVAdapterOptions): ChatModelAdapter {
  return {
    async *run(options: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult> {
      const cv = getCV();
      const revision = getRevision();
      const message = getLastUserMessageText(options.messages);
      const threadId = getThreadId();
      const signal = options.abortSignal;

      let toolParts: ThreadAssistantMessagePart[] = [];

      for await (const event of editCVEvents(cv, message, threadId, {
        signal,
        onJobStatus: (job) => {
          onJobStatus?.(job);
          if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
            onThreadUpdated?.(job.thread_id ?? threadId);
          }
        },
        })) {
        if (event.type === 'tool') {
          toolParts = upsertToolPart(toolParts, event.tool);
          yield { content: toolParts, status: { type: 'running' } };
          continue;
        }

        if (event.type !== 'done') {
          continue;
        }

        if (signal?.aborted) {
          throw signal.reason ?? new DOMException('The assistant request was cancelled.', 'AbortError');
        }
        if (!jsonValuesEqual(event.result.cv, cv)) {
          if (getRevision() !== revision) {
            throw new Error('Your CV changed while the assistant was working. Refresh the assistant and retry.');
          }
          if (!onCV(event.result.cv)) {
            throw new Error('The assistant finished, but the CV could not apply. Refresh and retry.');
          }
        }

        yield {
          content: [
            ...toolParts,
            { type: 'text', text: event.result.reply || 'Done.' },
          ],
        };
      }
    },
  };
}
