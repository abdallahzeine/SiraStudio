import { ExternalLink, Link2, Printer } from 'lucide-react';
import { Modal } from './Modal';

interface PrintTutorialModalProps {
  open: boolean;
  onClose: () => void;
  onPrint: () => void;
  onEditPageBreaks: () => void;
}

export function PrintTutorialModal({
  open,
  onClose,
  onPrint,
  onEditPageBreaks,
}: PrintTutorialModalProps) {
  return (
    <Modal open={open} title="Print your CV" onClose={onClose} size="md">
      <div className="space-y-5 p-5">
        <a
          href="https://www.youtube.com/watch?v=s5pcHc9YiwA"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
        >
          How to save your CV as PDF
          <ExternalLink size={16} />
        </a>

        <section className="border-t border-gray-200 pt-5">
          <h3 className="text-sm font-semibold text-gray-900">Print options</h3>
          <p className="mt-1 text-sm text-gray-500">
            Choose sections or entries that should stay together on the same page.
          </p>
          <button
            type="button"
            onClick={onEditPageBreaks}
            className="mt-3 flex w-full items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <Link2 size={17} />
            </span>
            <span>
              <span className="block text-sm font-medium text-gray-800">Page-break layout</span>
              <span className="block text-xs text-gray-500">Keep selected content together when printing</span>
            </span>
          </button>
        </section>
      </div>

      <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onPrint}
          className="flex items-center gap-2 rounded-lg bg-[#0078D7] px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Printer size={15} />
          Continue to print
        </button>
      </div>
    </Modal>
  );
}
