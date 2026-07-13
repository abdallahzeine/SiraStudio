import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCVStore } from '../../src/app/store/store';
import { initialCVData } from '../../src/features/cv-editor/data/initialCVData';
import { installExternalAPI } from '../../src/features/external-api/api';

function install() {
  vi.stubEnv('VITE_ENABLE_EXTERNAL_API', 'true');
  const store = createCVStore({
    schemaVersion: 1,
    revision: 0,
    data: structuredClone(initialCVData),
    meta: { lastSavedAt: null },
  }, { persist: false });
  installExternalAPI(store);
  return store;
}

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.cvMaker;
});

describe('native CV import flow', () => {
  it('round-trips the native export without changing ids or values', () => {
    const source = install();
    const exported = window.cvMaker!.export.toJSON();

    source.dispatch({ op: 'set', path: 'header.name', value: 'changed before import' });
    const result = window.cvMaker!.importJSON(exported);

    expect(result.success).toBe(true);
    expect(source.getSnapshot().data).toEqual(JSON.parse(exported).data);
  });

  it('exports bullet text without exposing bullet ids', () => {
    const source = install();
    const work = source.getSnapshot().data.sections.find((section) => section.type === 'work-experience')!;
    const bullet = work.content.items[0]!.fields.bullets[0] as { id: string; text: string };

    expect(window.cvMaker!.export.toPlainText()).toContain('Developed AI-powered features');
    expect(window.cvMaker!.export.toHTML()).toContain('Developed AI-powered features');
    expect(window.cvMaker!.export.toPlainText()).not.toContain(bullet.id);
    expect(window.cvMaker!.export.toHTML()).not.toContain(bullet.id);
  });

  it.each([
    null,
    {},
    { data: initialCVData },
    { schemaVersion: 1, revision: 0, data: {}, meta: { lastSavedAt: null } },
    { ...initialCVData, sections: [{ ...initialCVData.sections[0], content: null }] },
  ])('rejects invalid current payload atomically: %j', (payload) => {
    const store = install();
    const before = structuredClone(store.getSnapshot());
    const result = window.cvMaker!.importJSON(payload);

    expect(result).toMatchObject({
      success: false,
      error: { code: 'INVALID_IMPORT', message: expect.stringContaining('valid current schema') },
    });
    expect(store.getSnapshot()).toEqual(before);
  });
});
