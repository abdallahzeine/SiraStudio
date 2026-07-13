import { initialCVData } from '../cv-editor/data/initialCVData';
import { diffCVData } from '../../app/store';
import type { CVDocument, DispatchResult, Patch, PatchError, StoreAPI } from '../../app/store';
import { sanitizeRichText } from '../../app/store/sanitize';
import { defaultLayoutFor, uid } from '../../shared/utils/helpers';
import type { CVData, CVItem, CVSection, IconType, SocialLink, SkillGroup } from '../../shared/types';
import { fieldBulletArray, fieldString, migrateCVData, migrateLegacyBulletEntries, skillGroupFromItem } from '../../shared/utils/cvContent';
import { isValidCVData } from '../saves/utils/snapshots';
import { importJSONWithResolver, type ExternalImportFormat } from './import';

type LegacyCVItem = {
  id: string;
  title?: string;
  subtitle?: string;
  role?: string;
  location?: string;
  date?: string;
  body?: string;
  bullets?: string[];
  skillGroups?: SkillGroup[];
};

export interface CVMakerExternalAPI {
  readonly schemaVersion: 1;
  getSnapshot(): Readonly<CVDocument>;
  dispatch(patch: Patch | Patch[]): DispatchResult;
  subscribe(cb: (doc: CVDocument, appliedPatches: Patch[]) => void): () => void;
  diff(from: CVData, to: CVData): Patch[];
  importJSON(raw: unknown, fmt?: ExternalImportFormat): DispatchResult;
  export: {
    toJSON(): string;
    toPlainText(): string;
    toHTML(): string;
  };
}

