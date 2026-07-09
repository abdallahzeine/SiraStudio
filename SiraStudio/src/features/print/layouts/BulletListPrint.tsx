import type { IconStyle } from '../../../shared/types';
import { PrintRichText } from '../PrintRichText';

interface BulletListPrintProps {
  bullets: string[];
  iconStyle: IconStyle;
}

const iconChar: Record<IconStyle, string> = {
  none: '',
  bullet: '•',
  dash: '–',
  chevron: '›',
};

export function BulletListPrint({ bullets, iconStyle }: BulletListPrintProps) {
  if (bullets.length === 0) return null;

  const icon = iconChar[iconStyle];

  return (
    <ul className={`text-gray-700 text-sm mt-0.5 space-y-0.5 ${icon ? 'list-none ml-8' : 'ml-0'}`}>
      {bullets.map((bullet, idx) => (
        <li key={`${idx}-${bullet.slice(0, 16)}`} className="flex items-start gap-1">
          {icon && <span className="shrink-0 select-none mt-0.5">{icon}</span>}
          <div className="flex-1 min-w-0">
            <PrintRichText value={bullet} />
          </div>
        </li>
      ))}
    </ul>
  );
}
