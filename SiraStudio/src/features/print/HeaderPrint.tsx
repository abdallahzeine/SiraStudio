import { Mail, MapPin, Phone } from 'lucide-react';
import type { CVData } from '../../shared/types';
import { getIconColor, LinkTypeIcon } from '../links/icons';
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
          <MapPin size={16} className="shrink-0" />
          <PrintRichText value={header.location} inline />
        </div>
        <div className="flex items-center gap-1">
          <Phone size={16} className="shrink-0" />
          <PrintRichText value={header.phone} inline />
        </div>
        <div className="flex items-center gap-1">
          <Mail size={16} className="shrink-0" />
          <PrintRichText value={header.email} className="text-[#0078D7]" inline />
        </div>
      </div>
      {header.socialLinks.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-4 mt-2">
          {header.socialLinks.map((link) => (
            <a
              key={link.id}
              href={link.url}
              className="inline-flex items-center gap-1.5 text-xs text-black"
            >
              <LinkTypeIcon
                type={link.iconType}
                customIconUrl={link.customIconUrl}
                size={16}
                color={getIconColor(link.iconType, link.color)}
              />
              <span>{link.label}</span>
            </a>
          ))}
        </div>
      )}
    </header>
  );
}
