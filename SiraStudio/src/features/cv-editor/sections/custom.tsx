import type { SectionDef } from './registry';
import { useState } from 'react';
import { X } from 'lucide-react';
import type { BulletEntry, CustomFieldDef, CVItem, SectionLayout } from '../../../shared/types';
import { classicLayouts, professionalLayouts } from '../presets';
import { CVTextEditor } from '../editor/CVTextEditor';
import { BulletList } from '../layouts/BulletList';
import { HeadingBlock } from '../layouts/HeadingBlock';
import { ItemFrame } from '../layouts/ItemFrame';
import { BulletListPrint } from '../../print/layouts/BulletListPrint';
import { HeadingBlockPrint } from '../../print/layouts/HeadingBlockPrint';
import { ItemFramePrint } from '../../print/layouts/ItemFramePrint';
import { PrintRichText } from '../../print/PrintRichText';
import { uid } from '../../../shared/utils/helpers';
import { builtInSectionSchemas, fieldBulletArray } from '../../../shared/utils/cvContent';
import { useDispatch } from '../../../app/store';
import { customSectionPresetFor } from './customLayout';

function TagInput({ tags, path, label, placeholder }: { tags: string[]; path: string; label: string; placeholder: string }) {
  const dispatch = useDispatch();
  const [value, setValue] = useState('');

  const addTags = (input: string) => {
    const newTags = input.split(',').map((tag) => tag.trim()).filter(Boolean);
    if (newTags.length > 0) {
      dispatch({ op: 'replace', path, value: [...tags, ...newTags] });
    }
    setValue('');
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
      {tags.map((tag, index) => (
        <span key={`${tag}-${index}`} className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
          {tag}
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => dispatch({ op: 'replace', path, value: tags.filter((_, tagIndex) => tagIndex !== index) })}
            className="rounded text-[#0078D7] hover:text-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
            aria-label={`Remove ${tag}`}
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        type="text"
        aria-label={label}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ',') && value.trim()) {
            event.preventDefault();
            addTags(value);
          }
        }}
        onBlur={() => addTags(value)}
        placeholder={tags.length === 0 ? placeholder : 'Add tag'}
        className="min-w-32 flex-1 bg-transparent px-1 py-0.5 text-sm text-gray-700 outline-none placeholder:text-gray-400"
      />
    </div>
  );
}

function newCustomItem(schema: CustomFieldDef[] = []): CVItem {
  const fields: CVItem['fields'] = {};
  schema.forEach((field) => {
    fields[field.key] = field.kind === 'bullets' || field.kind === 'tags' ? [] : '';
  });
  return { id: uid(), fields };
}

function fieldValue(item: CVItem, field: CustomFieldDef): string {
  const value = item.fields[field.key];
  return typeof value === 'string' ? value : '';
}

function fieldStringValues(item: CVItem, field: CustomFieldDef): string[] {
  const value = item.fields[field.key];
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : [];
}

function fieldBullets(item: CVItem, field: CustomFieldDef): BulletEntry[] {
  return fieldBulletArray(item, field.key);
}

function fieldPlaceholder(field: CustomFieldDef): string {
  return field.placeholder ?? field.label;
}

