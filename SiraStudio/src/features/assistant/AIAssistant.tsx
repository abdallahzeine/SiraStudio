import { useMemo } from "react";
import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react";
import type { CVData } from "../../shared/types";
import { createEditCVAdapter } from "./api/agent-stream";
import { createAssistantHistoryAdapter } from "./api/assistant-history";
import { Thread } from "./components/Thread";
import { useAssistantThreads } from "./hooks/useAssistantThreads";
import {
  displayThreadTitle,
  formatThreadDate,
} from "./utils/assistantThreadDisplay";

interface AIAssistantProps {
  cv: CVData;
  revision: number;
  onApplyCV: (cv: CVData) => void;
  onClose: () => void;
}

interface AssistantRuntimeShellProps extends AIAssistantProps {
  threadId: string;
  threadTitle: string;
  onNewThread: () => void;
  onToggleHistory: () => void;
  onThreadUpdated: (threadId: string) => void;
}

function AssistantRuntimeShell({
  cv,
  revision,
  onApplyCV,
  onClose,
  threadId,
  threadTitle,
  onNewThread,
  onToggleHistory,
  onThreadUpdated,
}: AssistantRuntimeShellProps) {
  const adapter = useMemo(
    () =>
      createEditCVAdapter({
        getCV: () => cv,
        getRevision: () => revision,
        onCV: onApplyCV,
        getThreadId: () => threadId,
        onThreadUpdated,
      }),
    [cv, revision, onApplyCV, threadId, onThreadUpdated],
  );

  const historyAdapter = useMemo(
    () => createAssistantHistoryAdapter(threadId),
    [threadId],
  );

  const runtime = useLocalRuntime(adapter, {
    adapters: { history: historyAdapter },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread
        currentThreadTitle={threadTitle}
        onNewThread={onNewThread}
        onToggleHistory={onToggleHistory}
        onClose={onClose}
      />
    </AssistantRuntimeProvider>
  );
}

export function AIAssistant({
  cv,
  revision,
  onApplyCV,
  onClose,
}: AIAssistantProps) {
  const {
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
  } = useAssistantThreads();

  return (
    <div className="relative h-full min-h-0 w-full bg-white">
      <style>{`
        @keyframes historyPanelSlideIn {
          from { opacity: 0; transform: translateX(24px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div className="h-full min-h-0 min-w-0" key={threadId}>
        <AssistantRuntimeShell
          cv={cv}
          revision={revision}
          onApplyCV={onApplyCV}
          onClose={onClose}
          threadId={threadId}
          threadTitle={currentTitle}
          onNewThread={handleNewThread}
          onToggleHistory={() => setIsHistoryOpen((open) => !open)}
          onThreadUpdated={handleThreadUpdated}
        />
      </div>
      {isHistoryOpen ? (
        <div
          className="absolute inset-0 z-30 bg-gray-950/20 p-3 backdrop-blur-[1px]"
          role="dialog"
          aria-label="AI chat history"
        >
          <button
            type="button"
            aria-label="Close chat history"
            className="absolute inset-0 h-full w-full cursor-default"
            onClick={() => setIsHistoryOpen(false)}
          />
          <div className="relative ml-auto flex h-full w-full max-w-sm animate-[historyPanelSlideIn_180ms_ease-out] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-950">
                  Chat history
                </div>
                <div className="text-[11px] text-slate-600">
                  Switch, rename, archive, or delete chats
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {isLoadingThreads ? (
                  <div className="text-[11px] text-slate-600">Loading...</div>
                ) : null}
                <button
                  type="button"
                  onClick={handleNewThread}
                  className="rounded-full bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
                >
                  New
                </button>
                <button
                  type="button"
                  onClick={() => setIsHistoryOpen(false)}
                  className="rounded-full px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
                >
                  Close
                </button>
              </div>
            </div>
            {listError ? (
              <div className="mx-4 mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900 ring-1 ring-amber-300">
                {listError}
                <button
                  type="button"
                  onClick={refreshThreads}
                  className="ml-2 font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
                >
                  Retry
                </button>
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {threads.map((thread) => {
                const isSelected = thread.thread_id === threadId;
                const title = displayThreadTitle(thread, thread.thread_id);

                return (
                  <div
                    key={thread.thread_id}
                    className={`mb-2 rounded-2xl p-3 text-left transition ${isSelected ? "bg-violet-50 shadow-sm ring-2 ring-violet-200" : "bg-slate-50 hover:bg-violet-50/60"}`}
                  >
                    {editingThreadId === thread.thread_id ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void submitRename(thread.thread_id);
                        }}
                        className="flex gap-1"
                      >
                        <input
                          value={editingTitle}
                          onChange={(event) =>
                            setEditingTitle(event.target.value)
                          }
                          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-950 outline-none focus:border-violet-700 focus:ring-2 focus:ring-violet-100"
                          autoFocus
                        />
                        <button
                          type="submit"
                          className="rounded-lg px-2 text-xs font-semibold text-violet-800 hover:bg-violet-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
                        >
                          Save
                        </button>
                      </form>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            selectThread(thread.thread_id);
                            setIsHistoryOpen(false);
                          }}
                          className="block w-full rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
                        >
                          <span className="block truncate text-sm font-medium text-slate-950">
                            {title}
                          </span>
                          <span className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-slate-600">
                            <span className="truncate">
                              {thread.message_preview || "No messages yet"}
                            </span>
                            <span className="shrink-0">
                              {formatThreadDate(
                                thread.last_message_at ?? thread.updated_at,
                              )}
                            </span>
                          </span>
                        </button>
                        <div className="mt-2 flex gap-1 text-[11px]">
                          <button
                            type="button"
                            onClick={() => beginRename(thread)}
                            className="rounded px-1.5 py-0.5 font-medium text-slate-700 hover:bg-white hover:text-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleArchive(thread.thread_id)}
                            className="rounded px-1.5 py-0.5 font-medium text-slate-700 hover:bg-white hover:text-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
                          >
                            Archive
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(thread.thread_id)}
                            className="rounded px-1.5 py-0.5 font-medium text-red-700 hover:bg-red-50 hover:text-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              {!threads.length && !isLoadingThreads ? (
                <div className="px-3 py-8 text-center text-xs text-slate-600">
                  No saved chats yet.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
