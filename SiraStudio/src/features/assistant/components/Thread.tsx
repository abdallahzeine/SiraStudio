import {
  AuiIf,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  MessagePartPrimitive,
  ActionBarPrimitive,
  useThreadViewport,
  useMessage,
} from '@assistant-ui/react';
import type { ThreadAssistantMessagePart } from '@assistant-ui/react';
import { ArrowRight, ArrowUp, ChevronDown, History, Loader2, Plus, X } from 'lucide-react';
import { useState } from 'react';

const suggestions = [
  'Improve my professional summary',
  'Make my work experience bullets more impactful',
  'Tailor this CV for a frontend developer role',
  'Add measurable achievements where possible',
];

interface ThreadProps {
  currentThreadTitle: string;
  onNewThread: () => void;
  onToggleHistory: () => void;
  onClose: () => void;
}

function ChatHeaderActions({ currentThreadTitle, onNewThread, onToggleHistory, onClose }: ThreadProps) {
  return (
    <header className="flex min-h-16 shrink-0 items-center gap-1 border-b border-slate-200/80 bg-white/95 px-4 py-2.5 backdrop-blur">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-950">{currentThreadTitle || 'Sira AI'}</div>
        <div className="mt-0.5 text-[11px] font-medium text-slate-500">CV assistant</div>
      </div>
      <div className="flex justify-start">
        <button
          type="button"
          onClick={onToggleHistory}
          aria-label="Open chat history"
          title="Chat history"
          className="flex size-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0078D7]"
        >
          <History size={18} />
        </button>
      </div>
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onNewThread}
          aria-label="Start a new assistant thread"
          title="New chat"
          className="flex size-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0078D7]"
        >
          <Plus size={18} />
        </button>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close AI assistant"
          title="Close assistant"
          className="flex size-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0078D7]"
        >
          <X size={18} />
        </button>
      </div>
    </header>
  );
}

function ThreadWelcome() {
  return (
    <AuiIf condition={(s) => s.thread.isEmpty}>
      <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col justify-center px-5 py-10 sm:px-6">
        <h3 className="text-balance text-2xl font-semibold tracking-tight text-slate-950">Let's improve your CV</h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
          Ask me to rewrite, tailor, or strengthen any part. I can apply the changes directly to your CV.
        </p>
        <div className="mt-7 grid w-full gap-2.5 sm:grid-cols-2">
          {suggestions.map((prompt) => (
            <ThreadPrimitive.Suggestion
              key={prompt}
              prompt={prompt}
              send
              className="group rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left text-[13px] font-medium leading-5 text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/70 hover:text-blue-800 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0078D7]"
            >
              <span className="flex items-start justify-between gap-3">
                {prompt}
                <ArrowRight size={14} aria-hidden="true" className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#0078D7]" />
              </span>
            </ThreadPrimitive.Suggestion>
          ))}
        </div>
      </div>
    </AuiIf>
  );
}

function EditComposer() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-2">
      <ComposerPrimitive.Root className="flex items-end gap-2 rounded-3xl border border-gray-200 bg-white p-2 shadow-sm">
        <ComposerPrimitive.Input
          submitMode="enter"
          className="max-h-28 grow resize-none bg-transparent px-3 py-2 text-sm leading-6 text-gray-900 outline-none placeholder:text-gray-400"
        />
        <ComposerPrimitive.Cancel className="shrink-0 rounded-full bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200">
          Cancel
        </ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send className="shrink-0 rounded-full bg-[#0078D7] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-40">
          Save
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </div>
  );
}

function UserMessage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl justify-end px-4 py-2.5 sm:px-6">
      <MessagePrimitive.Root className="max-w-[88%] rounded-2xl rounded-br-md bg-[#0078D7] px-4 py-2.5 text-sm leading-6 text-white shadow-sm shadow-blue-200/60">
        <MessagePrimitive.Parts
          components={{
            Text: () => (
              <p className="whitespace-pre-wrap">
                <MessagePartPrimitive.Text />
              </p>
            ),
          }}
        />
      </MessagePrimitive.Root>
    </div>
  );
}

