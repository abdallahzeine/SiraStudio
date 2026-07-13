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

const renderWorkExperienceEditor: NonNullable<SectionDef['renderItemEditor']> = ({
  itemPath,
  item,
  layout,
  index,
  total,
  onMove,
  onDelete,
}) => {
  const displayDate = fieldString(item, 'date');

  return (
    <ItemFrame itemId={item.id} density={layout.density} index={index} total={total} onMove={onMove} onDelete={onDelete} path={itemPath}>
      <HeadingBlock
        title={fieldString(item, 'title')}
        titlePath={`${itemPath}.fields.title`}
        subtitle={fieldString(item, 'subtitle')}
        subtitlePath={`${itemPath}.fields.subtitle`}
        location={fieldString(item, 'location')}
        locationPath={`${itemPath}.fields.location`}
        date={layout.dateSlot !== 'hidden' ? displayDate : undefined}
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

export const workExperienceDef: SectionDef = {
  type: 'work-experience',
  label: 'Work Experience',
  description: 'Jobs and professional experience',
  defaultTitle: 'WORK EXPERIENCE',
  defaultLayout: classicLayouts['work-experience'],
  recommendedLayout: professionalLayouts['work-experience'],
  schema: builtInSectionSchemas['work-experience'],
  category: 'title-bullets',
  allowedLayoutOptions: {
    dateSlot: ['right-inline', 'below-title', 'hidden'],
    iconStyle: ['none', 'bullet', 'dash', 'chevron'],
    separator: ['none', 'rule', 'space'],
    density: ['compact', 'normal', 'relaxed'],
    columns: [1],
  },
  singleItem: false,
  addItemLabel: 'Add job',
  availablePresetIds: ['classic', 'professional'],
  newItem: () => ({
    id: uid(),
    fields: {
      title: '',
      subtitle: '',
      location: '',
      date: '',
      bullets: [{ id: uid(), text: '' }],
    },
  }),
  renderItemEditor: renderWorkExperienceEditor,
  renderItem: renderWorkExperienceEditor,
  renderItemPrint: ({ item, layout }) => {
    const displayDate = fieldString(item, 'date');

    return (
      <ItemFramePrint density={layout.density}>
        <HeadingBlockPrint
          title={fieldString(item, 'title')}
          subtitle={fieldString(item, 'subtitle')}
          location={fieldString(item, 'location')}
          date={layout.dateSlot !== 'hidden' ? displayDate : undefined}
          dateSlot={layout.dateSlot}
          titleClassName="text-base font-semibold"
          subtitleClassName="text-gray-700 text-sm"
        />
        <BulletListPrint bullets={fieldBulletArray(item, 'bullets')} iconStyle={layout.iconStyle} />
      </ItemFramePrint>
    );
  },
};
