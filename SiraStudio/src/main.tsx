import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import "./index.css";
import App from "./app/App.tsx";
import { createCVStore, CVStoreProvider } from "./app/store";
import { loadCVData } from "./shared/utils/settings";
import { EditorProvider } from "./features/cv-editor/editor/EditorContext";

if (import.meta.env.DEV) {
  void import("./app/store/__debug");
}

const initialDocument = loadCVData();

const store = createCVStore(initialDocument);

if (import.meta.env.VITE_ENABLE_EXTERNAL_API) {
  void import("./features/external-api").then(({ installExternalAPI }) =>
    installExternalAPI(store),
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CVStoreProvider store={store}>
      <EditorProvider>
        <App />
        <Analytics />
      </EditorProvider>
    </CVStoreProvider>
  </StrictMode>,
);
