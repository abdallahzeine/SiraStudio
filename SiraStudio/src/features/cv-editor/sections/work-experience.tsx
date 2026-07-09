import type { SectionDef } from './registry';
import { classicLayouts, professionalLayouts } from '../presets';
import { BulletList } from '../layouts/BulletList';
import { HeadingBlock } from '../layouts/HeadingBlock';
import { ItemFrame } from '../layouts/ItemFrame';
import { BulletListPrint } from '../../print/layouts/BulletListPrint';
import { HeadingBlockPrint } from '../../print/layouts/HeadingBlockPrint';
import { ItemFramePrint } from '../../print/layouts/ItemFramePrint';
import { uid } from '../../../shared/utils/helpers';
import { dateRangeString } from '../../../shared/utils/dateUtils';

const renderWorkExperienceEditor: NonNullable<SectionDef['renderItemEditor']> = ({
  itemPath,
  item,
  layout,
  index,
  total,
  onMove,
  onDelete,
}) => {
  const fmt = 'MM/YYYY';
  const legacyDate =
    item.dateStart || item.dateEnd
      ? dateRangeString(item.dateStart, item.dateEnd, fmt)
      : (item.date ?? '');
  const displayDate = item.date ?? legacyDate;

  return (
    <ItemFrame itemId={item.id} density={layout.density} index={index} total={total} onMove={onMove} onDelete={onDelete} path={itemPath}>
      <HeadingBlock
        title={item.title ?? ''}
        titlePath={`${itemPath}.title`}
        subtitle={item.subtitle ?? ''}
        subtitlePath={`${itemPath}.subtitle`}
        location={item.location ?? ''}
        locationPath={`${itemPath}.location`}
        date={layout.dateSlot !== 'hidden' ? displayDate : undefined}
        datePath={`${itemPath}.date`}
        dateSlot={layout.dateSlot}
        titleClassName="text-base font-semibold"
        subtitleClassName="text-gray-700 text-sm"
      />
      <BulletList
        bullets={item.bullets ?? []}
        bulletsPath={`${itemPath}.bullets`}
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
    title: '',
    subtitle: '',
    location: '',
    date: '',
    bullets: [''],
  }),
  renderItemEditor: renderWorkExperienceEditor,
  renderItem: renderWorkExperienceEditor,
  renderItemPrint: ({ item, layout, dateFormat }) => {
    const legacyDate =
      item.dateStart || item.dateEnd
        ? dateRangeString(item.dateStart, item.dateEnd, dateFormat)
        : (item.date ?? '');
    const displayDate = item.date ?? legacyDate;

    return (
      <ItemFramePrint density={layout.density}>
        <HeadingBlockPrint
          title={item.title ?? ''}
          subtitle={item.subtitle}
          location={item.location}
          date={layout.dateSlot !== 'hidden' ? displayDate : undefined}
          dateSlot={layout.dateSlot}
          titleClassName="text-base font-semibold"
          subtitleClassName="text-gray-700 text-sm"
        />
        <BulletListPrint bullets={item.bullets ?? []} iconStyle={layout.iconStyle} />
      </ItemFramePrint>
    );
  },
};
