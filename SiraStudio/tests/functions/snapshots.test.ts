import { beforeEach, describe, expect, it } from 'vitest';
import { initialCVData } from '../../src/features/cv-editor/data/initialCVData';
import { loadSnapshots, saveSnapshot } from '../../src/features/saves/utils/snapshots';

const STORAGE_KEY = 'cv-maker-snapshots';

function storedSnapshot(id: string) {
  return {
    id,
    name: id,
    savedAt: 1,
    schemaVersion: 1,
    data: structuredClone(initialCVData),
  };
}

describe('snapshot collection recovery', () => {
  beforeEach(() => localStorage.clear());

  it('keeps valid snapshots and the rejected entry when another snapshot is saved', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([
      storedSnapshot('first'),
      { id: 'newer', schemaVersion: 2 },
      storedSnapshot('second'),
    ]));

    expect(loadSnapshots()).toMatchObject({
      snapshots: [{ id: 'first' }, { id: 'second' }],
      rejectedCount: 1,
    });

    saveSnapshot('third', initialCVData);

    const afterSave = loadSnapshots();
    expect(afterSave.snapshots.map(({ name }) => name)).toEqual(['third', 'first', 'second']);
    expect(afterSave.rejectedCount).toBe(1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toContainEqual({
      id: 'newer',
      schemaVersion: 2,
    });
  });
});
