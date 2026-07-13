import { describe, expect, it } from 'vitest';
import { initialCVData } from '../../src/features/cv-editor/data/initialCVData';
import { builtInSectionSchemas, migrateCVData } from '../../src/shared/utils/cvContent';
import { isValidCVData } from '../../src/features/saves/utils/snapshots';
import { createCVStore } from '../../src/app/store/store';
import type { CVItem } from '../../src/shared/types';

describe('CV content migration', () => {
  it('keeps duplicate bullets attached to stable ids through move, edit, and reload', () => {
    const legacy = structuredClone(initialCVData);
    const work = legacy.sections.find((section) => section.type === 'work-experience')!;
    work.content.items[0]!.fields.bullets = ['Same text', 'Same text'] as never;

    const migrated = migrateCVData(legacy);
    const migratedWork = migrated.sections.find((section) => section.type === 'work-experience')!;
    const bullets = migratedWork.content.items[0]!.fields.bullets as Array<{ id: string; text: string }>;
    const selectedId = bullets[0]!.id;
    expect(selectedId).not.toBe(bullets[1]!.id);

    const store = createCVStore({
      schemaVersion: 1,
      revision: 0,
      data: migrated,
      meta: { lastSavedAt: null },
    }, { persist: false });
    const sectionIndex = migrated.sections.indexOf(migratedWork);
    const path = `sections[${sectionIndex}].content.items[0].fields.bullets`;
    expect(store.dispatch({ op: 'move', from: `${path}[0]`, path: `${path}[1]` }).success).toBe(true);
    expect(store.dispatch({ op: 'set', path: `${path}[1].text`, value: 'Edited selected bullet' }).success).toBe(true);

    const reloaded = migrateCVData(JSON.parse(JSON.stringify(store.getSnapshot().data)));
    const reloadedBullets = reloaded.sections[sectionIndex]!.content.items[0]!.fields.bullets as Array<{ id: string; text: string }>;
    expect(reloadedBullets[1]).toEqual({ id: selectedId, text: 'Edited selected bullet' });
    expect(isValidCVData(reloaded)).toBe(true);
  });

  it('removes unsupported legacy fields at the local load migration boundary', () => {
    const legacyCV = {
      ...initialCVData,
      header: { ...initialCVData.header, nationality: 'Jordanian' },
      sections: initialCVData.sections.map((section, index) => (
        index === 3
          ? { ...section, layout: { ...section.layout, separator: 'line' } }
          : section
      )),
    };

    const migrated = migrateCVData(legacyCV);

    expect(migrated.header).not.toHaveProperty('nationality');
    expect(migrated.sections[3]?.layout.separator).toBe('none');
  });

  it('canonicalizes built-in schemas instead of preserving malformed content.schema', () => {
    const legacyCV = structuredClone(initialCVData);
    const project = legacyCV.sections.find((section) => section.type === 'projects')!;
    project.content.schema = project.content.schema.filter((field) => field.key !== 'subtitle');

    const migrated = migrateCVData(legacyCV);
    const migratedProject = migrated.sections.find((section) => section.type === 'projects');

    expect(migratedProject?.content.schema).toEqual(builtInSectionSchemas.projects);
    expect(isValidCVData(migrated)).toBe(true);
  });

  it('preserves multiple links attached to a section item', () => {
    const cv = structuredClone(initialCVData);
    const item = cv.sections[0]!.content.items[0]! as CVItem;
    item.links = [
      { id: 'item-link-1', url: 'https://example.com', label: 'Website', iconType: 'globe', displayOrder: 0 },
      { id: 'item-link-2', url: 'https://github.com/example', label: 'GitHub', iconType: 'github', displayOrder: 1 },
    ];

    const migrated = migrateCVData(cv);

    expect(migrated.sections[0]?.content.items[0]?.links).toEqual(item.links);
    expect(isValidCVData(migrated)).toBe(true);
  });

  it('repairs cross-section duplicate item ids: first kept, later rewritten, selection cannot cross-match', () => {
    const raw = structuredClone(initialCVData);
    const cert = raw.sections.find((section) => section.type === 'certifications')!;
    const award = raw.sections.find((section) => section.type === 'awards')!;
    const certFields = structuredClone(cert.content.items[0]!.fields);
    const awardFields = structuredClone(award.content.items[0]!.fields);
    cert.keepTogetherGroup = 'cert-section-group';
    award.content.items[0]!.keepTogetherGroup = 'award-item-group';
    cert.content.items[0]!.id = 'item-1';
    award.content.items[0]!.id = 'item-1';

    expect(isValidCVData(raw)).toBe(false);

    const migrated = migrateCVData(raw);
    const mCert = migrated.sections.find((section) => section.type === 'certifications')!;
    const mAward = migrated.sections.find((section) => section.type === 'awards')!;
    const certId = mCert.content.items[0]!.id;
    const awardId = mAward.content.items[0]!.id;

    expect(certId).toBe('item-1');
    expect(awardId).not.toBe('item-1');
    expect(awardId.length).toBeGreaterThan(0);
    expect(mCert.content.items[0]!.fields).toEqual(certFields);
    expect(mAward.content.items[0]!.fields).toEqual(awardFields);
    expect(mCert.keepTogetherGroup).toBe('cert-section-group');
    expect(mAward.content.items[0]!.keepTogetherGroup).toBe('award-item-group');
    expect(isValidCVData(migrated)).toBe(true);

    const byId = new Map(
      migrated.sections.flatMap((section) =>
        section.content.items.map((item) => [item.id, item] as const)
      )
    );
    expect(byId.get(certId)?.fields).toEqual(certFields);
    expect(byId.get(awardId)?.fields).toEqual(awardFields);
    expect(byId.get(certId)).not.toBe(byId.get(awardId));

    const store = createCVStore({
      schemaVersion: 1,
      revision: 0,
      data: migrated,
      meta: { lastSavedAt: null },
    }, { persist: false });
    const awardIndex = migrated.sections.findIndex((section) => section.type === 'awards');
    const duplicateResult = store.dispatch({
      op: 'set',
      path: `sections[${awardIndex}].content.items[0].id`,
      value: certId,
    }, { origin: 'external' });

    expect(duplicateResult).toMatchObject({
      success: false,
      error: { code: 'INVALID_CV_DATA' },
    });
    expect(store.getSnapshot().data.sections[awardIndex]?.content.items[0]?.id).toBe(awardId);
  });
});

