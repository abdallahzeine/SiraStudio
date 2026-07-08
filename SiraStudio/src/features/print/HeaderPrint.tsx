import type { CVData } from '../../shared/types';
import { getIconByType } from '../links/icons';
import { sanitizeRichText } from '../../app/store/sanitize';
import { PrintRichText } from './PrintRichText';

interface HeaderPrintProps {
  header: CVData['header'];
}

function hasPrintableContent(value: string | undefined): boolean {
  if (!value) return false;
  const sanitized = sanitizeRichText(value);
  const text = sanitized
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return text.length > 0;
}

export function HeaderPrint({ header }: HeaderPrintProps) {
  return (
    <header className="text-center mb-2">
      <div className="text-4xl font-bold text-gray-900 mb-1" role="heading" aria-level={1}>
        <PrintRichText value={header.name} className="text-4xl font-bold text-gray-900" inline />
      </div>
      {hasPrintableContent(header.headline) && (
        <div className="text-sm text-gray-500 mb-2">
          <PrintRichText value={header.headline} className="text-sm text-gray-500" inline />
        </div>
      )}
      <div className="flex flex-wrap justify-center items-center gap-4 text-sm text-gray-600 mb-3">
        <div className="flex items-center gap-1">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
          <PrintRichText value={header.location} inline />
        </div>
        <div className="flex items-center gap-1">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
          </svg>
          <PrintRichText value={header.phone} inline />
        </div>
        <div className="flex items-center gap-1">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
          </svg>
          <PrintRichText value={header.email} className="text-blue-600" inline />
        </div>
      </div>
      {header.socialLinks.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-4 mt-2">
          {header.socialLinks.map((link) => {
            const iconDef = getIconByType(link.iconType);
            const iconColor = link.color || iconDef.color;

            return (
              <a
                key={link.id}
                href={link.url}
                className="inline-flex items-center gap-1.5 text-xs text-black"
              >
                {link.iconType === 'custom' && link.customIconUrl ? (
                  <img src={link.customIconUrl} alt="" className="w-4 h-4" />
                ) : (
                  <span
                    className="w-4 h-4 inline-flex items-center justify-center"
                    style={{ color: iconColor }}
                    dangerouslySetInnerHTML={{
                      __html: iconDef.svg.replace('class="w-5 h-5"', 'width="16" height="16"'),
                    }}
                  />
                )}
                <span>{link.label}</span>
              </a>
            );
          })}
        </div>
      )}
    </header>
  );
}
