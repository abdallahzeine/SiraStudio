import { createContext } from 'react';
import type { StoreAPI } from './types';

export const CVStoreContext = createContext<StoreAPI | null>(null);
