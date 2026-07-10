import { describe, expect, it } from 'vitest';
import { initialCVData } from '../../src/features/cv-editor/data/initialCVData';
import { migrateCVData } from '../../src/shared/utils/cvContent';

describe('CV content migration', () => {
  it('removes unsupported legacy fields before the agent receives a CV', () => {
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
});
