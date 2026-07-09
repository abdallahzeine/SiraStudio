import type { SectionDef } from './registry';
import { classicLayouts, professionalLayouts } from '../presets';
import { SkillGrid } from '../layouts/SkillGrid';
import { ItemFramePrint } from '../../print/layouts/ItemFramePrint';
import { SkillGridPrint } from '../../print/layouts/SkillGridPrint';
import { uid } from '../../../shared/utils/helpers';

const renderSkillsEditor: NonNullable<SectionDef['renderItemEditor']> = ({ itemPath, item }) => {
  return <SkillGrid path={`${itemPath}.skillGroups`} item={item} />;
};

export const skillsDef: SectionDef = {
  type: 'skills',
  label: 'Skills',
  description: 'Technical skills and competencies',
  defaultTitle: 'SKILLS',
  defaultLayout: classicLayouts.skills,
  recommendedLayout: professionalLayouts.skills,
  category: 'body-text',
  allowedLayoutOptions: {
    dateSlot: ['hidden'],
    iconStyle: ['none'],
    separator: ['none', 'space'],
    density: ['compact', 'normal', 'relaxed'],
    columns: [1, 2],
  },
  singleItem: true,
  addItemLabel: 'Add skills block',
  availablePresetIds: ['classic'],
  newItem: () => ({ id: uid(), skillGroups: [] }),
  renderItemEditor: renderSkillsEditor,
  renderItem: renderSkillsEditor,
  renderItemPrint: ({ item, layout }) => (
    <ItemFramePrint density={layout.density}>
      <SkillGridPrint groups={item.skillGroups ?? []} />
    </ItemFramePrint>
  ),
};
