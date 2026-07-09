import type { SVGProps } from 'react';
import {
  AuiIf,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  MessagePartPrimitive,
  ActionBarPrimitive,
  ErrorPrimitive,
  useThreadViewport,
  useMessage,
} from '@assistant-ui/react';
import type { ThreadAssistantMessagePart } from '@assistant-ui/react';

const suggestions = [
  'Improve my professional summary',
  'Make my work experience bullets more impactful',
  'Tailor this CV for a frontend developer role',
  'Add measurable achievements where possible',
];

function SendIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function SparkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
      <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
    </svg>
  );
}

function GearIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.07.07a2 2 0 1 1-2.83 2.83l-.07-.07A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.54V21a2 2 0 1 1-4 0v-.06a1.7 1.7 0 0 0-1-1.54 1.7 1.7 0 0 0-1.87.34l-.07.07a2 2 0 1 1-2.83-2.83l.07-.07A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.54-1H3a2 2 0 1 1 0-4h.06a1.7 1.7 0 0 0 1.54-1 1.7 1.7 0 0 0-.34-1.87l-.07-.07a2 2 0 1 1 2.83-2.83l.07.07A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10.54 3.06V3a2 2 0 1 1 4 0v.06a1.7 1.7 0 0 0 1 1.54 1.7 1.7 0 0 0 1.87-.34l.07-.07a2 2 0 1 1 2.83 2.83l-.07.07A1.7 1.7 0 0 0 19.4 9c0 .68.4 1.3 1.04 1.54H21a2 2 0 1 1 0 4h-.06a1.7 1.7 0 0 0-1.54 1Z" />
    </svg>
  );
}

function HistoryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

interface ThreadProps {
  currentThreadTitle: string;
  onNewThread: () => void;
  onToggleHistory: () => void;
  onClose: () => void;
}

function ChatHeaderActions({ onNewThread, onToggleHistory, onClose }: ThreadProps) {
  return (
    <div className="grid shrink-0 grid-cols-3 items-center border-b border-slate-200 bg-white px-3 py-2">
      <div className="flex justify-start">
        <button
          type="button"
          onClick={onToggleHistory}
          aria-label="Open chat history"
          className="flex size-8 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-violet-50 hover:text-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
        >
          <HistoryIcon className="size-4" />
        </button>
      </div>
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onNewThread}
          aria-label="Start a new assistant thread"
          className="rounded-full bg-violet-700 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
        >
          New chat
        </button>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close AI assistant"
          className="flex size-8 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function ThreadWelcome() {
  return (
    <AuiIf condition={(s) => s.thread.isEmpty}>
      <div className="mx-auto flex min-h-[55vh] w-full max-w-xl flex-col items-center justify-center px-4 py-8 text-center">
        <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border border-violet-100 bg-violet-50 text-violet-600 shadow-sm">
          <SparkIcon className="size-5" />
        </div>
        <h3 className="text-balance text-xl font-semibold tracking-tight text-gray-950">How can I help with your CV?</h3>
        <p className="mt-2 max-w-sm text-sm leading-6 text-gray-500">
          Ask for edits to summaries, bullets, skills, projects, or role-specific tailoring.
        </p>
        <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
          {suggestions.map((prompt) => (
            <ThreadPrimitive.Suggestion
              key={prompt}
              prompt={prompt}
              send
              className="rounded-2xl border border-gray-200 bg-white px-3.5 py-3 text-left text-sm leading-5 text-gray-700 shadow-sm transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800 hover:shadow-md"
            >
              {prompt}
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
        <ComposerPrimitive.Send className="shrink-0 rounded-full bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-40">
          Save
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </div>
  );
}

function UserMessage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl justify-end px-4 py-2">
      <MessagePrimitive.Root className="max-w-[88%] rounded-[1.35rem] bg-gray-900 px-4 py-2.5 text-sm leading-6 text-white shadow-sm">
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

  if (message.status?.type !== 'running') return null;

  const runningTool = [...message.content].reverse().find(
    (part): part is Extract<ThreadAssistantMessagePart, { type: 'tool-call' }> =>
      part.type === 'tool-call' && part.result === undefined && !part.isError
  );

  if (runningTool) {
    return (
      <div className="animate-[auiToolSlideIn_0.3s_ease-out] mt-2 inline-flex items-center gap-2 text-xs font-semibold text-violet-700 transition-opacity duration-300">
        <GearIcon className="size-3.5 text-violet-600" />
        <span>{runningTool.argsText || 'Working...'}</span>
      </div>
    );
  }

  return (
    <div className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-slate-400">
      <span>Thinking...</span>
    </div>
  );
}

function AssistantMessage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-3">
      <MessagePrimitive.Root className="group flex w-full gap-3">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-600 ring-1 ring-violet-100">
          <SparkIcon className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-xs font-semibold text-gray-500">Sira AI</div>
          <div className="text-sm leading-7 text-gray-800">
            <MessagePrimitive.Parts
              components={{
                Text: () => (
                  <p className="m-0 whitespace-pre-wrap">
                    <MessagePartPrimitive.Text />
                  </p>
                ),
                tools: { Fallback: () => null },
              }}
            />
            <DynamicProgress />
            <MessagePrimitive.Error>
              <ErrorPrimitive.Root className="mt-2 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
                <ErrorPrimitive.Message />
              </ErrorPrimitive.Root>
            </MessagePrimitive.Error>
          </div>

          <ActionBarPrimitive.Root className="mt-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
            <ActionBarPrimitive.Reload
              aria-label="Retry assistant response"
              className="rounded-full px-2.5 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
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
      className="absolute -top-11 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full bg-white text-gray-500 shadow-lg ring-1 ring-gray-200 transition hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-0"
    >
      <SendIcon className="size-4 rotate-180" />
    </ThreadPrimitive.ScrollToBottom>
  );
}

