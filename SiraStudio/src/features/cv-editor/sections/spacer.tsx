import type { SectionDef } from './registry';
import { uid } from '../../../shared/utils/helpers';
import { builtInSectionSchemas, fieldString } from '../../../shared/utils/cvContent';

function parseSpacerHeight(value: string | undefined): number {
  const plain = (value ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  const parsed = Number.parseInt(plain || '32', 10);
  return Number.isFinite(parsed) ? parsed : 32;
}

const DEFAULT_LAYOUT = {
  dateSlot: 'hidden' as const,
  iconStyle: 'none' as const,
  separator: 'none' as const,
  density: 'normal' as const,
  columns: 1 as const,
};

export const spacerDef: SectionDef = {
  type: 'spacer',
  label: 'Spacer',
  description: 'Empty vertical space between sections',
  defaultTitle: '',
  defaultLayout: DEFAULT_LAYOUT,
  recommendedLayout: DEFAULT_LAYOUT,
  schema: builtInSectionSchemas.spacer,
  allowedLayoutOptions: {
    dateSlot: ['hidden'],
    iconStyle: ['none'],
    separator: ['none'],
    density: ['normal'],
    columns: [1],
  },
  category: 'spacer',
  singleItem: true,
  addItemLabel: '',
  availablePresetIds: [],
  newItem: () => ({ id: uid(), fields: { body: '32' } }),
  renderItemEditor: () => null,
  renderItem: () => null,
  renderItemPrint: ({ item }) => <div style={{ height: parseSpacerHeight(fieldString(item, 'body')) }} />,
};
