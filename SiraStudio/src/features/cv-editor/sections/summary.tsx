import type { SectionDef } from './registry';
import { classicLayouts, professionalLayouts } from '../presets';
import { BodyBlock } from '../layouts/BodyBlock';
import { BodyBlockPrint } from '../../print/layouts/BodyBlockPrint';
import { ItemFramePrint } from '../../print/layouts/ItemFramePrint';
import { uid } from '../../../shared/utils/helpers';

const renderSummaryEditor: NonNullable<SectionDef['renderItemEditor']> = ({ itemPath, item }) => (
  <BodyBlock
    value={item.body ?? ''}
    path={`${itemPath}.body`}
    placeholder="Write your professional summary..."
  />
);

export const summaryDef: SectionDef = {
  type: 'summary',
  label: 'Professional Summary',
  description: 'A brief overview of your professional background',
  defaultTitle: 'PROFESSIONAL SUMMARY',
  defaultLayout: classicLayouts.summary,
  recommendedLayout: professionalLayouts.summary,
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
  newItem: () => ({ id: uid(), body: '' }),
  renderItemEditor: renderSummaryEditor,
  renderItem: renderSummaryEditor,
  renderItemPrint: ({ item, layout }) => (
    <ItemFramePrint density={layout.density}>
      <BodyBlockPrint value={item.body ?? ''} />
    </ItemFramePrint>
  ),
};
