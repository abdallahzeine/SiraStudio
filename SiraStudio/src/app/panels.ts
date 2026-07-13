import { sectionRegistry } from '../features/cv-editor/sections/registry';
import type { CVData } from '../shared/types';

export type PanelType = 'layout-settings' | 'saves';

export interface PanelState {
  type: PanelType;
  sectionId?: string;
}

export function getPanelTitle(panel: PanelState | null): string {
  if (panel?.type === 'layout-settings') return 'Layout Settings';
  if (panel?.type === 'saves') return 'Saved CVs';
  return '';
}

export function getPanelSubtitle(panel: PanelState | null, cv: CVData): string | undefined {
  if (panel?.type !== 'layout-settings' || panel.sectionId == null) {
    return undefined;
  }

  const section = cv.sections.find((candidate) => candidate.id === panel.sectionId);
  if (!section) return undefined;

  return `${(sectionRegistry[section.type] ?? sectionRegistry.custom).label} · ${section.title}`;
}
