// ============================================================================
// Toolbar Component
// ============================================================================

import { useCallback, useState } from 'react';
import { Link2, Plus, Printer, RotateCcw, Save, Unlink2 } from 'lucide-react';
import type { CVSection } from '../../../shared/types';
import { useDispatch } from '../../../app/store';
import { AddSectionModal } from './AddSectionModal';
import { useFocusedEditor } from '../editor/focusedEditorContext';

interface ToolbarProps {
  onReset: () => void;
  onPrint: () => void;
  onOpenSaves: () => void;
  panelOffsetX?: number;
  printLayoutMode: boolean;
  printSelectionCount: number;
  printLayoutMessage: string;
  onTogglePrintLayoutMode: () => void;
  onKeepTogether: () => void;
  onAllowBreak: () => void;
}

export function Toolbar({
  onReset,
  onPrint,
  onOpenSaves,
  panelOffsetX = 0,
  printLayoutMode,
  printSelectionCount,
  printLayoutMessage,
  onTogglePrintLayoutMode,
  onKeepTogether,
  onAllowBreak,
}: ToolbarProps) {
  const editor = useFocusedEditor();
  const dispatch = useDispatch();
  const [isAddSectionOpen, setIsAddSectionOpen] = useState(false);

  const handleAddSection = useCallback((section: CVSection) => {
    dispatch({ op: 'insert', path: 'sections[-1]', value: section });
  }, [dispatch]);

  const formatButtons = [
    {
      key: 'bold',
      label: 'B',
      style: 'font-bold',
      active: editor?.isActive('bold') ?? false,
      run: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      key: 'italic',
      label: 'I',
      style: 'italic',
      active: editor?.isActive('italic') ?? false,
      run: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      key: 'underline',
      label: 'U',
      style: 'underline',
      active: editor?.isActive('underline') ?? false,
      run: () => editor?.chain().focus().toggleUnderline().run(),
    },
  ];

  return (
    <>
      <div
        className="no-print @container pointer-events-none fixed bottom-6 left-0 z-20 flex justify-center px-3 print:hidden"
        style={{ right: `${panelOffsetX * 2}px` }}
      >
       <div className="toolbar-bounce-in pointer-events-auto flex w-fit max-w-full flex-nowrap items-center gap-2 rounded-2xl border border-gray-200 bg-white/95 px-4 py-2 shadow-lg backdrop-blur">
        {printLayoutMode ? (
          <>
            <span className="max-w-56 text-xs text-gray-600" role="status">{printLayoutMessage}</span>
            <button
              onClick={onKeepTogether}
              disabled={printSelectionCount === 0}
              className="toolbar-btn flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#0078D7] px-3 text-sm text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Link2 size={14} />
              Keep together ({printSelectionCount})
            </button>
            <button
              onClick={onAllowBreak}
              disabled={printSelectionCount === 0}
              className="toolbar-btn flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Unlink2 size={14} />
              Allow break
            </button>
            <button
              onClick={onTogglePrintLayoutMode}
              className="toolbar-btn flex h-10 shrink-0 items-center rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Done
            </button>
          </>
        ) : (
          <>
        <button onClick={() => setIsAddSectionOpen(true)}
          className="toolbar-btn flex h-10 shrink-0 items-center gap-1 rounded-xl border border-blue-300 bg-blue-50 px-3 text-sm text-blue-700 shadow-sm transition-colors hover:bg-blue-100"
          title="Add section"
        >
          <Plus size={14} />
          <span className="hidden @[760px]:inline">Add section</span>
        </button>
        <button onClick={onReset}
        className="toolbar-btn flex h-10 shrink-0 items-center gap-1 rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-600 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-800">
        <RotateCcw size={14} />
        <span className="hidden @[760px]:inline">Reset</span>
      </button>
      <button onClick={onPrint}
        className="toolbar-btn flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-600 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-800">
        <Printer size={14} />
        <span className="hidden @[760px]:inline">Print</span>
      </button>
      <button onClick={onOpenSaves}
        className="toolbar-btn flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-600 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-800">
        <Save size={14} />
        <span className="hidden @[760px]:inline">Saves</span>
      </button>
      <div className="mx-1 hidden h-5 w-px shrink-0 bg-gray-200 @[520px]:block" />
      <span className="mr-1 hidden shrink-0 text-xs font-semibold tracking-wide text-gray-500 @[520px]:inline">FORMAT</span>
      {formatButtons.map(({ key, label, style, active, run }) => (
        <button
          key={key}
          onMouseDown={(e) => {
            e.preventDefault();
            run();
          }}
          title={key}
          disabled={!editor}
          className={`toolbar-btn hidden h-10 w-10 shrink-0 items-center justify-center @[520px]:inline-flex ${style} rounded border text-sm transition-colors ${
            active
              ? 'bg-blue-100 text-blue-700 border-blue-300'
              : 'text-gray-700 border-transparent hover:bg-gray-100 hover:text-gray-900 hover:border-gray-200'
          } ${!editor ? 'opacity-40 cursor-not-allowed hover:bg-transparent hover:border-transparent' : ''}`}
        >
          {label}
        </button>
      ))}
        <span className="ml-1 hidden shrink-0 text-xs italic text-gray-400 @[680px]:inline">Select text</span>
          </>
        )}
       </div>
      </div>
      <AddSectionModal
        open={isAddSectionOpen}
        onClose={() => setIsAddSectionOpen(false)}
        onCreate={handleAddSection}
      />
    </>
  );
}
