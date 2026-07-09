import { useCallback, useEffect, useState } from "react";
import {
  archiveAgentThread,
  createAgentThread,
  deleteAgentThread,
  listAgentThreads,
  renameAgentThread,
  type AgentThreadSummary,
} from "../api/agent-threads";
import {
  createLocalAssistantThreadId,
  getCurrentAssistantThreadId,
  setCurrentAssistantThreadId,
} from "../utils/assistantThread";
import { displayThreadTitle } from "../utils/assistantThreadDisplay";

export function useAssistantThreads() {
  const [threadId, setThreadId] = useState(() => getCurrentAssistantThreadId());
  const [threads, setThreads] = useState<AgentThreadSummary[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const selectThread = useCallback((nextThreadId: string) => {
    setCurrentAssistantThreadId(nextThreadId);
    setThreadId(nextThreadId);
  }, []);

  const refreshThreads = useCallback(async () => {
    setIsLoadingThreads(true);
    try {
      const nextThreads = await listAgentThreads();
      setThreads(nextThreads);
      setListError(null);
    } catch (error) {
      setListError(
        error instanceof Error ? error.message : "Could not load chat history.",
      );
    } finally {
      setIsLoadingThreads(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void listAgentThreads()
      .then((nextThreads) => {
        if (cancelled) return;
        setThreads(nextThreads);
        setListError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setListError(
          error instanceof Error
            ? error.message
            : "Could not load chat history.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoadingThreads(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleNewThread = useCallback(async () => {
    try {
      const thread = await createAgentThread();
      selectThread(thread.thread_id);
      setThreads((current) => [
        thread,
        ...current.filter((item) => item.thread_id !== thread.thread_id),
      ]);
      setListError(null);
      setIsHistoryOpen(false);
    } catch (error) {
      const localThreadId = createLocalAssistantThreadId();
      selectThread(localThreadId);
      setListError(
        error instanceof Error
          ? error.message
          : "Created a local chat id; backend history is unavailable.",
      );
      setIsHistoryOpen(false);
    }
  }, [selectThread]);

  const handleThreadUpdated = useCallback(() => {
    void refreshThreads();
  }, [refreshThreads]);

  const beginRename = useCallback((thread: AgentThreadSummary) => {
    setEditingThreadId(thread.thread_id);
    setEditingTitle(displayThreadTitle(thread, thread.thread_id));
  }, []);

  const submitRename = useCallback(
    async (renameThreadId: string) => {
      const title = editingTitle.trim();
      if (!title) {
        setEditingThreadId(null);
        return;
      }

      try {
        const updated = await renameAgentThread(renameThreadId, title);
        setThreads((current) =>
          current.map((item) =>
            item.thread_id === renameThreadId ? updated : item,
          ),
        );
        setListError(null);
      } catch (error) {
        setListError(
          error instanceof Error ? error.message : "Could not rename chat.",
        );
      } finally {
        setEditingThreadId(null);
      }
    },
    [editingTitle],
  );

  const chooseReplacementThread = useCallback(
    (removedThreadId: string) => {
      const replacement = threads.find(
        (thread) => thread.thread_id !== removedThreadId,
      );
      if (replacement) {
        selectThread(replacement.thread_id);
        return;
      }

      void handleNewThread();
    },
    [handleNewThread, selectThread, threads],
  );

  const handleArchive = useCallback(
    async (archiveThreadId: string) => {
      try {
        await archiveAgentThread(archiveThreadId);
        setThreads((current) =>
          current.filter((item) => item.thread_id !== archiveThreadId),
        );
        if (archiveThreadId === threadId) {
          chooseReplacementThread(archiveThreadId);
        }
        setListError(null);
      } catch (error) {
        setListError(
          error instanceof Error ? error.message : "Could not archive chat.",
        );
      }
    },
    [chooseReplacementThread, threadId],
  );

  const handleDelete = useCallback(
    async (deleteThreadId: string) => {
      try {
        await deleteAgentThread(deleteThreadId);
        setThreads((current) =>
          current.filter((item) => item.thread_id !== deleteThreadId),
        );
        if (deleteThreadId === threadId) {
          chooseReplacementThread(deleteThreadId);
        }
        setListError(null);
      } catch (error) {
        setListError(
          error instanceof Error ? error.message : "Could not delete chat.",
        );
      }
    },
    [chooseReplacementThread, threadId],
  );

  const currentThread = threads.find((thread) => thread.thread_id === threadId);
  const currentTitle = displayThreadTitle(currentThread, threadId);

  return {
    threadId,
    threads,
    listError,
    isLoadingThreads,
    isHistoryOpen,
    editingThreadId,
    editingTitle,
    currentTitle,
    selectThread,
    refreshThreads,
    handleNewThread,
    handleThreadUpdated,
    beginRename,
    submitRename,
    handleArchive,
    handleDelete,
    setIsHistoryOpen,
    setEditingTitle,
  };
}
