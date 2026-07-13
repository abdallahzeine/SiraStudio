import { useCallback, useEffect, useMemo, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useChangeHighlight, useDispatch } from '../../../app/store';
import { useEditorContext } from './focusedEditorContext';
import { useLazyEditor } from './useLazyEditor';

interface CVTextEditorProps {
  value: string | null | undefined;
  path: string;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
  lazy?: boolean;
}

interface MountedCVTextEditorProps {
  value: string;
  path: string;
  className: string;
  placeholder: string;
  multiline: boolean;
  autoFocusOnMount: boolean;
  onAutoFocusHandled: () => void;
}

function plainTextPreview(value: string | null | undefined): string {
  if (value == null) return '';
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function MountedCVTextEditor({
  value,
  path,
  className,
  placeholder,
  multiline,
  autoFocusOnMount,
  onAutoFocusHandled,
}: MountedCVTextEditorProps) {
  const dispatch = useDispatch();
  const { registerEditor } = useEditorContext();

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        hardBreak: false,
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    [placeholder],
  );

  const editorProps = useMemo(
    () => ({
      attributes: {
        class: `cv-text-content ${className}`.trim(),
      },
      handleKeyDown: (_view: unknown, event: KeyboardEvent) => {
        if (!multiline && event.key === 'Enter') {
          event.preventDefault();
          return true;
        }
        return false;
      },
    }),
    [className, multiline],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: value,
    editorProps,
    onFocus: ({ editor: focusedEditor }) => {
      if (focusedEditor.isDestroyed) return;
      registerEditor(focusedEditor);
    },
    onUpdate: ({ editor: updatedEditor }) => {
      if (updatedEditor.isDestroyed) return;
      dispatch({ op: 'set', path, value: updatedEditor.getHTML() });
    },
  });

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (editor.getHTML() === value) return;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || !autoFocusOnMount) return;
    editor.commands.focus('end');
    onAutoFocusHandled();
  }, [autoFocusOnMount, editor, onAutoFocusHandled]);

  if (!editor || editor.isDestroyed) {
    return null;
  }

  return (
    <EditorContent
      editor={editor}
      className={`cv-text-editor ${multiline ? 'multiline' : 'single-line'}`}
    />
  );
}

export function CVTextEditor({
  value,
  path,
  className = '',
  placeholder = 'Click to edit...',
  multiline = false,
  lazy = true,
}: CVTextEditorProps) {
  const { containerRef, shouldMount, activate } = useLazyEditor({ lazy });
  const [autoFocusOnMount, setAutoFocusOnMount] = useState(false);
  const highlight = useChangeHighlight(path);

  const activateEditor = useCallback(() => {
    if (shouldMount) return;
    setAutoFocusOnMount(true);
    activate();
  }, [activate, shouldMount]);

  const handleAutoFocusHandled = useCallback(() => {
    setAutoFocusOnMount(false);
  }, []);

  const safeValue = value ?? '';
  const preview = plainTextPreview(safeValue);

  return (
    <div ref={containerRef} onPointerDownCapture={activateEditor} onFocusCapture={activateEditor} className={highlight ? 'change-highlight' : ''}>
      {shouldMount ? (
        <MountedCVTextEditor
          value={safeValue}
          path={path}
          className={className}
          placeholder={placeholder}
          multiline={multiline}
          autoFocusOnMount={autoFocusOnMount}
          onAutoFocusHandled={handleAutoFocusHandled}
        />
      ) : (
        <div className={`cv-text-editor ${multiline ? 'multiline' : 'single-line'}`}>
          <div className={`cv-text-content ${className}`.trim()}>
            {preview || <span className="text-gray-400">{placeholder}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
