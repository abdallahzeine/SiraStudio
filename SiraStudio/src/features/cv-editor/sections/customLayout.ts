import type { CustomFieldDef, SectionLayout } from '../../../shared/types';
import { classicLayouts } from '../presets';

export type CustomSectionPreset = 'work-experience' | 'projects' | 'education';

function hasFieldKinds(fields: CustomFieldDef[], kinds: CustomFieldDef['kind'][]): boolean {
  return fields.length === kinds.length && fields.every((field, index) => field.kind === kinds[index]);
}

export function customSectionPresetFor(fields: CustomFieldDef[]): CustomSectionPreset | null {
  if (hasFieldKinds(fields, ['text', 'text', 'text', 'date', 'bullets'])) return 'work-experience';
  if (hasFieldKinds(fields, ['text', 'date', 'bullets'])) return 'projects';
  if (hasFieldKinds(fields, ['text', 'text', 'date'])) return 'education';
  return null;
}

export function customSectionDefaultLayout(fields: CustomFieldDef[]): SectionLayout {
  return classicLayouts[customSectionPresetFor(fields) ?? 'custom'];
}