function ThreadComposer() {
  return (
    <ThreadPrimitive.ViewportFooter className="sticky bottom-0 z-10 bg-gradient-to-t from-white via-white to-white/85 px-4 pb-4 pt-3">
      <div className="relative mx-auto w-full max-w-2xl">
        <ScrollToBottomButton />
        <ComposerPrimitive.Root className="flex items-end gap-2 rounded-[1.75rem] border border-gray-200 bg-white p-2 shadow-sm ring-1 ring-black/[0.02] transition focus-within:border-violet-200 focus-within:ring-violet-100">
          <ComposerPrimitive.Input
            submitMode="enter"
            placeholder="Ask Sira AI to improve your CV..."
            className="max-h-32 min-h-10 grow resize-none bg-transparent px-3 py-2 text-sm leading-6 text-gray-900 outline-none placeholder:text-gray-400"
          />
          <AuiIf condition={(s) => !s.thread.isRunning}>
            <ComposerPrimitive.Send
              aria-label="Send message"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white shadow-sm transition-colors hover:bg-violet-700 disabled:opacity-40"
            >
              <SendIcon className="size-4" />
            </ComposerPrimitive.Send>
          </AuiIf>
          <AuiIf condition={(s) => s.thread.isRunning}>
            <ComposerPrimitive.Cancel
              aria-label="Stop assistant response"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200"
            >
              <span className="block size-2.5 rounded-sm bg-gray-500" />
            </ComposerPrimitive.Cancel>
          </AuiIf>
        </ComposerPrimitive.Root>
        <p className="mt-2 text-center text-[11px] leading-4 text-gray-400">AI can make mistakes. Review important details before exporting.</p>
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
      `}</style>
      <ThreadPrimitive.Root className="flex h-full min-h-0 w-full flex-col bg-white">
        <ChatHeaderActions currentThreadTitle={currentThreadTitle} onNewThread={onNewThread} onToggleHistory={onToggleHistory} onClose={onClose} />
        <ThreadPrimitive.Viewport className="relative min-h-0 flex-1 overflow-y-auto scroll-smooth bg-white">
          <ThreadWelcome />
          <div className="py-3">
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
