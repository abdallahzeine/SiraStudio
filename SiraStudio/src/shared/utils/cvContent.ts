import type {
  CVData,
  CVItem,
  CVSection,
  CustomFieldDef,
  SectionFieldDef,
  SectionFieldValue,
  SectionLayout,
  SectionType,
  SkillGroup,
} from '../types';
import { defaultLayoutFor, uid } from './helpers';

type UnknownRecord = Record<string, unknown>;

const FIELD_KINDS = new Set(['text', 'multiline', 'date', 'bullets', 'tags', 'pairs']);

export const builtInSectionSchemas: Record<SectionType, SectionFieldDef[]> = {
  summary: [
    { key: 'body', label: 'Summary', kind: 'multiline', placeholder: 'Write your professional summary...' },
  ],
  'work-experience': [
    { key: 'title', label: 'Job Title', kind: 'text' },
    { key: 'subtitle', label: 'Company', kind: 'text' },
    { key: 'location', label: 'Location', kind: 'text' },
    { key: 'date', label: 'Date', kind: 'date' },
    { key: 'bullets', label: 'Achievements', kind: 'bullets' },
  ],
  education: [
    { key: 'title', label: 'Degree', kind: 'text' },
    { key: 'subtitle', label: 'School', kind: 'text' },
    { key: 'date', label: 'Date', kind: 'date' },
  ],
  skills: [
    { key: 'label', label: 'Category', kind: 'text' },
    { key: 'value', label: 'Skills', kind: 'text' },
  ],
  certifications: [
    { key: 'title', label: 'Certification', kind: 'text' },
    { key: 'subtitle', label: 'Issuer', kind: 'text' },
    { key: 'date', label: 'Date', kind: 'date' },
  ],
  projects: [
    { key: 'title', label: 'Project Name', kind: 'text' },
    { key: 'subtitle', label: 'Tech Stack', kind: 'text' },
    { key: 'date', label: 'Date', kind: 'date' },
    { key: 'bullets', label: 'Details', kind: 'bullets' },
  ],
  awards: [
    { key: 'title', label: 'Award', kind: 'text' },
    { key: 'subtitle', label: 'Organization', kind: 'text' },
    { key: 'date', label: 'Date', kind: 'date' },
  ],
  volunteering: [
    { key: 'title', label: 'Organization', kind: 'text' },
    { key: 'role', label: 'Role', kind: 'text' },
    { key: 'date', label: 'Date', kind: 'date' },
  ],
  custom: [],
  spacer: [
    { key: 'body', label: 'Height', kind: 'text' },
  ],
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSectionType(value: unknown): value is SectionType {
  return typeof value === 'string' && value in builtInSectionSchemas;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function normalizeFieldDef(value: unknown): SectionFieldDef | null {
  if (!isRecord(value)) return null;
  if (typeof value.key !== 'string' || typeof value.label !== 'string') return null;
  if (typeof value.kind !== 'string' || !FIELD_KINDS.has(value.kind)) return null;

  const kind = value.kind === 'pairs' ? 'tags' : value.kind;

  return {
    key: value.key,
    label: value.label,
    kind: kind as SectionFieldDef['kind'],
    placeholder: typeof value.placeholder === 'string' ? value.placeholder : undefined,
    required: typeof value.required === 'boolean' ? value.required : undefined,
  };
}

export function schemaForSection(type: SectionType, schema?: unknown): SectionFieldDef[] {
  if (type === 'custom' && isRecord(schema) && Array.isArray(schema.fields)) {
    return schema.fields.map(normalizeFieldDef).filter((field): field is SectionFieldDef => field !== null);
  }

  return builtInSectionSchemas[type].map((field) => ({ ...field }));
}

export function fieldString(item: CVItem, key: string): string {
  const value = item.fields[key];
  return typeof value === 'string' ? value : '';
}

export function fieldStringArray(item: CVItem, key: string): string[] {
  const value = item.fields[key];
  return Array.isArray(value) ? value : [];
}

export function skillGroupFromItem(item: CVItem): SkillGroup {
  return {
    id: item.id,
    label: fieldString(item, 'label'),
    value: fieldString(item, 'value'),
  };
}

export function newGenericItem(fields: Record<string, SectionFieldValue>): CVItem {
  return { id: uid(), fields };
}

function normalizeFields(fields: unknown, schema: SectionFieldDef[]): Record<string, SectionFieldValue> {
  const source = isRecord(fields) ? fields : {};
  const output: Record<string, SectionFieldValue> = {};

  schema.forEach((field) => {
    const value = source[field.key];
    output[field.key] = field.kind === 'bullets' || field.kind === 'tags'
      ? normalizeStringArray(value)
      : normalizeString(value);
  });

  return output;
}

function oldItemToFields(item: UnknownRecord, type: SectionType, schema: SectionFieldDef[]): Record<string, SectionFieldValue>[] {
  if (type === 'skills' && Array.isArray(item.skillGroups)) {
    return item.skillGroups
      .filter(isRecord)
      .map((group) => normalizeFields({ label: group.label, value: group.value }, schema));
  }

  const source = type === 'custom' && isRecord(item.values) ? item.values : item;
  return [normalizeFields(source, schema)];
}

function normalizeItem(value: unknown, type: SectionType, schema: SectionFieldDef[]): CVItem[] {
  if (!isRecord(value)) return [];

  if (isRecord(value.fields)) {
    return [{ id: typeof value.id === 'string' ? value.id : uid(), fields: normalizeFields(value.fields, schema) }];
  }

  return oldItemToFields(value, type, schema).map((fields) => ({
    id: typeof value.id === 'string' ? value.id : uid(),
    fields,
  }));
}

function normalizeSection(value: unknown): CVSection | null {
  if (!isRecord(value) || !isSectionType(value.type)) return null;
  const type = value.type;

  const schema = isRecord(value.content) && Array.isArray(value.content.schema)
    ? value.content.schema.map(normalizeFieldDef).filter((field): field is CustomFieldDef => field !== null)
    : schemaForSection(type, value.schema);

  const rawItems = isRecord(value.content) && Array.isArray(value.content.items)
    ? value.content.items
    : Array.isArray(value.items)
      ? value.items
      : [];

  return {
    id: typeof value.id === 'string' ? value.id : uid(),
    type,
    title: typeof value.title === 'string' ? value.title : '',
    layout: isRecord(value.layout) ? value.layout as unknown as SectionLayout : defaultLayoutFor(type),
    content: {
      schema,
      items: rawItems.flatMap((item) => normalizeItem(item, type, schema)),
    },
  };
}

export function normalizeCVData(value: CVData): CVData {
  return migrateCVData(value);
}

export function migrateCVData(value: unknown): CVData {
  const source = isRecord(value) ? value : {};
  const sections = Array.isArray(source.sections)
    ? source.sections.map(normalizeSection).filter((section): section is CVSection => section !== null)
    : [];

  return {
    header: isRecord(source.header)
      ? source.header as unknown as CVData['header']
      : { name: '', location: '', phone: '', email: '', socialLinks: [] },
    sections,
    template: isRecord(source.template)
      ? source.template as unknown as CVData['template']
      : { id: 'single-column', columns: 1 },
    dateFormat: typeof source.dateFormat === 'string' ? source.dateFormat as CVData['dateFormat'] : undefined,
  };
}
