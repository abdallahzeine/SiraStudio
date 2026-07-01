import type { CVData } from '../types';
import type { CVDocument } from '../store/types';
import { createBlankCVData } from './snapshots';

const CV_KEY = 'cv-maker-cv-data';
const SCHEMA_VERSION = 1 as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidSchema(parsed: unknown): parsed is CVData {
  if (!isRecord(parsed)) return false;
  const data = parsed;
  // Require new-schema fields: template at root, layout on every section
  if (!data.header || !Array.isArray(data.sections) || !data.template) return false;
  const sections = data.sections as Array<Record<string, unknown>>;
  if (sections.some((s) => !s.layout)) return false;
  return true;
}

function createDefaultDocument(): CVDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    data: createBlankCVData(),
    meta: { lastSavedAt: null },
  };
}

function normalizeDocument(parsed: Record<string, unknown>): CVDocument | null {
  if (parsed.schemaVersion !== SCHEMA_VERSION) return null;
  if (!isValidSchema(parsed.data)) return null;

  const revision =
    typeof parsed.revision === 'number' && Number.isFinite(parsed.revision) && parsed.revision >= 0
      ? Math.floor(parsed.revision)
      : 0;

  const meta = isRecord(parsed.meta) ? parsed.meta : {};
  const lastSavedAt =
    typeof meta.lastSavedAt === 'number' && Number.isFinite(meta.lastSavedAt)
      ? meta.lastSavedAt
      : null;

  return {
    schemaVersion: SCHEMA_VERSION,
    revision,
    data: parsed.data,
    meta: { lastSavedAt },
  };
}

function wrapLegacyData(parsed: unknown): CVDocument | null {
  if (!isValidSchema(parsed)) return null;

  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    data: parsed,
    meta: { lastSavedAt: Date.now() },
  };
}

export function loadCVData(): CVDocument {
  try {
    const stored = localStorage.getItem(CV_KEY);
    if (!stored) return createDefaultDocument();

    const parsed = JSON.parse(stored) as unknown;

    if (isRecord(parsed) && 'schemaVersion' in parsed) {
      const schemaVersion = parsed.schemaVersion;

      if (schemaVersion === SCHEMA_VERSION) {
        const normalized = normalizeDocument(parsed);
        if (normalized) return normalized;
      }

      if (typeof schemaVersion === 'number' && schemaVersion > SCHEMA_VERSION) {
        console.warn(
          `[cv-maker] Stored schema v${schemaVersion} is newer than supported v${SCHEMA_VERSION}; loading defaults.`
        );
        return createDefaultDocument();
      }

      if (typeof schemaVersion === 'number' && schemaVersion < SCHEMA_VERSION) {
        const migrated = wrapLegacyData(parsed.data);
        if (migrated) return migrated;
      }
    }

    const migratedLegacy = wrapLegacyData(parsed);
    if (migratedLegacy) return migratedLegacy;

    // Unknown schema — back up then reset
    try {
      localStorage.setItem(CV_KEY + '-backup', stored);
    } catch {
      // ignore backup write errors
    }
    console.info(
      '[cv-maker] Stored CV schema unsupported — backed up to cv-maker-cv-data-backup, resetting to defaults.'
    );
  } catch (error) {
    console.error('Failed to load CV data from localStorage:', error);
  }
  return createDefaultDocument();
}

export function saveCVData(doc: CVDocument): void {
  try {
    const next: CVDocument = {
      schemaVersion: SCHEMA_VERSION,
      revision: doc.revision,
      data: doc.data,
      meta: { lastSavedAt: Date.now() },
    };
    localStorage.setItem(CV_KEY, JSON.stringify(next));
  } catch (error) {
    console.error('Failed to save CV data to localStorage:', error);
  }
}

