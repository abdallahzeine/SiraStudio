import { useState } from 'react';
import type { CVItem, CVSection, SectionLayout, DateSlot, IconStyle, SocialLink } from '../../../shared/types';
import { sectionRegistry } from '../sections/registry';
import { LinkManager } from '../../links';

const dateSlotLabels: Record<DateSlot, string> = {
  'right-inline': 'Right',
  'below-title': 'Below',
  'left-margin': 'Title–Date',
  hidden: 'Hidden',
};

const iconStyleLabels: Record<IconStyle, string> = {
  none: 'None',
  bullet: '•',
  dash: '–',
  chevron: '›',
};

const LABEL_KEYS = ['title', 'label', 'subtitle', 'role', 'body', 'value', 'name'] as const;

function firstText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    const text = new DOMParser().parseFromString(value, 'text/html').body.textContent?.trim();
    return text || null;
  }
  if (Array.isArray(value)) {
    const hit = value.find((entry) =>
      (typeof entry === 'string' && entry.trim()) ||
      (typeof entry === 'object' && entry !== null && 'text' in entry && typeof entry.text === 'string' && entry.text.trim())
    );
    if (typeof hit === 'string') return hit.trim();
    if (typeof hit === 'object' && hit !== null && 'text' in hit && typeof hit.text === 'string') return hit.text.trim();
  }
  return null;
}

function itemLabel(item: CVItem, index: number): string {
  for (const key of LABEL_KEYS) {
    const text = firstText(item.fields[key]);
    if (text) return text;
  }
  for (const value of Object.values(item.fields)) {
    const text = firstText(value);
    if (text) return text;
  }
  return `Item ${index + 1}`;
}

function getItemLinks(item: CVItem): SocialLink[] {
  return item.links ?? [];
}

function OptionCard({
  label,
  selected,
  recommended,
  onSelect,
}: {
  label: string;
  selected: boolean;
  recommended?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
        selected
          ? 'border-[#0078D7] bg-blue-50 shadow-sm'
          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      {recommended && (
        <span className="bg-emerald-500 text-white text-[9px] font-bold px-1 py-0 rounded-full">
          ✓
        </span>
      )}
      <span className={`text-xs font-medium ${selected ? 'text-blue-700' : 'text-gray-600'}`}>
        {label}
      </span>
    </button>
  );
}

function OptionRow({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{title}</h4>
      <div className="flex flex-wrap gap-1.5">
        {children}
      </div>
    </div>
  );
}

function LayoutOptions({
  section,
  onChangeLayout,
}: {
  section: CVSection;
  onChangeLayout: (layout: SectionLayout) => void;
}) {
  const def = sectionRegistry[section.type] ?? sectionRegistry.custom;
  const opts = def.allowedLayoutOptions;
  const layout = section.layout;
  const recommended = def.recommendedLayout;

  const set = <K extends keyof SectionLayout>(key: K, value: SectionLayout[K]) =>
    onChangeLayout({ ...layout, [key]: value });

  const hasDateOptions = opts.dateSlot.length > 1;
  const hasIconStyleOptions = opts.iconStyle.length > 1;
  const hasAnyOptions = hasDateOptions || hasIconStyleOptions;

  return (
    <div className="space-y-4">
      {!hasAnyOptions && (
        <div className="text-center py-6 text-gray-400 text-sm">
          This section type has limited layout options.
        </div>
      )}

      {hasDateOptions && (
        <OptionRow title="Date Position">
          {opts.dateSlot.map((v) => (
            <OptionCard
              key={v}
              label={dateSlotLabels[v]}
              selected={layout.dateSlot === v}
              recommended={recommended.dateSlot === v}
              onSelect={() => set('dateSlot', v)}
            />
          ))}
          {layout.dateSlot === 'hidden' && (
            <p className="w-full text-xs text-amber-600 mt-2">
              <span className="font-medium">Tip:</span> Dates help recruiters understand your career timeline.
            </p>
          )}
        </OptionRow>
      )}

      {hasIconStyleOptions && (
        <OptionRow title="Bullet Style">
          {opts.iconStyle.map((v) => (
            <OptionCard
              key={v}
              label={iconStyleLabels[v]}
              selected={layout.iconStyle === v}
              recommended={recommended.iconStyle === v}
              onSelect={() => set('iconStyle', v)}
            />
          ))}
        </OptionRow>
      )}
    </div>
  );
}

