import type { DateSlot } from '../../../shared/types';
import { PrintRichText } from '../PrintRichText';

interface HeadingBlockPrintProps {
  title: string;
  subtitle?: string;
  role?: string;
  location?: string;
  date?: string;
  dateSlot: DateSlot;
  titleClassName?: string;
  subtitleClassName?: string;
}

function hasRichTextContent(value?: string): boolean {
  if (!value) return false;
  const normalized = value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return normalized.length > 0;
}

export function HeadingBlockPrint({
  title,
  subtitle,
  role,
  location,
  date,
  dateSlot,
  titleClassName = 'text-base font-semibold',
  subtitleClassName = 'text-gray-700 text-sm',
}: HeadingBlockPrintProps) {
  const showDate = hasRichTextContent(date) && dateSlot !== 'hidden';

  const titleEl = (
    <h3 className={`${titleClassName} leading-tight`}>
      <PrintRichText value={title} inline />
      {dateSlot === 'left-margin' && showDate && (
        <>
          <span className="text-gray-400 mx-1">–</span>
          <PrintRichText value={date} className="text-gray-600 text-sm whitespace-nowrap" inline />
        </>
      )}
    </h3>
  );

  const subtitleEl = subtitle || location ? (
    <p className={subtitleClassName}>
      {subtitle ? <PrintRichText value={subtitle} inline /> : null}
      {subtitle && location ? <span className="text-gray-400"> · </span> : null}
      {location ? <PrintRichText value={location} className="text-gray-500" inline /> : null}
    </p>
  ) : null;

  const roleEl = role ? (
    <p className={subtitleClassName}>
      <PrintRichText value={role} inline />
    </p>
  ) : null;

  const dateEl = showDate && dateSlot !== 'left-margin' ? (
    <span className="text-gray-600 text-sm whitespace-nowrap">
      <PrintRichText value={date} inline />
    </span>
  ) : null;

  if (dateSlot === 'right-inline') {
    return (
      <div className="flex flex-wrap justify-between items-start gap-x-2 text-left">
        <div>
          {titleEl}
          {subtitleEl}
          {roleEl}
        </div>
        {dateEl && <div className="mt-0.5 ml-4 shrink-0">{dateEl}</div>}
      </div>
    );
  }

  if (dateSlot === 'left-margin') {
    return (
      <div className="text-left">
        {titleEl}
        {subtitleEl}
        {roleEl}
      </div>
    );
  }

  return (
    <div className="text-left">
      {titleEl}
      {dateSlot === 'below-title' && dateEl}
      {subtitleEl}
      {roleEl}
    </div>
  );
}