describe('current CV contract validation', () => {
  it('rejects raw empty data instead of defaulting it', () => {
    expect(isValidCVData({})).toBe(false);
  });

  it('rejects unknown section types instead of dropping them', () => {
    const cv = structuredClone(initialCVData) as unknown as Record<string, unknown>;
    const sections = cv.sections as Array<Record<string, unknown>>;
    sections.push({ ...sections[0], id: 'unknown-section', type: 'spacer' });

    expect(isValidCVData(cv)).toBe(false);
  });

  it('rejects built-in schemas missing a canonical field', () => {
    const cv = structuredClone(initialCVData);
    const project = cv.sections.find((section) => section.type === 'projects')!;
    project.content.schema = project.content.schema.filter((field) => field.key !== 'subtitle');

    expect(isValidCVData(cv)).toBe(false);
  });

  it('rejects undeclared item fields and values with the wrong field kind', () => {
    const undeclared = structuredClone(initialCVData);
    undeclared.sections[0]!.content.items[0]!.fields.unexpected = 'not declared';

    const wrongKind = structuredClone(initialCVData);
    wrongKind.sections[0]!.content.items[0]!.fields.bullets = 'not a list';

    expect(isValidCVData(undeclared)).toBe(false);
    expect(isValidCVData(wrongKind)).toBe(false);
  });

  it('validates header links, ids, layouts, templates, and date formats', () => {
    const cases = [
      (cv: typeof initialCVData) => { cv.header.socialLinks[0]!.iconType = 'invalid' as never; },
      (cv: typeof initialCVData) => { cv.sections[0]!.id = 1 as never; },
      (cv: typeof initialCVData) => { cv.sections[0]!.layout.density = 'dense' as never; },
      (cv: typeof initialCVData) => { cv.template.id = 'unknown' as never; },
      (cv: typeof initialCVData) => { cv.template.columns = 3 as never; },
      (cv: typeof initialCVData) => { cv.dateFormat = 'DD/MM/YYYY' as never; },
    ];

    for (const mutate of cases) {
      const cv = structuredClone(initialCVData);
      mutate(cv);
      expect(isValidCVData(cv)).toBe(false);
    }
  });

  it('represents project Tech Stack as the canonical subtitle field', () => {
    expect(builtInSectionSchemas.projects).toContainEqual({
      key: 'subtitle',
      label: 'Tech Stack',
      kind: 'text',
    });
  });
});
