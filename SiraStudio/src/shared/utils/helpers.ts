import type { SectionLayout, SectionType } from '../types';

export const uid = () => crypto.randomUUID();

// Default SectionLayout for a given section type (matches classic preset)
export function defaultLayoutFor(type: SectionType): SectionLayout {
  const base = {
    presetId: 'classic' as const,
    iconStyle: 'none' as const,
    separator: 'none' as const,
    density: 'compact' as const,
    columns: 1 as const,
  };
  if (type === 'projects') return { ...base, dateSlot: 'hidden' as const, iconStyle: 'bullet' as const };
  if (type === 'work-experience') return { ...base, dateSlot: 'right-inline' as const, iconStyle: 'bullet' as const };
  if (type === 'summary' || type === 'skills' || type === 'custom') return { ...base, dateSlot: 'hidden' as const };
  return { ...base, dateSlot: 'right-inline' as const };
}