function renderPresetFields(
  path: string,
  item: CVItem,
  fields: CustomFieldDef[],
  layout: SectionLayout,
) {
  const preset = customSectionPresetFor(fields);

  if (!preset) return null;

  const [title, subtitleOrDate, locationOrBullets, dateOrBullets, bullets] = fields;

  if (preset === 'work-experience') {
    const subtitle = subtitleOrDate;
    const location = locationOrBullets;
    const date = dateOrBullets;
    const achievements = bullets;

    return (
      <>
        <HeadingBlock
          title={fieldValue(item, title)}
          titlePath={`${path}.fields.${title.key}`}
          subtitle={fieldValue(item, subtitle)}
          subtitlePath={`${path}.fields.${subtitle.key}`}
          location={fieldValue(item, location)}
          locationPath={`${path}.fields.${location.key}`}
          date={layout.dateSlot !== 'hidden' ? fieldValue(item, date) : undefined}
          datePath={`${path}.fields.${date.key}`}
          dateSlot={layout.dateSlot}
          titlePlaceholder={fieldPlaceholder(title)}
          subtitlePlaceholder={fieldPlaceholder(subtitle)}
          locationPlaceholder={fieldPlaceholder(location)}
          datePlaceholder={fieldPlaceholder(date)}
          titleClassName="text-base font-semibold"
          subtitleClassName="text-gray-700 text-sm"
        />
        <BulletList
          bullets={fieldBullets(item, achievements)}
          bulletsPath={`${path}.fields.${achievements.key}`}
          iconStyle={layout.iconStyle}
          bulletPlaceholder={fieldPlaceholder(achievements)}
        />
      </>
    );
  }

  if (preset === 'projects') {
    const date = subtitleOrDate;
    const details = locationOrBullets;

    return (
      <>
        <HeadingBlock
          title={fieldValue(item, title)}
          titlePath={`${path}.fields.${title.key}`}
          date={layout.dateSlot !== 'hidden' ? fieldValue(item, date) : undefined}
          datePath={`${path}.fields.${date.key}`}
          dateSlot={layout.dateSlot}
          titlePlaceholder={fieldPlaceholder(title)}
          datePlaceholder={fieldPlaceholder(date)}
          titleClassName="text-base font-semibold"
        />
        <BulletList
          bullets={fieldBullets(item, details)}
          bulletsPath={`${path}.fields.${details.key}`}
          iconStyle={layout.iconStyle}
          bulletPlaceholder={fieldPlaceholder(details)}
        />
      </>
    );
  }

  const subtitle = subtitleOrDate;
  const date = locationOrBullets;

  return (
    <HeadingBlock
      title={fieldValue(item, title)}
      titlePath={`${path}.fields.${title.key}`}
      subtitle={fieldValue(item, subtitle)}
      subtitlePath={`${path}.fields.${subtitle.key}`}
      date={layout.dateSlot !== 'hidden' ? fieldValue(item, date) : undefined}
      datePath={`${path}.fields.${date.key}`}
      dateSlot={layout.dateSlot}
      titlePlaceholder={fieldPlaceholder(title)}
      subtitlePlaceholder={fieldPlaceholder(subtitle)}
      datePlaceholder={fieldPlaceholder(date)}
    />
  );
}

function renderCustomFields(
  path: string,
  item: CVItem,
  fields: CustomFieldDef[],
  layout: SectionLayout,
) {
  if (fields.length === 0) {
    return <p className="text-xs text-gray-400 italic">No fields defined. Edit section schema.</p>;
  }
  const presetFields = renderPresetFields(path, item, fields, layout);
  if (presetFields) return presetFields;

  return (
    <div className="space-y-0.5 text-sm text-gray-700">
      {fields.map((field) => {
        const values = item.fields;
        const val = values[field.key];

        if (field.kind === 'bullets') {
          const bullets = fieldBullets(item, field);
          return (
            <div key={field.key}>
              <BulletList
                bullets={bullets}
                bulletsPath={`${path}.fields.${field.key}`}
                iconStyle={layout.iconStyle}
                bulletPlaceholder={fieldPlaceholder(field)}
              />
            </div>
          );
        }

        if (field.kind === 'tags') {
          const tags = fieldStringValues(item, field);
          return (
            <div key={field.key}>
              <TagInput
                tags={tags}
                path={`${path}.fields.${field.key}`}
                label={field.label}
                placeholder={fieldPlaceholder(field)}
              />
            </div>
          );
        }

        const strVal = typeof val === 'string' ? val : '';

        if (field.kind === 'multiline') {
          return (
            <div key={field.key}>
              <CVTextEditor
                multiline
                value={strVal}
                path={`${path}.fields.${field.key}`}
                placeholder={fieldPlaceholder(field)}
                className="text-gray-700 text-sm leading-relaxed"
              />
            </div>
          );
        }

        return (
          <div key={field.key}>
            <CVTextEditor
              value={strVal}
              path={`${path}.fields.${field.key}`}
              placeholder={fieldPlaceholder(field)}
            />
          </div>
        );
      })}
    </div>
  );
}