const EXTERNAL_SCHEMA_VERSION = 1 as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepCloneFallback(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => deepCloneFallback(item));
  }

  if (isRecord(value)) {
    const output: Record<string, unknown> = {};
    Object.entries(value).forEach(([key, current]) => {
      output[key] = deepCloneFallback(current);
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

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  if (seen.has(value)) {
    return value;
  }

  seen.add(value);
  Object.freeze(value);

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value);

  entries.forEach(([, current]) => {
    deepFreeze(current, seen);
  });

  return value;
}

function cloneAndFreezeDocument(doc: CVDocument): CVDocument {
  return deepFreeze(cloneValue(doc));
}

function isEnabled(value: string | undefined): boolean {
  if (!value) return false;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

function patchError(code: string, message: string, path?: string): PatchError {
  return { code, message, path };
}

function invalidResult(code: string, message: string, path?: string): DispatchResult {
  return {
    success: false,
    error: patchError(code, message, path),
  };
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function ensureStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function migrateLegacyCVData(value: unknown): CVData | null {
  if (
    !isRecord(value) ||
    !isRecord(value.header) ||
    !isRecord(value.template) ||
    !Array.isArray(value.sections)
  ) return null;
  if (!value.sections.every((section) =>
    isRecord(section) && isRecord(section.layout) && Array.isArray(section.items)
  )) return null;
  const data = migrateCVData(cloneValue(value));
  return isValidCVData(data) ? data : null;
}

function toDateRange(startDate: unknown, endDate: unknown): string {
  const start = toNonEmptyString(startDate) ?? '';
  const end = toNonEmptyString(endDate) ?? '';

  if (!start && !end) return '';
  if (!end) return start;
  if (!start) return end;

  return `${start} - ${end}`;
}

function mapNetworkToIconType(network: string): IconType {
  const lower = network.toLowerCase();
  if (lower.includes('github')) return 'github';
  if (lower.includes('linkedin')) return 'linkedin';
  if (lower.includes('twitter') || lower.includes('x.com')) return 'twitter';
  if (lower.includes('instagram')) return 'instagram';
  if (lower.includes('facebook')) return 'facebook';
  if (lower.includes('youtube')) return 'youtube';
  if (lower.includes('mail')) return 'mail';
  if (lower.includes('phone') || lower.includes('tel')) return 'phone';
  if (lower.includes('portfolio')) return 'portfolio';
  return 'globe';
}

function toProfileURL(profile: Record<string, unknown>, network: string): string | null {
  const direct = toNonEmptyString(profile.url);
  if (direct) return direct;

  const username = toNonEmptyString(profile.username);
  if (!username) return null;

  const clean = username.replace(/^@/, '');
  const lower = network.toLowerCase();

  if (lower.includes('github')) return `https://github.com/${clean}`;
  if (lower.includes('linkedin')) return `https://linkedin.com/in/${clean}`;
  if (lower.includes('twitter') || lower.includes('x.com')) return `https://x.com/${clean}`;
  return clean;
}

function mapJSONResumeHeader(raw: Record<string, unknown>): CVData['header'] {
  const basics = isRecord(raw.basics) ? raw.basics : {};
  const locationObj = isRecord(basics.location) ? basics.location : {};

  const location = [
    toNonEmptyString(locationObj.city),
    toNonEmptyString(locationObj.region),
    toNonEmptyString(locationObj.countryCode),
  ]
    .filter((part): part is string => Boolean(part))
    .join(', ');

  const profiles = Array.isArray(basics.profiles)
    ? basics.profiles.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];

  const socialLinks: SocialLink[] = profiles
    .map((profile, index) => {
      const network = toNonEmptyString(profile.network) ?? 'Profile';
      const url = toProfileURL(profile, network);

      if (!url) return null;

      return {
        id: uid(),
        label: network,
        url,
        iconType: mapNetworkToIconType(network),
        displayOrder: index,
      } as SocialLink;
    })
    .filter((entry): entry is SocialLink => entry !== null);

  return {
    name: toNonEmptyString(basics.name) ?? '',
    headline: toNonEmptyString(basics.label) ?? undefined,
    location,
    phone: toNonEmptyString(basics.phone) ?? '',
    email: toNonEmptyString(basics.email) ?? '',
    socialLinks,
  };
}

function createSection(type: CVSection['type'], title: string, items: LegacyCVItem[]): CVSection {
  return migrateCVData({
    header: { name: '', location: '', phone: '', email: '', socialLinks: [] },
    template: { id: 'single-column', columns: 1 },
    sections: [{ id: uid(), type, title, layout: defaultLayoutFor(type), items }],
  }).sections[0];
}

function mapJSONResumeToSections(raw: Record<string, unknown>): CVSection[] {
  const sections: CVSection[] = [];

  const basics = isRecord(raw.basics) ? raw.basics : {};
  const summary = toNonEmptyString(basics.summary);
  if (summary) {
    sections.push(
      createSection('summary', 'PROFESSIONAL SUMMARY', [{ id: uid(), body: summary }])
    );
  }

  const workItems: LegacyCVItem[] = Array.isArray(raw.work)
    ? raw.work
        .filter((entry): entry is Record<string, unknown> => isRecord(entry))
        .map((entry) => {
          const highlights = ensureStringArray(entry.highlights);
          const summaryText = toNonEmptyString(entry.summary);
          return {
            id: uid(),
            title: toNonEmptyString(entry.position) ?? '',
            subtitle: toNonEmptyString(entry.name) ?? '',
            location: toNonEmptyString(entry.location) ?? '',
            date: toDateRange(entry.startDate, entry.endDate),
            bullets: highlights.length > 0 ? highlights : summaryText ? [summaryText] : [],
          };
        })
        .filter((item) => {
          return (
            (item.title ?? '').trim() !== '' ||
            (item.subtitle ?? '').trim() !== '' ||
            (item.location ?? '').trim() !== '' ||
            (item.date ?? '').trim() !== '' ||
            (item.bullets?.length ?? 0) > 0
          );
        })
    : [];

  if (workItems.length > 0) {
    sections.push(createSection('work-experience', 'WORK EXPERIENCE', workItems));
  }

  const educationItems: LegacyCVItem[] = Array.isArray(raw.education)
    ? raw.education
        .filter((entry): entry is Record<string, unknown> => isRecord(entry))
        .map((entry) => {
          const degree = [toNonEmptyString(entry.studyType), toNonEmptyString(entry.area)]
            .filter((part): part is string => Boolean(part))
            .join(' ')
            .trim();

          return {
            id: uid(),
            title: degree || toNonEmptyString(entry.institution) || '',
            subtitle: degree ? toNonEmptyString(entry.institution) ?? '' : '',
            date: toDateRange(entry.startDate, entry.endDate),
          };
        })
        .filter((item) => (item.title ?? '').trim() !== '' || (item.subtitle ?? '').trim() !== '' || (item.date ?? '').trim() !== '')
    : [];

  if (educationItems.length > 0) {
    sections.push(createSection('education', 'EDUCATION', educationItems));
  }

  const skillGroups: SkillGroup[] = Array.isArray(raw.skills)
    ? raw.skills
        .filter((entry): entry is Record<string, unknown> => isRecord(entry))
        .map((entry) => {
          const keywords = ensureStringArray(entry.keywords).join(', ');
          return {
            id: uid(),
            label: toNonEmptyString(entry.name) ?? 'Skills',
            value: keywords,
          };
        })
        .filter((group) => group.value.trim() !== '' || group.label.trim() !== '')
    : [];

  if (skillGroups.length > 0) {
    sections.push(createSection('skills', 'SKILLS', [{ id: uid(), skillGroups }]));
  }

  const projectItems: LegacyCVItem[] = Array.isArray(raw.projects)
    ? raw.projects
        .filter((entry): entry is Record<string, unknown> => isRecord(entry))
        .map((entry) => {
          const highlights = ensureStringArray(entry.highlights);
          const description = toNonEmptyString(entry.description);
          const url = toNonEmptyString(entry.url);
          const bullets = [...highlights];

          if (description) {
            bullets.unshift(description);
          }

          if (url) {
            bullets.push(url);
          }

          return {
            id: uid(),
            title: toNonEmptyString(entry.name) ?? '',
            date: toDateRange(entry.startDate, entry.endDate),
            bullets,
          };
        })
        .filter((item) => (item.title ?? '').trim() !== '' || (item.bullets?.length ?? 0) > 0)
    : [];

  if (projectItems.length > 0) {
    sections.push(createSection('projects', 'PROJECTS', projectItems));
  }

  const awardItems: LegacyCVItem[] = Array.isArray(raw.awards)
    ? raw.awards
        .filter((entry): entry is Record<string, unknown> => isRecord(entry))
        .map((entry) => ({
          id: uid(),
          title: toNonEmptyString(entry.title) ?? '',
          subtitle: toNonEmptyString(entry.awarder) ?? '',
          date: toNonEmptyString(entry.date) ?? '',
        }))
        .filter((item) => (item.title ?? '').trim() !== '' || (item.subtitle ?? '').trim() !== '' || (item.date ?? '').trim() !== '')
    : [];

  if (awardItems.length > 0) {
    sections.push(createSection('awards', 'AWARDS & SCHOLARSHIPS', awardItems));
  }

  const volunteerItems: LegacyCVItem[] = Array.isArray(raw.volunteer)
    ? raw.volunteer
        .filter((entry): entry is Record<string, unknown> => isRecord(entry))
        .map((entry) => ({
          id: uid(),
          title: toNonEmptyString(entry.organization) ?? '',
          role: toNonEmptyString(entry.position) ?? '',
          date: toDateRange(entry.startDate, entry.endDate),
        }))
        .filter((item) => (item.title ?? '').trim() !== '' || (item.role ?? '').trim() !== '' || (item.date ?? '').trim() !== '')
    : [];

  if (volunteerItems.length > 0) {
    sections.push(createSection('volunteering', 'VOLUNTEERING & LEADERSHIP', volunteerItems));
  }

  return sections;
}

function mapJSONResumeToCVData(parsed: Record<string, unknown>): CVData {
  const base = cloneValue(initialCVData);

  return {
    ...base,
    header: mapJSONResumeHeader(parsed),
    sections: mapJSONResumeToSections(parsed),
  };
}

function resolveImportData(raw: unknown, fmt: ExternalImportFormat): CVData | null {
  if (fmt === 'json-resume') {
    if (!isRecord(raw)) return null;
    return mapJSONResumeToCVData(raw);
  }

  if (isRecord(raw) && 'schemaVersion' in raw) {
    if (raw.schemaVersion === EXTERNAL_SCHEMA_VERSION) {
      if (isValidCVData(raw.data)) return cloneValue(raw.data);
      const migrated = migrateLegacyBulletEntries(raw.data);
      return isValidCVData(migrated) ? migrated : null;
    }
    if (raw.schemaVersion === 0) return migrateLegacyCVData(raw.data);
    return null;
  }

  if (isValidCVData(raw)) return cloneValue(raw);
  const migrated = migrateLegacyBulletEntries(raw);
  if (isValidCVData(migrated)) return migrated;
  return migrateLegacyCVData(raw);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stripRichText(value: string | undefined): string {
  if (!value) return '';
  const parser = new DOMParser();
  const source = parser.parseFromString(`<div>${value}</div>`, 'text/html');
  return normalizeWhitespace(source.body.textContent ?? '');
}

function itemToPlainText(item: CVItem): string[] {
  const lines: string[] = [];

  const summary = [
    fieldString(item, 'title'),
    fieldString(item, 'subtitle'),
    fieldString(item, 'role'),
    fieldString(item, 'location'),
    fieldString(item, 'date'),
  ]
    .map((value) => normalizeWhitespace(value ?? ''))
    .filter((value) => value.length > 0)
    .join(' | ');

  if (summary) {
    lines.push(`- ${summary}`);
  }

  const body = stripRichText(fieldString(item, 'body'));
  if (body) {
    lines.push(summary ? `  ${body}` : `- ${body}`);
  }

  fieldBulletArray(item, 'bullets').forEach((bullet) => {
    const normalized = stripRichText(bullet.text);
    if (normalized) {
      lines.push(`  * ${normalized}`);
    }
  });

  const skillGroup = skillGroupFromItem(item);
  if (skillGroup.label || skillGroup.value) {
    lines.push(`  * ${skillGroup.label}: ${skillGroup.value}`.trim());
  }

  item.links?.forEach((link) => {
    const value = normalizeWhitespace(link.url || link.label);
    if (value) lines.push(`  * ${value}`);
  });

  const knownKeys = new Set(['title', 'subtitle', 'role', 'location', 'date', 'body', 'bullets', 'label', 'value']);
  Object.keys(item.fields)
    .filter((key) => !knownKeys.has(key))
    .sort()
    .forEach((key) => {
        const current = item.fields[key];
        if (Array.isArray(current)) {
          const joined = current.map((entry) => stripRichText(
            typeof entry === 'string' ? entry : entry.text
          )).filter(Boolean).join(', ');
          if (joined) {
            lines.push(`  * ${key}: ${joined}`);
          }
          return;
        }

        const text = stripRichText(typeof current === 'string' ? current : '');
        if (text) {
          lines.push(`  * ${key}: ${text}`);
        }
      });

  if (lines.length === 0) {
    lines.push('- (empty)');
  }

  return lines;
}

function escapeHTML(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed, window.location.origin);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function renderRichHTML(value: string | undefined): string {
  if (!value) return '';
  return sanitizeRichText(value);
}

function renderItemHTML(item: CVItem): string {
  const headingParts = [fieldString(item, 'title'), fieldString(item, 'subtitle'), fieldString(item, 'role')]
    .map((value) => normalizeWhitespace(value ?? ''))
    .filter((value) => value.length > 0);

  const metaParts = [fieldString(item, 'location'), fieldString(item, 'date')]
    .map((value) => normalizeWhitespace(value ?? ''))
    .filter((value) => value.length > 0);

  const bullets = fieldBulletArray(item, 'bullets')
    .map((bullet) => renderRichHTML(bullet.text))
    .filter((bullet) => bullet.trim().length > 0)
    .map((bullet) => `<li>${bullet}</li>`)
    .join('');

  const group = skillGroupFromItem(item);
  const groups = group.label || group.value
    ? `<li><strong>${escapeHTML(normalizeWhitespace(group.label))}</strong>${group.label && group.value ? ': ' : ''}${escapeHTML(normalizeWhitespace(group.value))}</li>`
    : '';

  const knownKeys = new Set(['title', 'subtitle', 'role', 'location', 'date', 'body', 'bullets', 'label', 'value']);
  const values = Object.keys(item.fields)
        .filter((key) => !knownKeys.has(key))
        .sort()
        .map((key) => {
          const current = item.fields[key];
          const rendered = Array.isArray(current)
            ? current
                .map((entry) => escapeHTML(normalizeWhitespace(typeof entry === 'string' ? entry : entry.text)))
                .filter((entry) => entry.length > 0)
                .join(', ')
            : escapeHTML(normalizeWhitespace(typeof current === 'string' ? current : ''));

          if (!rendered) return '';
          return `<li><strong>${escapeHTML(key)}</strong>: ${rendered}</li>`;
        })
        .filter((entry) => entry.length > 0)
        .join('');

  const headingHTML = headingParts.length > 0
    ? `<h3>${escapeHTML(headingParts.join(' - '))}</h3>`
    : '';

  const metaHTML = metaParts.length > 0
    ? `<p class="item-meta">${escapeHTML(metaParts.join(' | '))}</p>`
    : '';

  const body = fieldString(item, 'body');
  const bodyHTML = body ? `<div class="item-body">${renderRichHTML(body)}</div>` : '';
  const bulletsHTML = bullets ? `<ul>${bullets}</ul>` : '';
  const groupsHTML = groups ? `<ul class="kv-list">${groups}</ul>` : '';
  const valuesHTML = values ? `<ul class="kv-list">${values}</ul>` : '';
  const links = item.links
    ?.map((link) => {
      const label = escapeHTML(normalizeWhitespace(link.label || link.url));
      const href = isSafeHref(link.url) ? escapeHTML(link.url) : null;
      if (!label) return '';
      return href ? `<li><a href="${href}">${label}</a></li>` : `<li>${label}</li>`;
    })
    .filter(Boolean)
    .join('');
  const linksHTML = links ? `<ul class="kv-list">${links}</ul>` : '';

  return `<article class="item">${headingHTML}${metaHTML}${bodyHTML}${bulletsHTML}${groupsHTML}${valuesHTML}${linksHTML}</article>`;
}

function buildHTMLExport(doc: CVDocument): string {
  const contactParts = [doc.data.header.location, doc.data.header.phone, doc.data.header.email]
    .map((value) => normalizeWhitespace(value))
    .filter((value) => value.length > 0)
    .map((value) => `<span>${escapeHTML(value)}</span>`)
    .join('<span class="sep"> | </span>');

  const socialHTML = doc.data.header.socialLinks
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((link) => {
      const label = escapeHTML(normalizeWhitespace(link.label || link.url));
      const href = isSafeHref(link.url) ? escapeHTML(link.url) : null;
      if (!href) return `<li>${label}</li>`;
      return `<li><a href="${href}">${label}</a></li>`;
    })
    .join('');

  const sectionsHTML = doc.data.sections
    .map((section) => {
      const title = normalizeWhitespace(section.title || section.type);
      const items = section.content.items.map((item) => renderItemHTML(item)).join('');
      return `<section><h2>${escapeHTML(title)}</h2>${items}</section>`;
    })
    .join('');

  const headline = normalizeWhitespace(doc.data.header.headline ?? '');

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHTML(normalizeWhitespace(doc.data.header.name || 'CV'))}</title>`,
    '<style>',
    'body{font-family:Georgia,serif;margin:0;background:#f5f5f5;color:#111827;}',
    '.sheet{max-width:850px;margin:24px auto;background:#fff;padding:32px 40px;box-shadow:0 8px 24px rgba(0,0,0,.08);}',
    'h1{font-size:28px;margin:0 0 4px;letter-spacing:.02em;}',
    '.headline{margin:0 0 10px;color:#374151;font-size:16px;}',
    '.contact{font-size:13px;color:#4b5563;display:flex;flex-wrap:wrap;gap:6px;}',
    '.sep{color:#9ca3af;}',
    '.social{margin:8px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:10px;font-size:13px;}',
    '.social a{text-decoration:none;color:#0f766e;}',
    'section{margin-top:20px;}',
    'h2{font-size:14px;margin:0 0 10px;padding-bottom:4px;border-bottom:1px solid #d1d5db;letter-spacing:.08em;text-transform:uppercase;}',
    '.item{margin-bottom:10px;}',
    '.item h3{font-size:14px;margin:0;font-weight:700;}',
    '.item-meta{margin:2px 0 4px;color:#4b5563;font-size:12px;}',
    '.item-body{font-size:13px;line-height:1.5;}',
    '.item ul{margin:4px 0 0 18px;padding:0;font-size:13px;line-height:1.5;}',
    '.kv-list{list-style:disc;}',
    '@media print{body{background:#fff;}.sheet{margin:0;box-shadow:none;padding:0;max-width:none;}}',
    '</style>',
    '</head>',
    '<body>',
    '<main class="sheet">',
    `<header><h1>${escapeHTML(normalizeWhitespace(doc.data.header.name))}</h1>`,
    headline ? `<p class="headline">${escapeHTML(headline)}</p>` : '',
    contactParts ? `<div class="contact">${contactParts}</div>` : '',
    socialHTML ? `<ul class="social">${socialHTML}</ul>` : '',
    '</header>',
    sectionsHTML,
    '</main>',
    '</body>',
    '</html>',
  ].join('');
}

function createExternalTxId(): string {
  return `external-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePatchInput(patch: Patch | Patch[]): Patch[] {
  return Array.isArray(patch) ? patch : [patch];
}

function createExternalAPI(store: StoreAPI): CVMakerExternalAPI {
  const api: CVMakerExternalAPI = {
    schemaVersion: EXTERNAL_SCHEMA_VERSION,
    getSnapshot: () => {
      return cloneAndFreezeDocument(store.getSnapshot()) as Readonly<CVDocument>;
    },
    dispatch: (patch) => {
      const patches = normalizePatchInput(patch);
      if (patches.length === 0) {
        return invalidResult('INVALID_PATCH', 'At least one patch is required');
      }

      return store.dispatch(patches, {
        origin: 'external',
        txId: createExternalTxId(),
        label: 'external-api',
      });
    },
    subscribe: (cb) => {
      let previousData = cloneValue(store.getSnapshot().data);

      return store.subscribe((doc) => {
        const cloned = cloneValue(doc);
        const appliedPatches = diffCVData(previousData, cloned.data);
        previousData = cloneValue(cloned.data);
        cb(deepFreeze(cloned), appliedPatches);
      });
    },
    diff: (from, to) => {
      return diffCVData(from, to);
    },
    importJSON: (raw, fmt = 'cv-maker') => {
      return importJSONWithResolver(store, raw, fmt, resolveImportData);
    },
    export: {
      toJSON: () => JSON.stringify(api.getSnapshot(), null, 2),
      toPlainText: () => {
        const doc = api.getSnapshot();
        const lines: string[] = [];

        const header = doc.data.header;
        const heading = normalizeWhitespace(header.name);
        if (heading) lines.push(heading);

        const headline = normalizeWhitespace(header.headline ?? '');
        if (headline) lines.push(headline);

        const contact = [header.location, header.phone, header.email]
          .map((value) => normalizeWhitespace(value))
          .filter((value) => value.length > 0)
          .join(' | ');

        if (contact) lines.push(contact);

        const social = header.socialLinks
          .slice()
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((link) => normalizeWhitespace(link.url || link.label))
          .filter((value) => value.length > 0)
          .join(' | ');

        if (social) {
          lines.push(social);
        }

        doc.data.sections.forEach((section) => {
          lines.push('');
          lines.push(normalizeWhitespace(section.title || section.type).toUpperCase());
          section.content.items.forEach((item) => {
            lines.push(...itemToPlainText(item));
          });
        });

        return lines.join('\n').trim();
      },
      toHTML: () => {
        const doc = api.getSnapshot();
        return buildHTMLExport(doc);
      },
    },
  };

  return api;
}

export function installExternalAPI(store: StoreAPI): void {
  if (!isEnabled(import.meta.env.VITE_ENABLE_EXTERNAL_API)) {
    return;
  }

  window.cvMaker = createExternalAPI(store);
}
