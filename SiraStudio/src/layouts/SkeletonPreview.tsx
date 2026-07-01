import type { DateSlot, IconStyle, SectionLayout } from '../types';
import type { SectionCategory } from '../sections/categories';

const densitySpacing: Record<string, string> = {
  compact: 'space-y-1',
  normal: 'space-y-2.5',
  relaxed: 'space-y-4',
};

const titleBullets = [
  'Built a full-stack e-commerce platform with React and Node.js',
  'Reduced page load time by 60% through code splitting and lazy loading',
  'Implemented CI/CD pipeline serving 500K daily active users',
];

const workBullets = [
  'Led a team of 5 engineers to ship a new product',
  'Reduced latency by 40% via query optimization',
];

const customRows = [
  ['Language:', 'English - Native'],
  ['Language:', 'French - Fluent'],
  ['Language:', 'Spanish - Intermediate'],
] as const;

function iconCharFor(iconStyle: IconStyle): string {
  if (iconStyle === 'bullet') return '*';
  if (iconStyle === 'dash') return '-';
  if (iconStyle === 'chevron') return '>';
  return '';
}

function bulletGapFor(density: SectionLayout['density']): string {
  if (density === 'compact') return 'gap-0.5';
  if (density === 'relaxed') return 'gap-2';
  return 'gap-1';
}

function HeadingDateEntry({
  title,
  subtitle,
  date,
  dateSlot,
}: {
  title: string;
  subtitle: string;
  date: string;
  dateSlot: DateSlot;
}) {
  const titleEl = <span className="font-semibold text-gray-800">{title}</span>;
  const subtitleEl = <span className="text-gray-500">{subtitle}</span>;
  const dateEl = <span className="text-gray-400 whitespace-nowrap">{date}</span>;

  if (dateSlot === 'right-inline') {
    return (
      <div className="flex flex-wrap justify-between items-start gap-x-3 text-left">
        <div>
          <div className="leading-tight">{titleEl}</div>
          <div className="leading-tight">{subtitleEl}</div>
        </div>
        <div className="mt-0.5 shrink-0">{dateEl}</div>
      </div>
    );
  }

  if (dateSlot === 'below-title') {
    return (
      <div className="text-left">
        <div className="leading-tight">{titleEl}</div>
        <div className="leading-tight">{dateEl}</div>
        <div className="leading-tight">{subtitleEl}</div>
      </div>
    );
  }

  if (dateSlot === 'left-margin') {
    return (
      <div className="text-left">
        <div className="leading-tight">
          {titleEl}
          <span className="text-gray-400 mx-1">-</span>
          {dateEl}
        </div>
        <div className="leading-tight">{subtitleEl}</div>
      </div>
    );
  }

  return (
    <div className="text-left">
      <div className="leading-tight">{titleEl}</div>
      <div className="leading-tight">{subtitleEl}</div>
    </div>
  );
}

function HeadingDatePreview({ spacing, layout }: { spacing: string; layout: SectionLayout }) {
  return (
    <div className={`w-full ${spacing} text-xs`}>
      <HeadingDateEntry
        title="Bachelor of Computer Science"
        subtitle="MIT University"
        date="2019 - 2023"
        dateSlot={layout.dateSlot}
      />
      <HeadingDateEntry
        title="AWS Solutions Architect"
        subtitle="Amazon Web Services"
        date="2022"
        dateSlot={layout.dateSlot}
      />
    </div>
  );
}

function BodyTextPreview({ spacing }: { spacing: string }) {
  return (
    <div className={`w-full ${spacing} text-xs text-left`}>
      <p className="text-gray-600 leading-relaxed">
        Experienced software engineer with 5+ years building scalable web applications.
        Passionate about clean architecture and mentoring junior developers.
        Led a team of 8 engineers to deliver a microservices platform serving 2M+ users.
      </p>
    </div>
  );
}

function BulletRows({
  bullets,
  iconChar,
  className,
}: {
  bullets: string[];
  iconChar: string;
  className: string;
}) {
  return (
    <div className={className}>
      {bullets.map((bullet, index) => (
        <div key={index} className="flex items-start gap-1.5 text-left">
          {iconChar && <span className="text-gray-400 leading-none select-none shrink-0">{iconChar}</span>}
          <span className="text-gray-600">{bullet}</span>
        </div>
      ))}
    </div>
  );
}

function WorkExperiencePreview({ spacing, layout }: { spacing: string; layout: SectionLayout }) {
  return (
    <div className={`w-full ${spacing} text-xs`}>
      <div className="flex justify-between items-start">
        <div>
          <div className="font-semibold text-gray-800 leading-tight">Software Engineer</div>
          <div className="text-gray-600">Google - New York</div>
        </div>
        {layout.dateSlot !== 'hidden' && <div className="text-gray-500 whitespace-nowrap">Jan 2020 - Present</div>}
      </div>
      <BulletRows bullets={workBullets} iconChar={iconCharFor(layout.iconStyle)} className="flex flex-col gap-0.5" />
    </div>
  );
}

function TitleBulletsHeading({ layout }: { layout: SectionLayout }) {
  const dateStr = layout.dateSlot !== 'hidden'
    ? <span className="text-gray-500 whitespace-nowrap">Jan 2020 - Present</span>
    : null;
  const titleBlock = <span className="font-semibold text-gray-800 leading-tight">E-commerce Platform</span>;

  if (layout.dateSlot === 'right-inline') {
    return (
      <div className="flex justify-between items-start gap-x-2 text-left">
        <div>{titleBlock}</div>
        {dateStr && <div className="mt-0.5 shrink-0">{dateStr}</div>}
      </div>
    );
  }

  if (layout.dateSlot === 'below-title') {
    return (
      <div className="text-left">
        {titleBlock}
        {dateStr && <div className="leading-tight">{dateStr}</div>}
      </div>
    );
  }

  if (layout.dateSlot === 'left-margin') {
    return (
      <div className="flex items-start gap-2 text-left">
        {titleBlock}
        <span className="text-gray-400">-</span>
        {dateStr}
      </div>
    );
  }

  return <div className="text-left">{titleBlock}</div>;
}

function TitleBulletsPreview({ spacing, layout }: { spacing: string; layout: SectionLayout }) {
  return (
    <div className={`w-full ${spacing} text-xs`}>
      <TitleBulletsHeading layout={layout} />
      <BulletRows
        bullets={titleBullets}
        iconChar={iconCharFor(layout.iconStyle)}
        className={`flex flex-col ${bulletGapFor(layout.density)}`}
      />
    </div>
  );
}

function CustomPreview({ spacing }: { spacing: string }) {
  return (
    <div className={`w-full ${spacing} text-xs`}>
      {customRows.map(([label, value]) => (
        <div key={value} className="flex items-baseline gap-2">
          <span className="text-gray-400 font-medium shrink-0">{label}</span>
          <span className="text-gray-600">{value}</span>
        </div>
      ))}
    </div>
  );
}

export function LayoutPreviewSkeleton({
  category,
  layout,
}: {
  category: SectionCategory;
  layout: SectionLayout;
}) {
  const spacing = densitySpacing[layout.density];

  switch (category) {
    case 'heading-date':
      return <HeadingDatePreview spacing={spacing} layout={layout} />;
    case 'body-text':
      return <BodyTextPreview spacing={spacing} />;
    case 'work-experience':
      return <WorkExperiencePreview spacing={spacing} layout={layout} />;
    case 'title-bullets':
      return <TitleBulletsPreview spacing={spacing} layout={layout} />;
    case 'custom':
      return <CustomPreview spacing={spacing} />;
    default:
      return null;
  }
}
