import type {
  CVData,
  CVItem,
  CVSection,
  BulletEntry,
  CustomFieldDef,
  DateFormat,
  IconType,
  SectionFieldDef,
  SectionFieldValue,
  SectionLayout,
  SectionType,
  SkillGroup,
  SocialLink,
} from '../types';
import { defaultLayoutFor, uid } from './helpers';

type UnknownRecord = Record<string, unknown>;

const FIELD_KINDS = new Set(['text', 'multiline', 'date', 'bullets', 'tags', 'pairs']);
const DATE_FORMATS: ReadonlySet<DateFormat> = new Set(['MM/YYYY', 'Mon YYYY', 'YYYY']);
const ICON_TYPES: ReadonlySet<IconType> = new Set([
  'github',
  'linkedin',
  'twitter',
  'globe',
  'mail',
  'phone',
  'portfolio',
  'youtube',
  'instagram',
  'facebook',
  'custom',
]);
const DATE_SLOTS: ReadonlySet<SectionLayout['dateSlot']> = new Set([
  'right-inline',
  'below-title',
  'left-margin',
  'hidden',
]);
const ICON_STYLES: ReadonlySet<SectionLayout['iconStyle']> = new Set(['none', 'bullet', 'dash', 'chevron']);
const SEPARATORS: ReadonlySet<SectionLayout['separator']> = new Set(['none', 'rule', 'dot', 'space']);
const DENSITIES: ReadonlySet<SectionLayout['density']> = new Set(['compact', 'normal', 'relaxed']);
const TEMPLATE_IDS: ReadonlySet<CVData['template']['id']> = new Set([
  'single-column',
  'sidebar-left',
  'sidebar-right',
]);

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
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneUnknown(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneUnknown);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneUnknown(entry)]));
}

export function migrateLegacyBulletEntries(value: unknown): unknown {
  const data = cloneUnknown(value);
  if (!isRecord(data) || !Array.isArray(data.sections)) return data;

  const ids = new Set<string>();
  const collectIds = (entry: unknown) => {
    if (Array.isArray(entry)) entry.forEach(collectIds);
    else if (isRecord(entry)) {
      if (typeof entry.id === 'string') ids.add(entry.id);
      Object.values(entry).forEach(collectIds);
    }
  };
  collectIds(data);

  const nextId = () => {
    let id = uid();
    while (ids.has(id)) id = uid();
    ids.add(id);
    return id;
  };

  for (const section of data.sections) {
    if (!isRecord(section) || !isRecord(section.content)) continue;
    const { schema, items } = section.content;
    if (!Array.isArray(schema) || !Array.isArray(items)) continue;
    const bulletKeys = schema
      .filter((field) => isRecord(field) && field.kind === 'bullets' && typeof field.key === 'string')
      .map((field) => field.key as string);
    for (const item of items) {
      if (!isRecord(item) || !isRecord(item.fields)) continue;
      for (const key of bulletKeys) {
        const bullets = item.fields[key];
        if (!Array.isArray(bullets)) continue;
        item.fields[key] = bullets.map((bullet) => (
          typeof bullet === 'string' ? { id: nextId(), text: bullet } : bullet
        ));
      }
    }
  }

  return data;
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

function normalizeBulletArray(value: unknown): BulletEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === 'string') return [{ id: '', text: entry }];
    if (!isRecord(entry) || typeof entry.text !== 'string') return [];
    return [{ id: typeof entry.id === 'string' ? entry.id : '', text: entry.text }];
  });
}

function isSupportedValue<T extends string>(value: unknown, values: ReadonlySet<T>): value is T {
  return typeof value === 'string' && values.has(value as T);
}

function normalizeSocialLinkArray(value: unknown): SocialLink[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((link, index) => ({
    id: typeof link.id === 'string' ? link.id : '',
    url: normalizeString(link.url),
    label: normalizeString(link.label),
    iconType: isSupportedValue(link.iconType, ICON_TYPES) ? link.iconType : 'globe',
    displayOrder: typeof link.displayOrder === 'number' && Number.isInteger(link.displayOrder)
      ? link.displayOrder
      : index + 1,
    ...(typeof link.customIconUrl === 'string' ? { customIconUrl: link.customIconUrl } : {}),
    ...(typeof link.color === 'string' ? { color: link.color } : {}),
  }));
}

function normalizeHeader(value: unknown): CVData['header'] {
  const source = isRecord(value) ? value : {};

  return {
    name: normalizeString(source.name),
    location: normalizeString(source.location),
    phone: normalizeString(source.phone),
    email: normalizeString(source.email),
    socialLinks: normalizeSocialLinkArray(source.socialLinks),
    ...(typeof source.headline === 'string' ? { headline: source.headline } : {}),
  };
}

function normalizeLayout(value: unknown, type: SectionType): SectionLayout {
  const fallback = defaultLayoutFor(type);
  const source = isRecord(value) ? value : {};

  return {
    dateSlot: isSupportedValue(source.dateSlot, DATE_SLOTS) ? source.dateSlot : fallback.dateSlot,
    iconStyle: isSupportedValue(source.iconStyle, ICON_STYLES) ? source.iconStyle : fallback.iconStyle,
    separator: isSupportedValue(source.separator, SEPARATORS) ? source.separator : fallback.separator,
    density: isSupportedValue(source.density, DENSITIES) ? source.density : fallback.density,
    columns: source.columns === 2 ? 2 : 1,
    ...(typeof source.presetId === 'string' ? { presetId: source.presetId } : {}),
  };
}

