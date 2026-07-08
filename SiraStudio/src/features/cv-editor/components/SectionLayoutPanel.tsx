import type { CVSection, SectionLayout, DateSlot, IconStyle, Density } from '../../../shared/types';
import { sectionRegistry } from '../sections/registry';

const dateSlotLabels: Record<DateSlot, string> = {
  'right-inline': 'Right',
  'below-title': 'Below',
  'left-margin': 'Title–Date',
  hidden: 'Hidden',
};

const densityLabels: Record<Density, string> = {
  compact: 'Compact',
  normal: 'Normal',
  relaxed: 'Relaxed',
};

const iconStyleLabels: Record<IconStyle, string> = {
  none: 'None',
  bullet: '•',
  dash: '–',
  chevron: '›',
};

export function OptionCard({
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
      onClick={onSelect}
      className={`relative flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
        selected
          ? 'border-violet-500 bg-violet-50 shadow-sm'
          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      {recommended && (
        <span className="bg-emerald-500 text-white text-[9px] font-bold px-1 py-0 rounded-full">
          ✓
        </span>
      )}
      <span className={`text-xs font-medium ${selected ? 'text-violet-700' : 'text-gray-600'}`}>
        {label}
      </span>
    </button>
  );
}

export function OptionRow({
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

interface SectionLayoutContentProps {
  section: CVSection;
  onChangeLayout: (layout: SectionLayout) => void;
}

export function SectionLayoutContent({ section, onChangeLayout }: SectionLayoutContentProps) {
  const def = sectionRegistry[section.type] ?? sectionRegistry.custom;
  const opts = def.allowedLayoutOptions;
  const layout = section.layout;
  const recommended = def.recommendedLayout;

  const set = <K extends keyof SectionLayout>(key: K, value: SectionLayout[K]) =>
    onChangeLayout({ ...layout, [key]: value });

  const hasDateOptions = opts.dateSlot.length > 1;
  const hasDensityOptions = opts.density.length > 1;
  const hasIconStyleOptions = opts.iconStyle.length > 1;
  const hasAnyOptions = hasDateOptions || hasDensityOptions || hasIconStyleOptions;

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

      {hasDensityOptions && (
        <OptionRow title="Spacing">
          {opts.density.map((v) => (
            <OptionCard
              key={v}
              label={densityLabels[v]}
              selected={layout.density === v}
              recommended={recommended.density === v}
              onSelect={() => set('density', v)}
            />
          ))}
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