import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { useSidePanelResize } from "../hooks/useSidePanelResize";

interface SidePanelProps {
  open: boolean;
  onClose: () => void;
  width: number;
  onWidthChange: (w: number) => void;
  title: string;
  subtitle?: string;
  hideHeader?: boolean;
  bodyClassName?: string;
  bodyScrollable?: boolean;
  children: ReactNode;
}

export function SidePanel({
  open,
  onClose,
  width,
  onWidthChange,
  title,
  subtitle,
  hideHeader = false,
  bodyClassName,
  bodyScrollable = true,
  children,
}: SidePanelProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const handleResizeStart = useSidePanelResize(width, onWidthChange);

  useEscapeKey(open, onClose);

  return (
    <>
      {open && isMobile && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <div
        className={`no-print fixed top-0 right-0 bottom-0 z-40 flex transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ width: isMobile ? "100%" : `${width}px` }}
      >
        <div
          onMouseDown={handleResizeStart}
          className="hidden md:block w-1 shrink-0 cursor-col-resize group relative"
        >
          <div className="absolute inset-y-0 -left-1 right-0 group-hover:bg-blue-200/60 group-active:bg-blue-300/60 transition-colors" />
        </div>

        <div className="flex-1 flex flex-col bg-white border-l border-gray-200 overflow-hidden">
          {!hideHeader && (
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                {subtitle && (
                  <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          )}

          <div
            className={`flex-1 px-6 py-5 ${bodyScrollable ? "overflow-y-auto" : "overflow-hidden"} ${bodyClassName ?? ""}`}
          >
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
