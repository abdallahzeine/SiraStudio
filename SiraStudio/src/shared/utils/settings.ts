import type { CVData } from '../types';
import type { CVDocument } from '../../app/store/types';
import { createBlankCVData, isValidCVData } from '../../features/saves/utils/snapshots';
import { migrateCVData, migrateLegacyBulletEntries } from './cvContent';

const CV_KEY = 'cv-maker-cv-data';
const SCHEMA_VERSION = 1 as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function migrateLegacyData(parsed: unknown): CVData | null {
  if (
    !isRecord(parsed) ||
    !isRecord(parsed.header) ||
    !isRecord(parsed.template) ||
    !Array.isArray(parsed.sections)
  ) return null;
  if (!parsed.sections.every((section) =>
    isRecord(section) && isRecord(section.layout) && Array.isArray(section.items)
  )) return null;
  const data = migrateCVData(parsed);
  return isValidCVData(data) ? data : null;
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
  const bulletMigrated = migrateLegacyBulletEntries(parsed.data);
  const data = isValidCVData(parsed.data)
    ? parsed.data
    : isValidCVData(bulletMigrated)
      ? bulletMigrated
      : null;
  if (!data) return null;

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
    data,
    meta: { lastSavedAt },
  };
}

function wrapLegacyData(parsed: unknown): CVDocument | null {
  const data = migrateLegacyData(parsed);
  if (!data) return null;

  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    data,
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
      } else if (typeof schemaVersion === 'number' && schemaVersion > SCHEMA_VERSION) {
        console.warn(
          `[cv-maker] Stored schema v${schemaVersion} is newer than supported v${SCHEMA_VERSION}; loading defaults.`
        );
        return createDefaultDocument();
      } else if (schemaVersion === 0) {
        const migrated = wrapLegacyData(parsed.data);
        if (migrated) return migrated;
      }
    } else {
      if (isValidCVData(parsed)) {
        return {
          schemaVersion: SCHEMA_VERSION,
          revision: 0,
          data: parsed,
          meta: { lastSavedAt: Date.now() },
        };
      }

      const migratedLegacy = wrapLegacyData(parsed);
      if (migratedLegacy) return migratedLegacy;
    }

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

