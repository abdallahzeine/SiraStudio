import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import { EditorContext, type EditorContextValue } from './focusedEditorContext';

export function EditorProvider({ children }: { children: ReactNode }) {
  const [focusedEditor, setFocusedEditor] = useState<Editor | null>(null);

  const value = useMemo<EditorContextValue>(
    () => ({
      focusedEditor,
      registerEditor: (editor: Editor) => setFocusedEditor(editor),
    }),
    [focusedEditor]
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}