function ItemLinksList({
  section,
  onAddItemLink,
  onUpdateItemLink,
  onDeleteItemLink,
  onReorderItemLinks,
}: {
  section: CVSection;
  onAddItemLink: (itemIndex: number, link: SocialLink) => void;
  onUpdateItemLink: (itemIndex: number, linkIndex: number, link: SocialLink) => void;
  onDeleteItemLink: (itemIndex: number, linkIndex: number) => void;
  onReorderItemLinks: (itemIndex: number, fromIndex: number, toIndex: number) => void;
}) {
  const items = section.content.items;

  if (items.length === 0) {
    return (
      <div className="text-center py-6 text-gray-400 text-sm">
        This section has no items yet. Add an item in the CV to attach links.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {items.map((item, itemIndex) => {
        const label = itemLabel(item, itemIndex);
        const links = getItemLinks(item);
        return (
          <section
            key={item.id}
            className="rounded-xl border border-gray-200 bg-gray-50/60 p-3"
            aria-label={`Links for ${label}`}
          >
            <h4 className="mb-2 truncate text-sm font-semibold text-gray-800" title={label}>
              {label}
            </h4>
            <LinkManager
              links={links}
              layout="list"
              onAdd={(link) => onAddItemLink(itemIndex, link)}
              onUpdate={(linkIndex, link) => onUpdateItemLink(itemIndex, linkIndex, link)}
              onDelete={(linkIndex) => onDeleteItemLink(itemIndex, linkIndex)}
              onReorder={(fromIndex, toIndex) => onReorderItemLinks(itemIndex, fromIndex, toIndex)}
            />
          </section>
        );
      })}
    </div>
  );
}

interface SectionLayoutContentProps {
  section: CVSection;
  onChangeLayout: (layout: SectionLayout) => void;
  onAddItemLink: (itemIndex: number, link: SocialLink) => void;
  onUpdateItemLink: (itemIndex: number, linkIndex: number, link: SocialLink) => void;
  onDeleteItemLink: (itemIndex: number, linkIndex: number) => void;
  onReorderItemLinks: (itemIndex: number, fromIndex: number, toIndex: number) => void;
}

export function SectionLayoutContent({
  section,
  onChangeLayout,
  onAddItemLink,
  onUpdateItemLink,
  onDeleteItemLink,
  onReorderItemLinks,
}: SectionLayoutContentProps) {
  const [tab, setTab] = useState<'layout' | 'links'>('layout');

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Section settings"
        className="flex rounded-lg border border-gray-200 bg-gray-100 p-0.5"
      >
        {([
          ['layout', 'Layout'],
          ['links', 'Links'],
        ] as const).map(([id, label]) => {
          const selected = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`section-settings-tab-${id}`}
              aria-selected={selected}
              aria-controls={`section-settings-panel-${id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(id)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0078D7] focus-visible:ring-offset-1 ${
                selected
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab === 'layout' ? (
        <div
          role="tabpanel"
          id="section-settings-panel-layout"
          aria-labelledby="section-settings-tab-layout"
        >
          <LayoutOptions section={section} onChangeLayout={onChangeLayout} />
        </div>
      ) : (
        <div
          role="tabpanel"
          id="section-settings-panel-links"
          aria-labelledby="section-settings-tab-links"
        >
          <ItemLinksList
            section={section}
            onAddItemLink={onAddItemLink}
            onUpdateItemLink={onUpdateItemLink}
            onDeleteItemLink={onDeleteItemLink}
            onReorderItemLinks={onReorderItemLinks}
          />
        </div>
      )}
    </div>
  );
}
