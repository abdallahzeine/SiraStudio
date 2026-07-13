import type { BulletEntry, CVData, CVItem, CVSection, SectionType } from '../../../shared/types';
import { defaultLayoutFor, uid } from '../../../shared/utils/helpers';
import { builtInSectionSchemas, migrateLegacyBulletEntries } from '../../../shared/utils/cvContent';

export interface CVSnapshot {
  id: string;
  name: string;
  savedAt: number;
  schemaVersion: 1;
  data: CVData;
}

const SNAPSHOTS_STORAGE_KEY = 'cv-maker-snapshots';

const SNAPSHOT_SCHEMA_VERSION = 1 as const;
const MAX_SNAPSHOTS = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepCloneFallback(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => deepCloneFallback(entry));
  }

  if (isRecord(value)) {
    const output: Record<string, unknown> = {};
    Object.entries(value).forEach(([key, entry]) => {
      output[key] = deepCloneFallback(entry);
    });
    return output;
  }

  return value;
}

function cloneValue<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return deepCloneFallback(value) as T;
  }
}

export function isValidCVData(value: unknown): value is CVData {
  if (!isRecord(value) || !hasOnlyKeys(value, ['header', 'sections', 'template', 'dateFormat'])) return false;
  if (!isRecord(value.header) || !Array.isArray(value.sections) || !isRecord(value.template)) return false;

  const header = value.header;
  if (
    !hasOnlyKeys(header, ['name', 'headline', 'location', 'phone', 'email', 'socialLinks']) ||
    typeof header.name !== 'string' ||
    !isOptionalString(header.headline) ||
    typeof header.location !== 'string' ||
    typeof header.phone !== 'string' ||
    typeof header.email !== 'string' ||
    !Array.isArray(header.socialLinks) ||
    !header.socialLinks.every(isValidSocialLink)
  ) {
    return false;
  }

  if (!value.sections.every(isValidSection)) return false;

  const template = value.template;
  if (!hasOnlyKeys(template, ['id', 'columns', 'sidebarSide', 'sidebarSectionIds'])) return false;
  if (!['single-column', 'sidebar-left', 'sidebar-right'].includes(template.id as string)) return false;
  if (template.columns !== 1 && template.columns !== 2) return false;
  if (template.sidebarSide !== undefined && template.sidebarSide !== 'left' && template.sidebarSide !== 'right') return false;
  if (template.sidebarSectionIds !== undefined && (
    !Array.isArray(template.sidebarSectionIds) ||
    !template.sidebarSectionIds.every((id) => typeof id === 'string')
  )) return false;
  if (value.dateFormat !== undefined && !['MM/YYYY', 'Mon YYYY', 'YYYY'].includes(value.dateFormat as string)) return false;

  return hasGloballyUniquePersistentIds(value as unknown as CVData);
}

function hasGloballyUniquePersistentIds(value: {
  header: { socialLinks: Array<{ id: unknown }> };
  sections: Array<{
    id: unknown;
    content: { schema: Array<{ key: string; kind: string }>; items: Array<{ id: unknown; fields: Record<string, unknown>; links?: Array<{ id: unknown }> }> };
  }>;
}): boolean {
  const seen = new Set<string>();
  const claim = (id: unknown): boolean => {
    if (typeof id !== 'string' || id.trim() === '' || seen.has(id)) return false;
    seen.add(id);
    return true;
  };

  for (const link of value.header.socialLinks) {
    if (!claim(link.id)) return false;
  }
  for (const section of value.sections) {
    if (!claim(section.id)) return false;
    for (const item of section.content.items) {
      if (!claim(item.id)) return false;
      for (const link of item.links ?? []) {
        if (!claim(link.id)) return false;
      }
      for (const field of section.content.schema) {
        if (field.kind !== 'bullets') continue;
        const bullets = item.fields[field.key];
        if (!Array.isArray(bullets)) return false;
        for (const bullet of bullets) {
          if (!isValidBulletEntry(bullet) || !claim(bullet.id)) return false;
        }
      }
    }
  }
  return true;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isValidBulletEntry(value: unknown): value is BulletEntry {
  return isRecord(value) && hasOnlyKeys(value, ['id', 'text']) &&
    typeof value.id === 'string' && typeof value.text === 'string';
}

function isSectionType(value: unknown): value is SectionType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(builtInSectionSchemas, value);
}

