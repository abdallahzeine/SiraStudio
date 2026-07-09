import type { SectionDef } from './registry';
import type { CustomFieldDef, CVItem, SectionLayout } from '../../../shared/types';
import { classicLayouts, professionalLayouts } from '../presets';
import { CVTextEditor } from '../editor/CVTextEditor';
import { BulletList } from '../layouts/BulletList';
import { ItemFrame } from '../layouts/ItemFrame';
import { BulletListPrint } from '../../print/layouts/BulletListPrint';
import { ItemFramePrint } from '../../print/layouts/ItemFramePrint';
import { PrintRichText } from '../../print/PrintRichText';
import { uid } from '../../../shared/utils/helpers';

function renderCustomFields(
  path: string,
  item: CVItem,
  fields: CustomFieldDef[],
  layout: SectionLayout,
) {
  if (fields.length === 0) {
    return <p className="text-xs text-gray-400 italic">No fields defined. Edit section schema.</p>;
  }
  return (
    <div className="space-y-0.5 text-sm text-gray-700">
      {fields.map((field) => {
        const values = item.values ?? {};
        const val = values[field.key];

        if (field.kind === 'bullets') {
          const bullets = Array.isArray(val) ? val : [];
          return (
            <div key={field.key}>
              <span className="font-medium text-xs text-gray-500 block mb-0.5">{field.label}</span>
              <BulletList
                bullets={bullets}
                bulletsPath={`${path}.values.${field.key}`}
                iconStyle={layout.iconStyle}
              />
            </div>
          );
        }

        const strVal = typeof val === 'string' ? val : '';

        if (field.kind === 'multiline') {
          return (
            <div key={field.key}>
              <span className="font-medium text-xs text-gray-500 block mb-0.5">{field.label}</span>
              <CVTextEditor
                multiline
                value={strVal}
                path={`${path}.values.${field.key}`}
                placeholder={field.placeholder ?? `Enter ${field.label}...`}
                className="text-gray-700 text-sm leading-relaxed"
              />
            </div>
          );
        }

        return (
          <div key={field.key} className="flex items-baseline gap-2 flex-wrap">
            <span className="font-semibold shrink-0">{field.label}:</span>
            <CVTextEditor
              value={strVal}
              path={`${path}.values.${field.key}`}
              placeholder={field.placeholder ?? `Enter ${field.label}...`}
            />
          </div>
        );
      })}
    </div>
  );
}

function renderCustomFieldsPrint(
  item: CVItem,
  fields: CustomFieldDef[],
  iconStyle: SectionLayout['iconStyle'],
) {
  if (fields.length === 0) {
    return <p className="text-xs text-gray-400 italic">No fields defined.</p>;
  }

  const values = item.values ?? {};

  return (
    <div className="space-y-0.5 text-sm text-gray-700">
      {fields.map((field) => {
        const value = values[field.key];

        if (field.kind === 'bullets') {
          const bullets = Array.isArray(value) ? value : [];
          return (
            <div key={field.key}>
              <span className="font-medium text-xs text-gray-500 block mb-0.5">{field.label}</span>
              <BulletListPrint bullets={bullets} iconStyle={iconStyle} />
            </div>
          );
        }

        if (field.kind === 'multiline') {
          return (
            <div key={field.key}>
              <span className="font-medium text-xs text-gray-500 block mb-0.5">{field.label}</span>
              <PrintRichText
                value={typeof value === 'string' ? value : ''}
                className="text-gray-700 text-sm leading-relaxed"
              />
            </div>
          );
        }

        if (field.kind === 'pairs') {
          const pairs = Array.isArray(value) ? value : [];
          return (
            <div key={field.key} className="flex items-baseline gap-2 flex-wrap">
              <span className="font-semibold shrink-0">{field.label}:</span>
              <span>{pairs.join(', ')}</span>
            </div>
          );
        }

        return (
          <div key={field.key} className="flex items-baseline gap-2 flex-wrap">
            <span className="font-semibold shrink-0">{field.label}:</span>
            <PrintRichText value={typeof value === 'string' ? value : ''} inline />
          </div>
        );
      })}
    </div>
  );
}

const renderCustomEditor: NonNullable<SectionDef['renderItemEditor']> = ({
  itemPath,
  item,
  layout,
  index,
  total,
  onMove,
  onDelete,
  schema,
}) => (
  <ItemFrame itemId={item.id} density={layout.density} index={index} total={total} onMove={onMove} onDelete={onDelete} path={itemPath}>
    {renderCustomFields(itemPath, item, schema?.fields ?? [], layout)}
  </ItemFrame>
);

export const customDef: SectionDef = {
  type: 'custom',
  label: 'Custom Section',
  description: 'Define your own fields and layout',
  defaultTitle: 'CUSTOM SECTION',
  defaultLayout: classicLayouts.custom,
  recommendedLayout: professionalLayouts.custom,
  category: 'custom',
  allowedLayoutOptions: {
    dateSlot: ['hidden', 'right-inline', 'below-title', 'left-margin'],
    iconStyle: ['none', 'bullet', 'dash', 'chevron'],
    separator: ['none', 'rule', 'dot', 'space'],
    density: ['compact', 'normal', 'relaxed'],
    columns: [1, 2],
  },
  singleItem: false,
  addItemLabel: 'Add item',
  availablePresetIds: ['classic'],
  newItem: () => ({ id: uid(), values: {} }),
  renderItemEditor: renderCustomEditor,
  renderItem: renderCustomEditor,
  renderItemPrint: ({ item, layout, schema }) => (
    <ItemFramePrint density={layout.density}>
      {renderCustomFieldsPrint(item, schema?.fields ?? [], layout.iconStyle)}
    </ItemFramePrint>
  ),
};
