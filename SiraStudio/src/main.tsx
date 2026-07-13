import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./app/App.tsx";
import { createCVStore, CVStoreProvider } from "./app/store";
import { EditorProvider } from "./features/cv-editor/editor/EditorContext";
import { loadCVData } from "./shared/utils/settings";

if (import.meta.env.DEV) {
  void import("./app/store/__debug");
}

const store = createCVStore(loadCVData());

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
      </EditorProvider>
    </CVStoreProvider>
  </StrictMode>,
);
