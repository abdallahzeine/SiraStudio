import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import type { CVData, SocialLink } from "../shared/types";
import type { Patch } from "./store";
import { Toolbar } from "../features/cv-editor/components/Toolbar";
import { SavesPanel } from "../features/saves/SavesPanel";
import { useBackendDocumentAutosave } from "../features/saves/hooks/useBackendDocumentAutosave";
import { AIAssistant } from "../features/assistant/AIAssistant";
import { ConfirmModal } from "../shared/components/ConfirmModal";
import { SplashScreen } from "../shared/components/SplashScreen";
import { PrintTutorialModal } from "../shared/components/PrintTutorialModal.tsx";
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
import { useUndoRedoShortcuts } from "./hooks/useUndoRedoShortcuts";
import { useCVSelector, useDispatch, useHistory } from "./store";
import {
  PrintLayoutContext,
  printBlockKey,
  type PrintBlockKind,
} from "../features/cv-editor/printLayoutContext";

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
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [panelWidth, setPanelWidth] = useState(loadSidePanelWidth);
  const [confirmModal, setConfirmModal] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [showPrintTutorial, setShowPrintTutorial] = useState(false);
  const [printLayoutMode, setPrintLayoutMode] = useState(false);
  const [printSelection, setPrintSelection] = useState<Set<string>>(new Set());
  const [printLayoutMessage, setPrintLayoutMessage] = useState("Select adjacent blocks, then keep them together.");

  useEffect(() => {
    void import("../features/cv-editor/editor/EditorDocument");
    void import("../features/print/PrintDocument");
  }, []);

  const openConfirm = (message: string, action: () => void) =>
    setConfirmModal({ message, onConfirm: action });
  const closeConfirm = () => setConfirmModal(null);

  useUndoRedoShortcuts(dispatch, history);
  useBackendDocumentAutosave(cv, revision);

  const handlePanelWidthChange = useCallback((w: number) => {
    setPanelWidth(w);
    saveSidePanelWidth(w);
  }, []);

  const handlePrint = () => {
    setPanel(null);
    setShowPrintTutorial(true);
  };

  const handleContinueToPrint = () => {
    setShowPrintTutorial(false);
    setTimeout(() => window.print(), 300);
  };

  const handleShowTutorial = () => {
    setShowPrintTutorial(true);
  };

  const openPrintLayoutMode = () => {
    setShowPrintTutorial(false);
    setPrintLayoutMode(true);
    setPrintSelection(new Set());
    setPrintLayoutMessage("Select adjacent blocks, then keep them together.");
  };

  const protectedPrintBlocks = new Set<string>();
  cv.sections.forEach((section) => {
    if (section.keepTogetherGroup) protectedPrintBlocks.add(printBlockKey("section", section.id));
    section.content.items.forEach((item) => {
      if (item.keepTogetherGroup) protectedPrintBlocks.add(printBlockKey("item", item.id));
    });
  });

  const togglePrintBlock = useCallback((kind: PrintBlockKind, id: string) => {
    const key = printBlockKey(kind, id);
    setPrintSelection((current) => {
      const next = new Set([...current].filter((entry) => entry.startsWith(`${kind}:`)));
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setPrintLayoutMessage("Select adjacent blocks, then choose an action.");
  }, []);

  const togglePrintLayoutMode = () => {
    setPrintLayoutMode((enabled) => !enabled);
    setPrintSelection(new Set());
    setPrintLayoutMessage("Select adjacent blocks, then keep them together.");
    setPanel(null);
  };

  const selectedPrintTargets = () => {
    const targets: { path: string; group?: string; sectionIndex: number; itemIndex?: number }[] = [];

    printSelection.forEach((key) => {
      if (key.startsWith("section:")) {
        const id = key.slice("section:".length);
        const sectionIndex = cv.sections.findIndex((section) => section.id === id);
        if (sectionIndex >= 0) {
          targets.push({
            path: `sections[${sectionIndex}].keepTogetherGroup`,
            group: cv.sections[sectionIndex].keepTogetherGroup,
            sectionIndex,
          });
        }
        return;
      }

      const id = key.slice("item:".length);
      cv.sections.some((section, sectionIndex) => {
        const itemIndex = section.content.items.findIndex((item) => item.id === id);
        if (itemIndex < 0) return false;
        targets.push({
          path: `sections[${sectionIndex}].content.items[${itemIndex}].keepTogetherGroup`,
          group: section.content.items[itemIndex].keepTogetherGroup,
          sectionIndex,
          itemIndex,
        });
        return true;
      });
    });

    return targets;
  };

  const keepPrintSelectionTogether = () => {
    const targets = selectedPrintTargets();
    if (targets.length === 0) {
      setPrintLayoutMessage("Select at least one section or entry first.");
      return;
    }

    const isItemSelection = targets[0].itemIndex !== undefined;
    if (targets.some((target) => (target.itemIndex !== undefined) !== isItemSelection)) {
      setPrintLayoutMessage("Select sections or entries, not both at once.");
      return;
    }
    if (isItemSelection && targets.some((target) => target.sectionIndex !== targets[0].sectionIndex)) {
      setPrintLayoutMessage("Choose entries from the same section.");
      return;
    }

    const positions = targets
      .map((target) => isItemSelection ? target.itemIndex! : target.sectionIndex)
      .sort((a, b) => a - b);
    if (positions.some((position, index) => index > 0 && position !== positions[index - 1] + 1)) {
      setPrintLayoutMessage("Choose adjacent blocks so they can stay together.");
      return;
    }

    const group = crypto.randomUUID();
    const result = dispatch(
      targets.map<Patch>((target) => ({ op: "set", path: target.path, value: group })),
      { origin: "editor", label: "print:keep-together" },
    );
    if (!result.success) {
      setPrintLayoutMessage("The print setting could not be applied. Please try again.");
      return;
    }
    setPrintSelection(new Set());
    setPrintLayoutMessage(`${targets.length} block${targets.length === 1 ? "" : "s"} will stay together when printing.`);
  };

  const allowPrintSelectionToBreak = () => {
    const targets = selectedPrintTargets().filter((target) => target.group !== undefined);
    if (targets.length === 0) {
      setPrintLayoutMessage("The selected blocks already allow page breaks.");
      return;
    }

    const result = dispatch(
      targets.map<Patch>((target) => ({ op: "delete", path: target.path })),
      { origin: "editor", label: "print:allow-break" },
    );
    if (!result.success) {
      setPrintLayoutMessage("The print setting could not be removed. Please try again.");
      return;
    }
    setPrintSelection(new Set());
    setPrintLayoutMessage("The selected blocks may now split across pages.");
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
        return false;
      }

      return dispatch(
        { op: "replace", path: "", value: data },
        { origin: "agent", label: "agent:apply" },
      ).success;
    },
    [dispatch],
  );

  const panelOpen = panel !== null;
  const effectiveWidth = panelOpen ? panelWidth : 0;
  const isMobile = useMediaQuery("(max-width: 767px)");
  const mustRotate = useMediaQuery(
    "screen and (max-width: 767px) and (orientation: portrait)",
  );
  const toolbarOffsetX = panelOpen && !isMobile ? panelWidth / 2 : 0;

  return (
    <>
      {mustRotate && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950 px-8 text-center text-white">
          <div className="max-w-sm">
            <div className="mb-6 text-6xl" aria-hidden="true">
              ↻
            </div>
            <h1 className="text-2xl font-semibold">Rotate your phone</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Turn your phone sideways to edit and work with your CV.
            </p>
          </div>
        </div>
      )}
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
      <div
        className="transition-[margin-right] duration-300 ease-in-out"
        style={{ marginRight: isMobile ? 0 : effectiveWidth }}
      >
        <Toolbar
          onReset={handleReset}
          onPrint={handlePrint}
          onOpenSaves={() => setPanel({ type: "saves" })}
          onOpenAI={() => setPanel({ type: "agent" })}
          panelOffsetX={toolbarOffsetX}
          printLayoutMode={printLayoutMode}
          printSelectionCount={printSelection.size}
          printLayoutMessage={printLayoutMessage}
          onTogglePrintLayoutMode={togglePrintLayoutMode}
          onKeepTogether={keepPrintSelectionTogether}
          onAllowBreak={allowPrintSelectionToBreak}
        />
        {!showSplash && (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <div id="editor-root">
                <PrintLayoutContext.Provider value={{
                  enabled: printLayoutMode,
                  selected: printSelection,
                  protectedBlocks: protectedPrintBlocks,
                  toggle: togglePrintBlock,
                }}>
                  <EditorDocument onOpenPanel={openPanel} />
                </PrintLayoutContext.Provider>
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
        <PrintTutorialModal
          open={showPrintTutorial}
          onClose={() => setShowPrintTutorial(false)}
          onPrint={handleContinueToPrint}
          onEditPageBreaks={openPrintLayoutMode}
        />
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
              const itemLinksPath = (itemIndex: number) =>
                `sections[${panelSIdx}].content.items[${itemIndex}].links`;
              const itemLinks = (itemIndex: number): SocialLink[] =>
                panelSection.content.items[itemIndex]?.links ?? [];

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
                  onAddItemLink={(itemIndex, link) => {
                    const path = itemLinksPath(itemIndex);
                    if (!panelSection.content.items[itemIndex]?.links) {
                      dispatch({ op: "set", path, value: [link] });
                      return;
                    }
                    dispatch({
                      op: "insert",
                      path: `${path}[-1]`,
                      value: link,
                    });
                  }}
                  onUpdateItemLink={(itemIndex, linkIndex, link) =>
                    dispatch({
                      op: "replace",
                      path: `${itemLinksPath(itemIndex)}[${linkIndex}]`,
                      value: link,
                    })
                  }
                  onDeleteItemLink={(itemIndex, linkIndex) =>
                    dispatch({
                      op: "delete",
                      path: `${itemLinksPath(itemIndex)}[${linkIndex}]`,
                    })
                  }
                  onReorderItemLinks={(itemIndex, fromIndex, toIndex) => {
                    if (fromIndex === toIndex) return;
                    const links = itemLinks(itemIndex);
                    if (
                      fromIndex < 0 ||
                      toIndex < 0 ||
                      fromIndex >= links.length ||
                      toIndex >= links.length
                    ) {
                      return;
                    }
                    dispatch({
                      op: "move",
                      from: `${itemLinksPath(itemIndex)}[${fromIndex}]`,
                      path: `${itemLinksPath(itemIndex)}[${toIndex}]`,
                    });
                  }}
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
