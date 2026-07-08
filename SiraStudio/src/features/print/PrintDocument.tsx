import type { CVData } from '../../shared/types';
import { SingleColumn } from '../cv-editor/templates/SingleColumn';
import { SidebarLayout } from '../cv-editor/templates/SidebarLayout';
import { HeaderPrint } from './HeaderPrint';
import { SectionListPrint } from './SectionListPrint';

interface PrintDocumentProps {
  doc: CVData;
}

export function PrintDocument({ doc }: PrintDocumentProps) {
  const TemplateShell = doc.template.id === 'single-column' ? SingleColumn : SidebarLayout;

  return (
    <TemplateShell documentId="cv-document-print" documentClassName="cv-document-print">
      <HeaderPrint header={doc.header} />
      <SectionListPrint sections={doc.sections} dateFormat={doc.dateFormat ?? 'MM/YYYY'} />
    </TemplateShell>
  );
}
