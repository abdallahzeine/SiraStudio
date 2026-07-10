import type { DateSlot } from '../../../shared/types';
import { CVTextEditor } from '../editor/CVTextEditor';

interface HeadingBlockProps {
  title: string;
  titlePath: string;
  subtitle?: string;
  subtitlePath?: string;
  role?: string;
  rolePath?: string;
  location?: string;
  locationPath?: string;
  date?: string;
  datePath?: string;
  dateSlot: DateSlot;
  titlePlaceholder?: string;
  subtitlePlaceholder?: string;
  rolePlaceholder?: string;
  locationPlaceholder?: string;
  datePlaceholder?: string;
  titleClassName?: string;
  subtitleClassName?: string;
}

export function HeadingBlock({
  title, titlePath,
  subtitle, subtitlePath,
  role, rolePath,
  location, locationPath,
  date, datePath,
  dateSlot,
  titlePlaceholder = 'Title',
  subtitlePlaceholder = 'Subtitle',
  rolePlaceholder = 'Role',
  locationPlaceholder = 'City, Country',
  datePlaceholder = 'MM/YYYY',
  titleClassName = 'text-base font-semibold',
  subtitleClassName = 'text-gray-700 text-sm',
}: HeadingBlockProps) {
  const dateEl = (date !== undefined && dateSlot !== 'hidden') ? (
    <div className="text-gray-600 text-sm whitespace-nowrap">
      {datePath
        ? <CVTextEditor value={date} path={datePath} placeholder={datePlaceholder} />
        : date}
    </div>
  ) : null;

  const locationEl = location !== undefined && locationPath ? (
    <CVTextEditor value={location} path={locationPath} placeholder={locationPlaceholder} className="text-gray-500" />
  ) : null;

  const subtitleEl = (subtitle !== undefined && subtitlePath) ? (
    <div className={subtitleClassName}>
      <CVTextEditor value={subtitle} path={subtitlePath} placeholder={subtitlePlaceholder} />
      {locationEl && (
        <> <span className="text-gray-400">·</span> {locationEl}</>
      )}
    </div>
  ) : locationEl ? (
    <div className={subtitleClassName}>{locationEl}</div>
  ) : null;

  const roleEl = role !== undefined && rolePath ? (
    <div className={subtitleClassName}>
      <CVTextEditor value={role} path={rolePath} placeholder={rolePlaceholder} />
    </div>
  ) : null;

  const titleEl = (
    <div className={`${titleClassName} leading-tight`} role="heading" aria-level={3}>
      <CVTextEditor value={title} path={titlePath} placeholder={titlePlaceholder} />
    </div>
  );

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
    const hasDate = date && date.trim() !== '';
    return (
      <div className="text-left">
        <div className={`${titleClassName} leading-tight`} role="heading" aria-level={3}>
          <CVTextEditor value={title} path={titlePath} placeholder={titlePlaceholder} />
          {hasDate && <span className="text-gray-400 mx-1">–</span>}
          {hasDate && dateEl}
        </div>
        {subtitleEl}
        {roleEl}
      </div>
    );
  }

  // below-title or hidden
  return (
    <div className="text-left">
      {titleEl}
      {dateSlot === 'below-title' && dateEl}
      {subtitleEl}
      {roleEl}
    </div>
  );
}