function isValidSocialLink(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'id', 'url', 'label', 'iconType', 'customIconUrl', 'color', 'displayOrder',
  ])) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.url === 'string' &&
    typeof value.label === 'string' &&
    ['github', 'linkedin', 'twitter', 'globe', 'mail', 'phone', 'portfolio', 'youtube', 'instagram', 'facebook', 'custom']
      .includes(value.iconType as string) &&
    isOptionalString(value.customIconUrl) &&
    isOptionalString(value.color) &&
    typeof value.displayOrder === 'number' &&
    Number.isInteger(value.displayOrder)
  );
}

function isValidSection(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, ['id', 'type', 'title', 'layout', 'content', 'keepTogetherGroup'])) return false;
  if (typeof value.id !== 'string' || typeof value.title !== 'string') return false;
  if (!isSectionType(value.type)) return false;
  if (!isOptionalString(value.keepTogetherGroup)) return false;
  if (!isRecord(value.layout) || !isValidLayout(value.layout)) return false;
  if (!isRecord(value.content) || !hasOnlyKeys(value.content, ['schema', 'items'])) return false;
  if (!Array.isArray(value.content.schema) || !Array.isArray(value.content.items)) return false;
  if (value.type === 'summary' && value.content.items.length !== 1) return false;

  const schema = value.content.schema;
  if (!schema.every(isValidFieldDef)) return false;
  const fieldsByKey = new Map(schema.map((field) => [field.key, field]));
  if (fieldsByKey.size !== schema.length) return false;

  if (value.type !== 'custom') {
    const canonical = builtInSectionSchemas[value.type];
    if (canonical.length !== schema.length) return false;
    if (!canonical.every((field) => fieldsByKey.get(field.key)?.kind === field.kind)) return false;
  }

  return value.content.items.every((item) => isValidItem(item, fieldsByKey));
}

function isValidLayout(value: Record<string, unknown>): boolean {
  return (
    hasOnlyKeys(value, ['presetId', 'dateSlot', 'iconStyle', 'separator', 'density', 'columns']) &&
    isOptionalString(value.presetId) &&
    ['right-inline', 'below-title', 'left-margin', 'hidden'].includes(value.dateSlot as string) &&
    ['none', 'bullet', 'dash', 'chevron'].includes(value.iconStyle as string) &&
    ['none', 'rule', 'dot', 'space'].includes(value.separator as string) &&
    ['compact', 'normal', 'relaxed'].includes(value.density as string) &&
    (value.columns === 1 || value.columns === 2)
  );
}

function isValidFieldDef(value: unknown): value is CVSection['content']['schema'][number] {
  if (!isRecord(value) || !hasOnlyKeys(value, ['key', 'label', 'kind', 'placeholder', 'required'])) return false;
  return (
    typeof value.key === 'string' &&
    typeof value.label === 'string' &&
    ['text', 'multiline', 'date', 'bullets', 'tags'].includes(value.kind as string) &&
    isOptionalString(value.placeholder) &&
    (value.required === undefined || typeof value.required === 'boolean')
  );
}

function isValidItem(
  value: unknown,
  fieldsByKey: Map<string, CVSection['content']['schema'][number]>
): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, ['id', 'fields', 'links', 'keepTogetherGroup'])) return false;
  if (typeof value.id !== 'string' || !isRecord(value.fields)) return false;
  if (Object.keys(value.fields).length !== fieldsByKey.size) return false;
  if (!isOptionalString(value.keepTogetherGroup)) return false;
  if (value.links !== undefined && (
    !Array.isArray(value.links) || !value.links.every(isValidSocialLink)
  )) return false;

  return Object.entries(value.fields).every(([key, fieldValue]) => {
    const definition = fieldsByKey.get(key);
    if (!definition) return false;
    if (definition.kind === 'bullets') {
      return Array.isArray(fieldValue) && fieldValue.every(isValidBulletEntry);
    }
    if (definition.kind === 'tags') {
      return Array.isArray(fieldValue) && fieldValue.every((entry) => typeof entry === 'string');
    }
    return typeof fieldValue === 'string';
  });
}

