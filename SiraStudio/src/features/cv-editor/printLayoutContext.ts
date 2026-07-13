import { createContext, useContext } from 'react';

export type PrintBlockKind = 'section' | 'item';

export function printBlockKey(kind: PrintBlockKind, id: string) {
  return `${kind}:${id}`;
}

interface PrintLayoutContextValue {
  enabled: boolean;
  selected: ReadonlySet<string>;
  protectedBlocks: ReadonlySet<string>;
  toggle: (kind: PrintBlockKind, id: string) => void;
}

export const PrintLayoutContext = createContext<PrintLayoutContextValue>({
  enabled: false,
  selected: new Set(),
  protectedBlocks: new Set(),
  toggle: () => undefined,
});

export function usePrintLayout() {
  return useContext(PrintLayoutContext);
}
