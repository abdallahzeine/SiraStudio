import type { CVData, CVItem, CVSection } from '../types';
import { defaultLayoutFor, uid } from './helpers';

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
  if (!isRecord(value)) return false;
  if (!isRecord(value.header)) return false;
  if (!Array.isArray(value.sections)) return false;
  if (!isRecord(value.template)) return false;

  const header = value.header;
  if (
    typeof header.name !== 'string' ||
    typeof header.location !== 'string' ||
    typeof header.phone !== 'string' ||
    typeof header.email !== 'string' ||
    !Array.isArray(header.socialLinks)
  ) {
    return false;
  }

  const sections = value.sections;
  if (
    sections.some((section) => {
      if (!isRecord(section)) return true;
      return (
        typeof section.id !== 'string' ||
        typeof section.type !== 'string' ||
        typeof section.title !== 'string' ||
        !Array.isArray(section.items) ||
        !isRecord(section.layout)
      );
    })
  ) {
    return false;
  }

  const template = value.template;
  if (typeof template.id !== 'string') return false;
  if (template.columns !== 1 && template.columns !== 2) return false;

  return true;
}

function isValidSnapshot(value: unknown): value is CVSnapshot {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) return false;

  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.savedAt === 'number' &&
    Number.isFinite(value.savedAt) &&
    isValidCVData(value.data)
  );
}

function persistSnapshots(snapshots: CVSnapshot[]): void {
  try {
    localStorage.setItem(SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots));
  } catch (error) {
    console.error('Failed to save snapshots to localStorage:', error);
  }
}

export function loadSnapshots(): CVSnapshot[] {
  try {
    const stored = localStorage.getItem(SNAPSHOTS_STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];
    if (!parsed.every((entry) => isValidSnapshot(entry))) return [];

    return parsed.map((snapshot) => ({
      id: snapshot.id,
      name: snapshot.name,
      savedAt: snapshot.savedAt,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      data: cloneValue(snapshot.data),
    }));
  } catch {
    return [];
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

  const next = [snapshot, ...loadSnapshots()].slice(0, MAX_SNAPSHOTS);
  persistSnapshots(next);

  return cloneValue(snapshot);
}

export function deleteSnapshot(id: string): void {
  const next = loadSnapshots().filter((snapshot) => snapshot.id !== id);
  persistSnapshots(next);
}

function createBlankSection(type: CVSection['type'], title: string, item: CVItem): CVSection {
  return {
    id: uid(),
    type,
    title,
    items: [item],
    layout: defaultLayoutFor(type),
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
        body: '',
      }),
      createBlankSection('work-experience', 'WORK EXPERIENCE', {
        id: uid(),
        title: '',
        subtitle: '',
        location: '',
        dateEnd: 'present',
        bullets: [''],
      }),
      createBlankSection('education', 'EDUCATION', {
        id: uid(),
        title: '',
        subtitle: '',
        date: '',
      }),
      createBlankSection('skills', 'SKILLS', {
        id: uid(),
        skillGroups: [],
      }),
    ],
  };
}