export interface SnapshotCollection {
  snapshots: CVSnapshot[];
  rejectedCount: number;
}

function readSnapshotEntries(): unknown[] {
  const stored = localStorage.getItem(SNAPSHOTS_STORAGE_KEY);
  if (!stored) return [];

  const parsed = JSON.parse(stored) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Stored snapshots are not a collection.');
  return parsed;
}

function normalizeSnapshot(value: unknown): CVSnapshot | null {
  try {
    if (!isRecord(value) || value.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) return null;
    const bulletMigrated = migrateLegacyBulletEntries(value.data);
    const data = isValidCVData(value.data)
      ? cloneValue(value.data)
      : isValidCVData(bulletMigrated)
        ? bulletMigrated
        : null;
    if (typeof value.id !== 'string' || typeof value.name !== 'string' ||
      typeof value.savedAt !== 'number' || !Number.isFinite(value.savedAt) || !data) return null;
    return {
      id: value.id,
      name: value.name,
      savedAt: value.savedAt,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      data,
    };
  } catch {
    return null;
  }
}

export function loadSnapshots(): SnapshotCollection {
  try {
    const snapshots: CVSnapshot[] = [];
    let rejectedCount = 0;

    for (const entry of readSnapshotEntries()) {
      const snapshot = normalizeSnapshot(entry);
      if (snapshot) snapshots.push(snapshot);
      else rejectedCount += 1;
    }

    return { snapshots, rejectedCount };
  } catch {
    return { snapshots: [], rejectedCount: 1 };
  }
}

export function saveSnapshot(name: string, data: CVData): CVSnapshot {
  const snapshot: CVSnapshot = {
    id: uid(),
    name,
    savedAt: Date.now(),
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    data: cloneValue(data),
  };

  try {
    let validCount = 1;
    const retained = readSnapshotEntries().filter((entry) => {
      if (!normalizeSnapshot(entry)) return true;
      validCount += 1;
      return validCount <= MAX_SNAPSHOTS;
    });
    localStorage.setItem(SNAPSHOTS_STORAGE_KEY, JSON.stringify([snapshot, ...retained]));
  } catch (error) {
    console.error('Failed to save snapshot without replacing unreadable saved data:', error);
  }

  return cloneValue(snapshot);
}

export function deleteSnapshot(id: string): void {
  try {
    const next = readSnapshotEntries().filter((entry) => normalizeSnapshot(entry)?.id !== id);
    localStorage.setItem(SNAPSHOTS_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.error('Failed to delete snapshot without replacing unreadable saved data:', error);
  }
}

function createBlankSection(type: CVSection['type'], title: string, item: CVItem): CVSection {
  return {
    id: uid(),
    type,
    title,
    layout: defaultLayoutFor(type),
    content: {
      schema: builtInSectionSchemas[type],
      items: [item],
    },
  };
}

export function createBlankCVData(): CVData {
  return {
    template: { id: 'single-column', columns: 1 },
    header: {
      name: '',
      location: '',
      phone: '',
      email: '',
      socialLinks: [],
    },
    sections: [
      createBlankSection('summary', 'PROFESSIONAL SUMMARY', {
        id: uid(),
        fields: { body: '' },
      }),
      createBlankSection('work-experience', 'WORK EXPERIENCE', {
        id: uid(),
        fields: {
          title: '',
          subtitle: '',
          location: '',
          date: '',
          bullets: [{ id: uid(), text: '' }],
        },
      }),
      createBlankSection('education', 'EDUCATION', {
        id: uid(),
        fields: { title: '', subtitle: '', date: '' },
      }),
      createBlankSection('skills', 'SKILLS', {
        id: uid(),
        fields: { label: 'Category', value: '' },
      }),
    ],
  };
}
