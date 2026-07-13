import { describe, expect, it } from 'vitest';
import { createCVStore } from '../../src/app/store/store';
import { initialCVData } from '../../src/features/cv-editor/data/initialCVData';
import { keepTogetherReorderPatches } from '../../src/features/cv-editor/keepTogetherReorder';

function createStore() {
  return createCVStore({
    schemaVersion: 1,
    revision: 0,
    data: structuredClone(initialCVData),
    meta: { lastSavedAt: null },
  }, { persist: false });
}

describe('keep-together reorder', () => {
  it('atomically clears a section group split by reorder', () => {
    const store = createStore();
    const sections = store.getSnapshot().data.sections;
    sections[0]!.keepTogetherGroup = 'group';
    sections[1]!.keepTogetherGroup = 'group';
    const movedId = sections[1]!.id;

    const result = store.dispatch(keepTogetherReorderPatches(sections, 1, 2, 'sections'));
    const reloaded = JSON.parse(JSON.stringify(store.getSnapshot().data));

    expect(result.success).toBe(true);
    expect(reloaded.sections[2].id).toBe(movedId);
    expect(reloaded.sections[0].keepTogetherGroup).toBeUndefined();
    expect(reloaded.sections[2].keepTogetherGroup).toBeUndefined();
  });

  it('atomically clears an item group split by reorder', () => {
    const store = createStore();
    const section = store.getSnapshot().data.sections.find(({ content }) => content.items.length >= 3)!;
    const sectionIndex = store.getSnapshot().data.sections.indexOf(section);
    section.content.items[0]!.keepTogetherGroup = 'group';
    section.content.items[1]!.keepTogetherGroup = 'group';
    const itemsPath = `sections[${sectionIndex}].content.items`;

    const result = store.dispatch(keepTogetherReorderPatches(section.content.items, 1, 2, itemsPath));
    const items = store.getSnapshot().data.sections[sectionIndex]!.content.items;

    expect(result.success).toBe(true);
    expect(items[0]!.keepTogetherGroup).toBeUndefined();
    expect(items[2]!.keepTogetherGroup).toBeUndefined();
  });
});
