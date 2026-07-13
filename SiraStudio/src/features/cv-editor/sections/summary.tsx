import type { SectionDef } from './registry';
import { classicLayouts, professionalLayouts } from '../presets';
import { BodyBlock } from '../layouts/BodyBlock';
import { ItemFrame } from '../layouts/ItemFrame';
import { BodyBlockPrint } from '../../print/layouts/BodyBlockPrint';
import { ItemFramePrint } from '../../print/layouts/ItemFramePrint';
import { uid } from '../../../shared/utils/helpers';
import { builtInSectionSchemas, fieldString } from '../../../shared/utils/cvContent';

const renderSummaryEditor: NonNullable<SectionDef['renderItemEditor']> = ({ itemPath, item, layout, index, total, onMove, onDelete }) => (
  <ItemFrame itemId={item.id} density={layout.density} index={index} total={total} onMove={onMove} onDelete={onDelete} path={itemPath} hideControls>
    <BodyBlock
      value={fieldString(item, 'body')}
      path={`${itemPath}.fields.body`}
      placeholder="Write your professional summary..."
    />
  </ItemFrame>
);

export const summaryDef: SectionDef = {
  type: 'summary',
  label: 'Professional Summary',
  description: 'A brief overview of your professional background',
  defaultTitle: 'PROFESSIONAL SUMMARY',
  defaultLayout: classicLayouts.summary,
  recommendedLayout: professionalLayouts.summary,
  schema: builtInSectionSchemas.summary,
  category: 'body-text',
  allowedLayoutOptions: {
    dateSlot: ['hidden'],
    iconStyle: ['none'],
    separator: ['none', 'space'],
    density: ['compact', 'normal', 'relaxed'],
    columns: [1],
  },
  singleItem: true,
  addItemLabel: 'Add paragraph',
  availablePresetIds: ['classic'],
  newItem: () => ({ id: uid(), fields: { body: '' } }),
  renderItemEditor: renderSummaryEditor,
  renderItem: renderSummaryEditor,
  renderItemPrint: ({ item, layout }) => (
    <ItemFramePrint density={layout.density}>
      <BodyBlockPrint value={fieldString(item, 'body')} />
    </ItemFramePrint>
  ),
};