function renderPresetFieldsPrint(
  item: CVItem,
  fields: CustomFieldDef[],
  layout: SectionLayout,
) {
  const preset = customSectionPresetFor(fields);

  if (!preset) return null;

  const [title, subtitleOrDate, locationOrBullets, dateOrBullets, bullets] = fields;

  if (preset === 'work-experience') {
    const subtitle = subtitleOrDate;
    const location = locationOrBullets;
    const date = dateOrBullets;
    const achievements = bullets;

    return (
      <>
        <HeadingBlockPrint
          title={fieldValue(item, title)}
          subtitle={fieldValue(item, subtitle)}
          location={fieldValue(item, location)}
          date={layout.dateSlot !== 'hidden' ? fieldValue(item, date) : undefined}
          dateSlot={layout.dateSlot}
          titleClassName="text-base font-semibold"
          subtitleClassName="text-gray-700 text-sm"
        />
        <BulletListPrint bullets={fieldBullets(item, achievements)} iconStyle={layout.iconStyle} />
      </>
    );
  }

  if (preset === 'projects') {
    const date = subtitleOrDate;
    const details = locationOrBullets;

    return (
      <>
        <HeadingBlockPrint
          title={fieldValue(item, title)}
          date={layout.dateSlot !== 'hidden' ? fieldValue(item, date) : undefined}
          dateSlot={layout.dateSlot}
          titleClassName="text-base font-semibold"
        />
        <BulletListPrint bullets={fieldBullets(item, details)} iconStyle={layout.iconStyle} />
      </>
    );
  }

  const subtitle = subtitleOrDate;
  const date = locationOrBullets;

  return (
    <HeadingBlockPrint
      title={fieldValue(item, title)}
      subtitle={fieldValue(item, subtitle)}
      date={layout.dateSlot !== 'hidden' ? fieldValue(item, date) : undefined}
      dateSlot={layout.dateSlot}
    />
  );
}

function renderCustomFieldsPrint(
  item: CVItem,
  fields: CustomFieldDef[],
  layout: SectionLayout,
) {
  if (fields.length === 0) {
    return <p className="text-xs text-gray-400 italic">No fields defined.</p>;
  }

  const presetFields = renderPresetFieldsPrint(item, fields, layout);
  if (presetFields) return presetFields;

  const values = item.fields;

  return (
    <div className="space-y-0.5 text-sm text-gray-700">
      {fields.map((field) => {
        const value = values[field.key];

        if (field.kind === 'bullets') {
          const bullets = fieldBullets(item, field);
          return (
            <div key={field.key}>
              <BulletListPrint bullets={bullets} iconStyle={layout.iconStyle} />
            </div>
          );
        }

        if (field.kind === 'multiline') {
          return (
            <div key={field.key}>
              <PrintRichText
                value={typeof value === 'string' ? value : ''}
                className="text-gray-700 text-sm leading-relaxed"
              />
            </div>
          );
        }

        if (field.kind === 'tags') {
          const pairs = fieldStringValues(item, field);
          return (
            <span key={field.key}>{pairs.join(', ')}</span>
          );
        }

        return (
          <div key={field.key}>
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
    {renderCustomFields(itemPath, item, schema, layout)}
  </ItemFrame>
);

export const customDef: SectionDef = {
  type: 'custom',
  label: 'Custom Section',
  description: 'Define your own fields and layout',
  defaultTitle: 'CUSTOM SECTION',
  defaultLayout: classicLayouts.custom,
  recommendedLayout: professionalLayouts.custom,
  schema: builtInSectionSchemas.custom,
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
  newItem: newCustomItem,
  renderItemEditor: renderCustomEditor,
  renderItem: renderCustomEditor,
  renderItemPrint: ({ item, layout, schema }) => (
    <ItemFramePrint density={layout.density}>
      {renderCustomFieldsPrint(item, schema, layout)}
    </ItemFramePrint>
  ),
};
