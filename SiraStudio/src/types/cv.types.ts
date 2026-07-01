export type IconType =
  | 'github'
  | 'linkedin'
  | 'twitter'
  | 'globe'
  | 'mail'
  | 'phone'
  | 'portfolio'
  | 'youtube'
  | 'instagram'
  | 'facebook'
  | 'custom';

export interface SocialLink {
  id: string;
  url: string;
  label: string;
  iconType: IconType;
  customIconUrl?: string;
  color?: string;
  displayOrder: number;
}

export interface CVHeader {
  name: string;
  headline?: string;
  location: string;
  phone: string;
  email: string;
  socialLinks: SocialLink[];
}

export type SectionType =
  | 'summary'
  | 'work-experience'
  | 'education'
  | 'skills'
  | 'certifications'
  | 'projects'
  | 'awards'
  | 'volunteering'
  | 'custom'
  | 'spacer';

export type DateFormat = 'MM/YYYY' | 'Mon YYYY' | 'YYYY';

export interface StructuredDate {
  month: number | null; // 1–12 or null for year-only
  year: number;
}

export interface SkillGroup {
  id: string;
  label: string;
  value: string;
}

export interface CVItem {
  id: string;
  // For education, certifications, awards, volunteering
  title?: string;
  subtitle?: string;
  date?: string;
  role?: string;
  // For work-experience and education: structured location and date range
  location?: string;
  dateStart?: StructuredDate;
  dateEnd?: StructuredDate | 'present';
  // For projects
  bullets?: string[];
  // For skills
  skillGroups?: SkillGroup[];
  // Generic extra text (summary body, etc.)
  body?: string;
  // For custom sections: open key→value bag
  values?: Record<string, string | string[]>;
}

// ─── Layout types ────────────────────────────────────────────────────────────

export type DateSlot = 'right-inline' | 'below-title' | 'left-margin' | 'hidden';
export type IconStyle = 'none' | 'bullet' | 'dash' | 'chevron';
export type Separator = 'none' | 'rule' | 'dot' | 'space';
export type Density = 'compact' | 'normal' | 'relaxed';

export interface SectionLayout {
  presetId?: string;
  dateSlot: DateSlot;
  iconStyle: IconStyle;
  separator: Separator;
  density: Density;
  columns: 1 | 2;
}

// ─── Custom section field schema ─────────────────────────────────────────────

export type CustomFieldKind = 'text' | 'multiline' | 'date' | 'bullets' | 'pairs';

export interface CustomFieldDef {
  key: string;
  label: string;
  kind: CustomFieldKind;
  placeholder?: string;
}

export interface CustomSectionSchema {
  fields: CustomFieldDef[];
}

// ─── Overall template ─────────────────────────────────────────────────────────

export type TemplateId = 'single-column' | 'sidebar-left' | 'sidebar-right';

export interface TemplateConfig {
  id: TemplateId;
  columns: 1 | 2;
  sidebarSide?: 'left' | 'right';
  sidebarSectionIds?: string[];
}

// ─── Core CV data model ───────────────────────────────────────────────────────

export interface CVSection {
  id: string;
  type: SectionType;
  title: string;
  items: CVItem[];
  layout: SectionLayout;
  schema?: CustomSectionSchema; // only when type === 'custom'
}

export interface CVData {
  header: CVHeader;
  sections: CVSection[];
  template: TemplateConfig;
  dateFormat?: DateFormat;
}
