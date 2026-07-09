const ASSISTANT_THREAD_KEY = 'cv-maker-assistant-thread-id';

export function createLocalAssistantThreadId(): string {
  return crypto.randomUUID();
}

export function getCurrentAssistantThreadId(): string {
  const stored = localStorage.getItem(ASSISTANT_THREAD_KEY);
  if (stored) {
    return stored;
  }

  const threadId = createLocalAssistantThreadId();
  setCurrentAssistantThreadId(threadId);
  return threadId;
}

export function setCurrentAssistantThreadId(threadId: string): void {
  localStorage.setItem(ASSISTANT_THREAD_KEY, threadId);
}


