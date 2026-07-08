interface SingleColumnProps {
  children: React.ReactNode;
  documentId?: string;
  documentClassName?: string;
}

/** Single-column page layout. Wraps children in the CV document shell. */
export function SingleColumn({ children, documentId, documentClassName }: SingleColumnProps) {
  const className = [
    'cv-document cv-document-enter',
    'bg-white w-[88%] sm:w-full max-w-4xl mx-auto shadow-md rounded-sm px-1.5 sm:px-3 md:px-8 lg:px-9 py-2 sm:py-4 md:py-8 font-sans text-gray-800 leading-normal print:shadow-none print:rounded-none print:max-w-full print:px-0 print:py-0',
    documentClassName,
  ].filter(Boolean).join(' ');

  return (
    <main className="grid-dots-static min-h-screen pt-2 sm:pt-8 pb-32 md:pb-24 px-0 sm:px-4 flex justify-center print:pt-0 print:pb-0 print:px-0 print:block print:min-h-0 print:bg-white">
      <div
        id={documentId}
        className={className}
      >
        {children}
      </div>
    </main>
  );
}
