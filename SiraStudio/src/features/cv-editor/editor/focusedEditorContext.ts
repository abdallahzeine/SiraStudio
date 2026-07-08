import { createContext, useContext } from 'react';
import type { Editor } from '@tiptap/react';

export interface EditorContextValue {
  focusedEditor: Editor | null;
  registerEditor: (editor: Editor) => void;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditorContext(): EditorContextValue {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditorContext must be used within EditorProvider');
  }
  return context;
}

export function useFocusedEditor(): Editor | null {
  return useEditorContext().focusedEditor;
}
