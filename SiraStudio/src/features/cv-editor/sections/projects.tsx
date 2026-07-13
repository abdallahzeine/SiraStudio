import type { SectionDef } from './registry';
import { classicLayouts, professionalLayouts } from '../presets';
import { BulletList } from '../layouts/BulletList';
import { HeadingBlock } from '../layouts/HeadingBlock';
import { ItemFrame } from '../layouts/ItemFrame';
import { BulletListPrint } from '../../print/layouts/BulletListPrint';
import { HeadingBlockPrint } from '../../print/layouts/HeadingBlockPrint';
import { ItemFramePrint } from '../../print/layouts/ItemFramePrint';
import { uid } from '../../../shared/utils/helpers';
import { builtInSectionSchemas, fieldBulletArray, fieldString } from '../../../shared/utils/cvContent';

const renderProjectsEditor: NonNullable<SectionDef['renderItemEditor']> = ({
  itemPath,
  item,
  layout,
  index,
  total,
  onMove,
  onDelete,
}) => {
  return (
    <ItemFrame itemId={item.id} density={layout.density} index={index} total={total} onMove={onMove} onDelete={onDelete} path={itemPath}>
      <HeadingBlock
        title={fieldString(item, 'title')}
        titlePath={`${itemPath}.fields.title`}
        titlePlaceholder="Project Name"
        subtitle={fieldString(item, 'subtitle')}
        subtitlePath={`${itemPath}.fields.subtitle`}
        subtitlePlaceholder="Tech Stack"
        date={layout.dateSlot !== 'hidden' ? fieldString(item, 'date') : undefined}
        datePath={`${itemPath}.fields.date`}
        dateSlot={layout.dateSlot}
        titleClassName="text-base font-semibold"
        subtitleClassName="text-gray-700 text-sm"
      />
      <BulletList
        bullets={fieldBulletArray(item, 'bullets')}
        bulletsPath={`${itemPath}.fields.bullets`}
        iconStyle={layout.iconStyle}
      />
    </ItemFrame>
  );
};

export const projectsDef: SectionDef = {
  type: 'projects',
  label: 'Projects',
  description: 'Project descriptions with achievements',
  defaultTitle: 'PROJECTS',
  defaultLayout: classicLayouts.projects,
  recommendedLayout: professionalLayouts.projects,
  schema: builtInSectionSchemas.projects,
  category: 'title-bullets',
  allowedLayoutOptions: {
    dateSlot: ['hidden', 'right-inline', 'left-margin', 'below-title'],
    iconStyle: ['none', 'bullet', 'dash', 'chevron'],
    separator: ['none', 'rule', 'space'],
    density: ['compact', 'normal', 'relaxed'],
    columns: [1],
  },
  singleItem: false,
  addItemLabel: 'Add project',
  availablePresetIds: ['classic'],
  newItem: () => ({ id: uid(), fields: { title: 'New Project', subtitle: '', date: '', bullets: [{ id: uid(), text: 'Description...' }] } }),
  renderItemEditor: renderProjectsEditor,
  renderItem: renderProjectsEditor,
  renderItemPrint: ({ item, layout }) => (
    <ItemFramePrint density={layout.density}>
      <HeadingBlockPrint
        title={fieldString(item, 'title')}
        subtitle={fieldString(item, 'subtitle')}
        date={fieldString(item, 'date')}
        dateSlot={layout.dateSlot}
        titleClassName="text-base font-semibold"
        subtitleClassName="text-gray-700 text-sm"
      />
      <BulletListPrint bullets={fieldBulletArray(item, 'bullets')} iconStyle={layout.iconStyle} />
    </ItemFramePrint>
  ),
};