function DynamicProgress() {
  const message = useMessage();
  const [isCompact, setIsCompact] = useState(false);
  const tools = message.content.filter(
    (part): part is Extract<ThreadAssistantMessagePart, { type: 'tool-call' }> =>
      part.type === 'tool-call'
  );

  return (
    <div className="mb-1.5">
      <button
        type="button"
        aria-expanded={!isCompact}
        onClick={() => setIsCompact((compact) => !compact)}
        className="cursor-pointer text-xs font-semibold text-slate-800 transition-colors hover:text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0078D7]"
      >
        Sira AI
      </button>

      {!isCompact && (
        <div className="mt-1 space-y-0.5 text-[11px] leading-4 text-slate-500/60" role="status">
          {tools.map((tool) => {
            const running = tool.result === undefined && !tool.isError;
            return (
              <div
                key={tool.toolCallId}
                className={`flex items-center gap-1.5 animate-[auiToolSlideIn_0.3s_ease-out] ${running ? 'animate-[auiToolGlow_1.8s_ease-in-out_infinite] text-slate-500/90' : ''}`}
              >
                {running ? <Loader2 size={11} className="animate-spin" /> : <span aria-hidden="true">{tool.isError ? '!' : '✓'}</span>}
                <span>{tool.argsText || tool.toolName}</span>
              </div>
            );
          })}
          {message.status?.type === 'running' && tools.length === 0 && (
            <div className="flex animate-[auiToolGlow_1.8s_ease-in-out_infinite] items-center gap-1.5 text-slate-500/90">
              <Loader2 size={11} className="animate-spin" />
              <span>Thinking...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolFallback({ status, isError }: {
  toolName: string;
  status: { type: string };
  result?: unknown;
  isError?: boolean;
}) {
  if (status.type === 'running' || !isError) return null;

  return (
    <div className="mb-1 text-xs text-amber-700">
      One editing step could not be completed.
    </div>
  );
}

function AssistantMessage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4 sm:px-6">
      <MessagePrimitive.Root className="group flex w-full gap-3">
        <div className="min-w-0 flex-1">
          <DynamicProgress />
          <div className="text-sm leading-7 text-slate-700">
            <MessagePrimitive.Parts
              components={{
                Text: () => (
                  <p className="m-0 whitespace-pre-wrap">
                    <MessagePartPrimitive.Text />
                  </p>
                ),
                tools: { Fallback: ToolFallback },
              }}
            />
            <MessagePrimitive.Error>
              <div className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm leading-5 text-red-700 ring-1 ring-red-100">
                I couldn't finish that response. Please retry, or send your request again.
              </div>
            </MessagePrimitive.Error>
          </div>

          <ActionBarPrimitive.Root className="mt-2 flex">
            <ActionBarPrimitive.Reload
              aria-label="Retry assistant response"
              className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0078D7]"
            >
              Retry
            </ActionBarPrimitive.Reload>
          </ActionBarPrimitive.Root>
        </div>
      </MessagePrimitive.Root>
    </div>
  );
}

function ScrollToBottomButton() {
  const isAtBottom = useThreadViewport((m) => m.isAtBottom);

  return (
    <ThreadPrimitive.ScrollToBottom
      disabled={isAtBottom}
      aria-label="Scroll to latest message"
      className="absolute -top-12 left-1/2 flex size-9 -translate-x-1/2 items-center justify-center rounded-full bg-white text-slate-500 shadow-lg ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-0"
    >
      <ChevronDown size={16} />
    </ThreadPrimitive.ScrollToBottom>
  );
}

function ThreadComposer() {
  return (
    <ThreadPrimitive.ViewportFooter className="sticky bottom-0 z-10 mt-auto shrink-0 bg-gradient-to-t from-white via-white via-80% to-white/0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-5 sm:px-5">
      <div className="relative mx-auto w-full max-w-2xl">
        <ScrollToBottomButton />
        <ComposerPrimitive.Root className="flex items-end gap-2 rounded-[1.4rem] border border-slate-200 bg-white p-2 shadow-[0_8px_30px_rgba(15,23,42,0.08)] transition focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100/70">
          <ComposerPrimitive.Input
            submitMode="enter"
            placeholder="Ask Sira AI to improve your CV..."
            className="max-h-36 min-h-10 grow resize-none bg-transparent px-3 py-2 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400"
          />
          <AuiIf condition={(s) => !s.thread.isRunning}>
            <ComposerPrimitive.Send
              aria-label="Send message"
              className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#0078D7] text-white shadow-sm transition hover:bg-blue-700 active:scale-95 disabled:bg-slate-200 disabled:text-slate-600 disabled:opacity-100 disabled:ring-1 disabled:ring-inset disabled:ring-slate-300"
            >
              <ArrowUp size={16} />
            </ComposerPrimitive.Send>
          </AuiIf>
          <AuiIf condition={(s) => s.thread.isRunning}>
            <ComposerPrimitive.Cancel
              aria-label="Stop assistant response"
              className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200"
            >
              <span className="block size-2.5 rounded-sm bg-gray-500" />
            </ComposerPrimitive.Cancel>
          </AuiIf>
        </ComposerPrimitive.Root>
        <p className="mt-2 text-center text-[10px] leading-4 text-slate-400">AI can make mistakes. Review changes before exporting.</p>
      </div>
    </ThreadPrimitive.ViewportFooter>
  );
}

export function Thread({ currentThreadTitle, onNewThread, onToggleHistory, onClose }: ThreadProps) {
  return (
    <>
      <style>{`
        @keyframes auiToolSlideIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes auiToolGlow {
          0%, 100% { opacity: 0.55; filter: drop-shadow(0 0 0 transparent); }
          50% { opacity: 1; filter: drop-shadow(0 0 4px rgb(100 116 139 / 0.55)); }
        }
      `}</style>
      <ThreadPrimitive.Root className="flex h-full min-h-0 w-full flex-col bg-white">
        <ChatHeaderActions currentThreadTitle={currentThreadTitle} onNewThread={onNewThread} onToggleHistory={onToggleHistory} onClose={onClose} />
        <ThreadPrimitive.Viewport className="relative flex min-h-0 flex-1 flex-col overflow-y-auto scroll-smooth bg-[linear-gradient(to_bottom,#fafafa_0,#fff_12rem)]">
          <ThreadWelcome />
          <div className="py-2">
            <ThreadPrimitive.Messages>
              {({ message }) => {
                if (message.composer.isEditing) {
                  return <EditComposer />;
                }

                if (message.role === 'user') {
                  return <UserMessage />;
                }

                return <AssistantMessage />;
              }}
            </ThreadPrimitive.Messages>
          </div>
          <ThreadComposer />
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>
    </>
  );
}
