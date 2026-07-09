import type { StructuredDate, DateFormat } from '../types';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatStructuredDate(d: StructuredDate, fmt: DateFormat): string {
  if (fmt === 'YYYY') return String(d.year);
  if (fmt === 'Mon YYYY') {
    const mon = d.month != null ? MONTH_ABBR[d.month - 1] + ' ' : '';
    return mon + d.year;
  }
  // MM/YYYY default
  if (d.month != null) {
    return String(d.month).padStart(2, '0') + '/' + d.year;
  }
  return String(d.year);
}

export function dateRangeString(
  start: StructuredDate | undefined,
  end: StructuredDate | 'present' | undefined,
  fmt: DateFormat
): string {
  const startStr = start ? formatStructuredDate(start, fmt) : '';
  let endStr = '';
  if (end === 'present') endStr = 'Present';
  else if (end) endStr = formatStructuredDate(end, fmt);

  if (startStr && endStr) return `${startStr} – ${endStr}`;
  if (startStr) return startStr;
  if (endStr) return endStr;
  return '';
}
