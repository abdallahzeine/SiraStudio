import type { AgentThreadSummary } from '../api/agent-threads';

export function formatThreadDate(value?: string | null): string {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
}

export function displayThreadTitle(thread: AgentThreadSummary | undefined, fallbackId: string): string {
  return thread?.title?.trim() || thread?.message_preview?.trim() || `Chat ${fallbackId.slice(0, 6)}`;
}