function normalizeTemplate(value: unknown): CVData['template'] {
  const source = isRecord(value) ? value : {};
  const sidebarSide = source.sidebarSide === 'left' || source.sidebarSide === 'right'
    ? source.sidebarSide
    : undefined;
  const sidebarSectionIds = Array.isArray(source.sidebarSectionIds)
    ? source.sidebarSectionIds.filter((id): id is string => typeof id === 'string')
    : undefined;

  return {
    id: isSupportedValue(source.id, TEMPLATE_IDS) ? source.id : 'single-column',
    columns: source.columns === 2 ? 2 : 1,
    ...(sidebarSide ? { sidebarSide } : {}),
    ...(sidebarSectionIds ? { sidebarSectionIds } : {}),
  };
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

function schemaForSection(type: SectionType, schema?: unknown): SectionFieldDef[] {
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
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : [];
}

export function fieldBulletArray(item: CVItem, key: string): BulletEntry[] {
  const value = item.fields[key];
  return Array.isArray(value) && value.every((entry) => isRecord(entry) && typeof entry.id === 'string' && typeof entry.text === 'string')
    ? value as BulletEntry[]
    : [];
}

export function skillGroupFromItem(item: CVItem): SkillGroup {
  return {
    id: item.id,
    label: fieldString(item, 'label'),
    value: fieldString(item, 'value'),
  };
}

function normalizeFields(fields: unknown, schema: SectionFieldDef[]): Record<string, SectionFieldValue> {
  const source = isRecord(fields) ? fields : {};
  const output: Record<string, SectionFieldValue> = {};

  schema.forEach((field) => {
    const value = source[field.key];
    output[field.key] = field.kind === 'bullets'
      ? normalizeBulletArray(value)
      : field.kind === 'tags'
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

  // ponytail: optional links only when present — keeps old items untouched
  const links = Array.isArray(value.links) ? { links: normalizeSocialLinkArray(value.links) } : {};
  const keepTogetherGroup = typeof value.keepTogetherGroup === 'string'
    ? { keepTogetherGroup: value.keepTogetherGroup }
    : {};
  const id = typeof value.id === 'string' ? value.id : '';

  if (isRecord(value.fields)) {
    return [{ id, fields: normalizeFields(value.fields, schema), ...links, ...keepTogetherGroup }];
  }

  return oldItemToFields(value, type, schema).map((fields) => ({ id, fields, ...links, ...keepTogetherGroup }));
}

function normalizeSection(value: unknown): CVSection | null {
  if (!isRecord(value) || !isSectionType(value.type)) return null;
  const type = value.type;

  const schema = type === 'custom' && isRecord(value.content) && Array.isArray(value.content.schema)
    ? value.content.schema.map(normalizeFieldDef).filter((field): field is CustomFieldDef => field !== null)
    : schemaForSection(type, type === 'custom' ? value.schema : undefined);

  const rawItems = isRecord(value.content) && Array.isArray(value.content.items)
    ? value.content.items
    : Array.isArray(value.items)
      ? value.items
      : [];

  return {
    id: typeof value.id === 'string' ? value.id : '',
    type,
    title: typeof value.title === 'string' ? value.title : '',
    layout: normalizeLayout(value.layout, type),
    content: {
      schema,
      items: rawItems.flatMap((item) => normalizeItem(item, type, schema)),
    },
    ...(typeof value.keepTogetherGroup === 'string' ? { keepTogetherGroup: value.keepTogetherGroup } : {}),
  };
}

function claimUniqueId(seen: Set<string>, reserved: Set<string>, id: string): string {
  if (id.trim() !== '' && !seen.has(id)) {
    seen.add(id);
    return id;
  }
  let next = uid();
  while (next.trim() === '' || reserved.has(next)) next = uid();
  seen.add(next);
  reserved.add(next);
  return next;
}

function ensureUniquePersistentIds(data: CVData): CVData {
  const entities: Array<{ id: string }> = [...data.header.socialLinks];
  for (const section of data.sections) {
    entities.push(section);
    for (const item of section.content.items) {
      entities.push(item, ...(item.links ?? []));
      for (const field of section.content.schema) {
        if (field.kind === 'bullets') entities.push(...fieldBulletArray(item, field.key));
      }
    }
  }

  const seen = new Set<string>();
  const reserved = new Set(entities.map(({ id }) => id).filter((id) => id.trim() !== ''));
  for (const entity of entities) {
    entity.id = claimUniqueId(seen, reserved, entity.id);
  }

  return data;
}

export function migrateCVData(value: unknown): CVData {
  const source = isRecord(value) ? value : {};
  const sections = Array.isArray(source.sections)
    ? source.sections.map(normalizeSection).filter((section): section is CVSection => section !== null)
    : [];

  return ensureUniquePersistentIds({
    header: normalizeHeader(source.header),
    sections,
    template: normalizeTemplate(source.template),
    dateFormat: isSupportedValue(source.dateFormat, DATE_FORMATS) ? source.dateFormat : undefined,
  });
}
