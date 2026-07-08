import type { ReactNode } from 'react';
import type { StoreAPI } from './types';
import { CVStoreContext } from './storeContext';

interface CVStoreProviderProps {
  store: StoreAPI;
  children: ReactNode;
}

export function CVStoreProvider({ store, children }: CVStoreProviderProps) {
  return (
    <CVStoreContext.Provider value={store}>
      {children}
    </CVStoreContext.Provider>
  );
}
