import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.tsx'
import { createCVStore, CVStoreProvider } from './store'
import { loadCVData } from './utils/settings'
import { EditorProvider } from './editor/EditorContext'
import { installExternalAPI } from './external'

if (import.meta.env.DEV) {
  void import('./store/__debug')
}

const initialDocument = loadCVData()

const store = createCVStore(initialDocument)

installExternalAPI(store)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CVStoreProvider store={store}>
      <EditorProvider>
        <App />
        <Analytics />
      </EditorProvider>
    </CVStoreProvider>
  </StrictMode>,
)
