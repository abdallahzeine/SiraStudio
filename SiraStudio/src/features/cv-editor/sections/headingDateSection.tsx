import type { CVItem, IconStyle, SectionLayout, SectionType } from '../../../shared/types';
import { HeadingBlock } from '../layouts/HeadingBlock';
import { ItemFrame } from '../layouts/ItemFrame';
import { HeadingBlockPrint } from '../../print/layouts/HeadingBlockPrint';
import { ItemFramePrint } from '../../print/layouts/ItemFramePrint';
import { uid } from '../../../shared/utils/helpers';
import type { AllowedLayoutOptions, SectionDef } from './registry';

type SecondaryField = 'subtitle' | 'role';

interface HeadingDateSectionConfig {
  type: SectionType;
  label: string;
  description: string;
  defaultTitle: string;
  defaultLayout: SectionLayout;
  recommendedLayout: SectionLayout;
  addItemLabel: string;
  iconStyle: IconStyle[];
  secondaryField: SecondaryField;
  newItem?: () => CVItem;
}

const baseLayoutOptions = {
  dateSlot: ['right-inline', 'below-title', 'left-margin', 'hidden'],
  separator: ['none', 'rule', 'dot', 'space'],
  density: ['compact', 'normal', 'relaxed'],
  columns: [1, 2],
} satisfies Omit<AllowedLayoutOptions, 'iconStyle'>;

const blankHeadingDateItem = () => ({ id: uid(), title: '', subtitle: '', date: '' });

function renderEditor(field: SecondaryField): NonNullable<SectionDef['renderItemEditor']> {
  return ({ itemPath, item, layout, index, total, onMove, onDelete }) => (
    <ItemFrame itemId={item.id} density={layout.density} index={index} total={total} onMove={onMove} onDelete={onDelete} path={itemPath}>
      <HeadingBlock
        title={item.title ?? ''}
        titlePath={`${itemPath}.title`}
        subtitle={field === 'subtitle' ? item.subtitle ?? '' : undefined}
        subtitlePath={field === 'subtitle' ? `${itemPath}.subtitle` : undefined}
        role={field === 'role' ? item.role ?? '' : undefined}
        rolePath={field === 'role' ? `${itemPath}.role` : undefined}
        date={item.date ?? ''}
        datePath={`${itemPath}.date`}
        dateSlot={layout.dateSlot}
      />
    </ItemFrame>
  );
}

function renderPrint(field: SecondaryField): NonNullable<SectionDef['renderItemPrint']> {
  return ({ item, layout }) => (
    <ItemFramePrint density={layout.density}>
      <HeadingBlockPrint
        title={item.title ?? ''}
        subtitle={field === 'subtitle' ? item.subtitle : undefined}
        role={field === 'role' ? item.role : undefined}
        date={item.date}
        dateSlot={layout.dateSlot}
      />
    </ItemFramePrint>
  );
}

export function createHeadingDateSectionDef(config: HeadingDateSectionConfig): SectionDef {
  const renderItemEditor = renderEditor(config.secondaryField);

  return {
    type: config.type,
    label: config.label,
    description: config.description,
    defaultTitle: config.defaultTitle,
    defaultLayout: config.defaultLayout,
    recommendedLayout: config.recommendedLayout,
    category: 'heading-date',
    allowedLayoutOptions: {
      ...baseLayoutOptions,
      iconStyle: config.iconStyle,
    },
    singleItem: false,
    addItemLabel: config.addItemLabel,
    availablePresetIds: ['classic'],
    newItem: config.newItem ?? blankHeadingDateItem,
    renderItemEditor,
    renderItem: renderItemEditor,
    renderItemPrint: renderPrint(config.secondaryField),
  };
}
