import { describe, expect, it } from 'vitest';
import { dateRangeString } from '../../src/utils/dateUtils';

describe('dateRangeString', () => {
  it('formats complete date ranges with the selected format', () => {
    expect(
      dateRangeString(
        { month: 1, year: 2020 },
        { month: 6, year: 2022 },
        'Mon YYYY'
      )
    ).toBe('Jan 2020 – Jun 2022');
  });

  it('handles present and partial ranges', () => {
    expect(dateRangeString({ month: null, year: 2024 }, 'present', 'YYYY')).toBe('2024 – Present');
    expect(dateRangeString(undefined, { month: 3, year: 2025 }, 'MM/YYYY')).toBe('03/2025');
    expect(dateRangeString(undefined, undefined, 'MM/YYYY')).toBe('');
  });
});
