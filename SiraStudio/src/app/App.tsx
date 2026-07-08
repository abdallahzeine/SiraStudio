import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import type { CVData, CVSection } from "../shared/types";
import { Toolbar } from "../features/cv-editor/components/Toolbar";
import { SectionModal } from "../features/cv-editor/components/SectionModal";
import { SavesPanel } from "../features/saves/SavesPanel";
import { AIAssistant } from "../features/assistant/AIAssistant";
import { ConfirmModal } from "../shared/components/ConfirmModal";
import { SplashScreen } from "../shared/components/SplashScreen";
import { PrintTutorialModal } from "../shared/components/PrintTutorialModal.tsx";
import {
  hasSeenPrintTutorial,
  markPrintTutorialSeen,
} from "../shared/utils/printTutorial.ts";
import { SidePanel } from "../shared/components/SidePanel";
import { SectionLayoutContent } from "../features/cv-editor/components/SectionLayoutPanel";
import { ErrorBoundary } from "../shared/components/ErrorBoundary";
import {
  loadSidePanelWidth,
  saveSidePanelWidth,
} from "../shared/utils/sidePanel";
import { useMediaQuery } from "../shared/hooks/useMediaQuery";
import {
  createBlankCVData,
  isValidCVData,
} from "../features/saves/utils/snapshots";
import {
  getPanelSubtitle,
  getPanelTitle,
  type PanelState,
  type PanelType,
} from "./panels";
import { usePendingSectionScroll } from "./hooks/usePendingSectionScroll";
import { useUndoRedoShortcuts } from "./hooks/useUndoRedoShortcuts";
import { useCVSelector, useDispatch, useHistory } from "./store";

const EditorDocument = lazy(() =>
  import("../features/cv-editor/editor/EditorDocument").then((m) => ({
    default: m.EditorDocument,
  })),
);
const PrintDocument = lazy(() =>
  import("../features/print/PrintDocument").then((m) => ({
    default: m.PrintDocument,
  })),
);

