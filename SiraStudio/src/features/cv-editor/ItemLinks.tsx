import { createContext, useContext } from 'react';
import type { SocialLink } from '../../shared/types';
import { getIconColor, LinkTypeIcon } from '../links/icons';

const ItemLinksContext = createContext<SocialLink[] | undefined>(undefined);

export function ItemLinksProvider({ links, children }: { links?: SocialLink[]; children: React.ReactNode }) {
  return <ItemLinksContext.Provider value={links}>{children}</ItemLinksContext.Provider>;
}

export function CurrentItemLinks() {
  return <ItemLinks links={useContext(ItemLinksContext)} />;
}

/** Generic read-only item links for editor + print. */
function ItemLinks({ links }: { links?: SocialLink[] }) {
  if (!links?.length) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs">
      {links.map((link) => (
        <a
          key={link.id}
          href={link.url || undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[#0078D7] hover:underline"
        >
          <LinkTypeIcon
            type={link.iconType}
            customIconUrl={link.customIconUrl}
            size={12}
            color={getIconColor(link.iconType, link.color)}
            className="h-3 w-3 shrink-0"
          />
          {link.label || link.url}
        </a>
      ))}
    </div>
  );
}
