import type { SectionDef } from './registry';
import { classicLayouts, professionalLayouts } from '../presets';
import { CVTextEditor } from '../editor/CVTextEditor';
import { ItemFrame } from '../layouts/ItemFrame';
import { ItemFramePrint } from '../../print/layouts/ItemFramePrint';
import { SkillGridPrint } from '../../print/layouts/SkillGridPrint';
import { uid } from '../../../shared/utils/helpers';
import { builtInSectionSchemas, fieldString, skillGroupFromItem } from '../../../shared/utils/cvContent';

const renderSkillsEditor: NonNullable<SectionDef['renderItemEditor']> = ({ itemPath, item, layout, index, total, onMove, onDelete }) => (
  <ItemFrame itemId={item.id} density={layout.density} index={index} total={total} onMove={onMove} onDelete={onDelete} path={itemPath}>
    <div className="flex items-baseline gap-1 flex-wrap text-gray-700 text-sm">
      <div className="font-semibold">
        <CVTextEditor value={fieldString(item, 'label')} path={`${itemPath}.fields.label`} placeholder="Category" />
      </div>
      <span>:</span>
      <div>
        <CVTextEditor value={fieldString(item, 'value')} path={`${itemPath}.fields.value`} placeholder="skill1, skill2" />
      </div>
    </div>
  </ItemFrame>
);

export const skillsDef: SectionDef = {
  type: 'skills',
  label: 'Skills',
  description: 'Technical skills and competencies',
  defaultTitle: 'SKILLS',
  defaultLayout: classicLayouts.skills,
  recommendedLayout: professionalLayouts.skills,
  schema: builtInSectionSchemas.skills,
  category: 'body-text',
  allowedLayoutOptions: {
    dateSlot: ['hidden'],
    iconStyle: ['none'],
    separator: ['none', 'space'],
    density: ['compact', 'normal', 'relaxed'],
    columns: [1, 2],
  },
  singleItem: false,
  addItemLabel: 'Add skill category',
  availablePresetIds: ['classic'],
  newItem: () => ({ id: uid(), fields: { label: 'Category', value: 'Skills...' } }),
  renderItemEditor: renderSkillsEditor,
  renderItem: renderSkillsEditor,
  renderItemPrint: ({ item, layout }) => (
    <ItemFramePrint density={layout.density}>
      <SkillGridPrint groups={[skillGroupFromItem(item)]} />
    </ItemFramePrint>
  ),
};