export default function App() {
  const cv = useCVSelector((s) => s.data);
  const revision = useCVSelector((s) => s.revision);
  const dispatch = useDispatch();
  const history = useHistory();
  const [showSplash, setShowSplash] = useState(true);
  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [panelWidth, setPanelWidth] = useState(loadSidePanelWidth);
  const [confirmModal, setConfirmModal] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [showPrintTutorial, setShowPrintTutorial] = useState(false);
  const [printAfterTutorial, setPrintAfterTutorial] = useState(false);

  useEffect(() => {
    void import("../features/cv-editor/editor/EditorDocument");
    void import("../features/print/PrintDocument");
  }, []);

  const openConfirm = (message: string, action: () => void) =>
    setConfirmModal({ message, onConfirm: action });
  const closeConfirm = () => setConfirmModal(null);

  useUndoRedoShortcuts(dispatch, history);

  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);

  usePendingSectionScroll(pendingScrollId, setPendingScrollId);

  const addSection = useCallback(
    (section: CVSection) => {
      dispatch({ op: "insert", path: "sections[-1]", value: section });
      setPendingScrollId(section.id);
    },
    [dispatch],
  );

  const handlePanelWidthChange = useCallback((w: number) => {
    setPanelWidth(w);
    saveSidePanelWidth(w);
  }, []);

  const handlePrint = () => {
    setPanel(null);
    if (!hasSeenPrintTutorial()) {
      setPrintAfterTutorial(true);
      setShowPrintTutorial(true);
      return;
    }
    setTimeout(() => window.print(), 300);
  };

  const handleTutorialClose = () => {
    markPrintTutorialSeen();
    setShowPrintTutorial(false);
    if (printAfterTutorial) {
      setTimeout(() => window.print(), 300);
    }
    setPrintAfterTutorial(false);
  };

  const handleShowTutorial = () => {
    setPrintAfterTutorial(false);
    setShowPrintTutorial(true);
  };

  const handleReset = () => {
    openConfirm("Reset CV to blank data? All changes will be lost.", () => {
      dispatch({ op: "replace", path: "", value: createBlankCVData() });
    });
  };

  const openPanel = useCallback((type: PanelType, sectionId?: string) => {
    setPanel({ type, sectionId });
  }, []);

  const closePanel = useCallback(() => {
    setPanel(null);
  }, []);

  const handleLoadSnapshot = useCallback(
    (data: CVData) => {
      openConfirm("Load this snapshot and replace your current CV?", () => {
        dispatch({ op: "replace", path: "", value: data });
        closePanel();
      });
    },
    [closePanel, dispatch],
  );

  const handleLoadBlank = useCallback(() => {
    openConfirm("Load a blank CV and replace your current CV?", () => {
      dispatch({ op: "replace", path: "", value: createBlankCVData() });
      closePanel();
    });
  }, [closePanel, dispatch]);

  const handleApplyAgentCV = useCallback(
    (data: CVData) => {
      if (!isValidCVData(data)) {
        console.error("[agent] Ignored invalid CV payload", data);
        return;
      }

      dispatch(
        { op: "replace", path: "", value: data },
        { origin: "agent", label: "agent:apply" },
      );
    },
    [dispatch],
  );

  const panelOpen = panel !== null;
  const effectiveWidth = panelOpen ? panelWidth : 0;
  const isMobile = useMediaQuery("(max-width: 767px)");
  const toolbarOffsetX = panelOpen && !isMobile ? panelWidth / 2 : 0;

  return (
    <>
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
      <div
        className="transition-[margin-right] duration-300 ease-in-out"
        style={{ marginRight: isMobile ? 0 : effectiveWidth }}
      >
        <Toolbar
          onReset={handleReset}
          onPrint={handlePrint}
          onAddSection={() => setSectionModalOpen(true)}
          onOpenSaves={() => setPanel({ type: "saves" })}
          onOpenAI={() => setPanel({ type: "agent" })}
          panelOffsetX={toolbarOffsetX}
        />
        {sectionModalOpen && (
          <SectionModal
            onClose={() => setSectionModalOpen(false)}
            onAddSection={addSection}
          />
        )}
        {!showSplash && (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <div id="editor-root">
                <EditorDocument onOpenPanel={openPanel} />
              </div>
              <div id="print-root">
                <PrintDocument doc={cv} />
              </div>
            </Suspense>
          </ErrorBoundary>
        )}
        {confirmModal && (
          <ConfirmModal
            message={confirmModal.message}
            onConfirm={() => {
              confirmModal.onConfirm();
              closeConfirm();
            }}
            onCancel={closeConfirm}
          />
        )}
        {showPrintTutorial && (
          <PrintTutorialModal onClose={handleTutorialClose} />
        )}
        <SidePanel
          open={panelOpen}
          onClose={closePanel}
          width={panelWidth}
          onWidthChange={handlePanelWidthChange}
          title={getPanelTitle(panel)}
          subtitle={getPanelSubtitle(panel, cv)}
          hideHeader={panel?.type === "agent"}
          bodyClassName={
            panel?.type === "agent"
              ? "flex min-h-0 flex-col overflow-hidden !px-0 !py-0"
              : undefined
          }
          bodyScrollable={panel?.type !== "agent"}
        >
          {panel?.type === "saves" && (
            <SavesPanel
              currentCVData={cv}
              onLoadSnapshot={handleLoadSnapshot}
              onLoadBlank={handleLoadBlank}
              onShowTutorial={handleShowTutorial}
            />
          )}
          {panel?.type === "agent" && (
            <AIAssistant
              cv={cv}
              revision={revision}
              onApplyCV={handleApplyAgentCV}
              onClose={closePanel}
            />
          )}
          {panel?.type === "layout-settings" &&
            panel.sectionId != null &&
            (() => {
              const panelSection = cv.sections.find(
                (x) => x.id === panel.sectionId,
              );
              if (!panelSection) return null;
              const panelSIdx = cv.sections.indexOf(panelSection);
              return (
                <SectionLayoutContent
                  section={panelSection}
                  onChangeLayout={(layout) =>
                    dispatch({
                      op: "replace",
                      path: `sections[${panelSIdx}].layout`,
                      value: layout,
                    })
                  }
                />
              );
            })()}
        </SidePanel>
      </div>
      <a
        href="https://abdallahzeine.vercel.app"
        target="_blank"
        rel="noopener noreferrer"
        className="no-print hidden md:block fixed bottom-4 right-4 z-30 rounded-full border border-gray-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-gray-900"
        aria-label="Made by Abdallah Zeine Elabidine"
      >
        Made by Abdallah Zeine Elabidine
      </a>
    </>
  );
}
