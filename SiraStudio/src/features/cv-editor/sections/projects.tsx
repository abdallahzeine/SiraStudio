import type { SectionDef } from './registry';
import { classicLayouts, professionalLayouts } from '../presets';
import { BulletList } from '../layouts/BulletList';
import { CVTextEditor } from '../editor/CVTextEditor';
import { ItemFrame } from '../layouts/ItemFrame';
import { BulletListPrint } from '../../print/layouts/BulletListPrint';
import { HeadingBlockPrint } from '../../print/layouts/HeadingBlockPrint';
import { ItemFramePrint } from '../../print/layouts/ItemFramePrint';
import { uid } from '../../../shared/utils/helpers';
import { builtInSectionSchemas, fieldString, fieldStringArray } from '../../../shared/utils/cvContent';

const renderProjectsEditor: NonNullable<SectionDef['renderItemEditor']> = ({
  itemPath,
  item,
  layout,
  index,
  total,
  onMove,
  onDelete,
}) => {
  const title = fieldString(item, 'title');
  const date = fieldString(item, 'date');
  const dateEl = layout.dateSlot !== 'hidden' && date ? (
    <span className="text-gray-500 text-sm whitespace-nowrap">
      <CVTextEditor
        value={date}
        path={`${itemPath}.fields.date`}
        placeholder="MM/YYYY"
      />
    </span>
  ) : null;

  let titleRow: React.ReactNode;
  if (layout.dateSlot === 'right-inline') {
    titleRow = (
      <div className="flex justify-between items-start gap-2">
        <h3 className="text-base font-semibold leading-tight">
          <CVTextEditor
            value={title}
            path={`${itemPath}.fields.title`}
            placeholder="Project Name"
          />
        </h3>
        {dateEl && <div className="shrink-0">{dateEl}</div>}
      </div>
    );
  } else if (layout.dateSlot === 'left-margin') {
    const hasDate = date.trim() !== '';
    titleRow = (
      <h3 className="text-base font-semibold leading-tight">
        <CVTextEditor
          value={title}
          path={`${itemPath}.fields.title`}
          placeholder="Project Name"
        />
        {hasDate && <><span className="text-gray-400 mx-1">–</span>{dateEl}</>}
      </h3>
    );
  } else if (layout.dateSlot === 'below-title') {
    titleRow = (
      <div>
        <h3 className="text-base font-semibold leading-tight">
          <CVTextEditor
            value={title}
            path={`${itemPath}.fields.title`}
            placeholder="Project Name"
          />
        </h3>
        {dateEl && <div className="leading-tight">{dateEl}</div>}
      </div>
    );
  } else {
    titleRow = (
      <h3 className="text-base font-semibold leading-tight">
        <CVTextEditor
          value={title}
          path={`${itemPath}.fields.title`}
          placeholder="Project Name"
        />
      </h3>
    );
  }

  return (
    <ItemFrame itemId={item.id} density={layout.density} index={index} total={total} onMove={onMove} onDelete={onDelete} path={itemPath}>
      {titleRow}
      <BulletList
        bullets={fieldStringArray(item, 'bullets')}
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
  newItem: () => ({ id: uid(), fields: { title: 'New Project', subtitle: '', date: '', bullets: ['Description...'] } }),
  renderItemEditor: renderProjectsEditor,
  renderItem: renderProjectsEditor,
  renderItemPrint: ({ item, layout }) => (
    <ItemFramePrint density={layout.density}>
      <HeadingBlockPrint
        title={fieldString(item, 'title')}
        date={fieldString(item, 'date')}
        dateSlot={layout.dateSlot}
        titleClassName="text-base font-semibold"
        subtitleClassName="text-gray-700 text-sm"
      />
      <BulletListPrint bullets={fieldStringArray(item, 'bullets')} iconStyle={layout.iconStyle} />
    </ItemFramePrint>
  ),
};
