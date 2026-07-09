import type {
  SectionType, CVItem, CVSection, SectionLayout, SectionFieldDef,
  DateFormat, DateSlot, IconStyle, Separator, Density,
} from '../../../shared/types';
import type { SectionCategory } from './categories';
import { summaryDef } from './summary';
import { workExperienceDef } from './work-experience';
import { educationDef } from './education';
import { skillsDef } from './skills';
import { certificationsDef } from './certifications';
import { projectsDef } from './projects';
import { awardsDef } from './awards';
import { volunteeringDef } from './volunteering';
import { customDef } from './custom';
import { spacerDef } from './spacer';

export interface RenderEditorProps {
  item: CVItem;
  section: CVSection;
  layout: SectionLayout;
  sectionIndex: number;
  index: number;
  total: number;
  itemPath: string;
  onChange: (i: CVItem) => void;
  onMove: (d: -1 | 1) => void;
  onDelete: () => void;
  schema: SectionFieldDef[];
}

export interface RenderPrintProps {
  item: CVItem;
  section: CVSection;
  layout: SectionLayout;
  sectionIndex: number;
  index: number;
  total: number;
  dateFormat: DateFormat;
  schema: SectionFieldDef[];
}

export interface AllowedLayoutOptions {
  dateSlot: DateSlot[];
  iconStyle: IconStyle[];
  separator: Separator[];
  density: Density[];
  columns: (1 | 2)[];
}

export interface SectionDef {
  type: SectionType;
  label: string;
  description: string;
  defaultTitle: string;
  defaultLayout: SectionLayout;
  /** Recommended layout for professional CVs (used for guidance, not enforcement) */
  recommendedLayout: SectionLayout;
  schema: SectionFieldDef[];
  allowedLayoutOptions: AllowedLayoutOptions;
  /** Skeleton category this section belongs to (drives wizard preview) */
  category: SectionCategory;
  /** If true, SectionRenderer hides the "Add item" button */
  singleItem: boolean;
  addItemLabel: string;
  availablePresetIds: string[];
  newItem: () => CVItem;
  renderItemEditor?: (props: RenderEditorProps) => React.ReactNode;
  renderItemPrint?: (props: RenderPrintProps) => React.ReactNode;
  /** Backward-compatibility fallback during editor renderer migration. */
  renderItem?: (props: RenderEditorProps) => React.ReactNode;
  /** Optional plain-text projection used by downstream features. */
  itemToText?: (item: CVItem, section: CVSection) => string;
}

export const sectionRegistry: Record<SectionType, SectionDef> = {
  summary: summaryDef,
  'work-experience': workExperienceDef,
  education: educationDef,
  skills: skillsDef,
  certifications: certificationsDef,
  projects: projectsDef,
  awards: awardsDef,
  volunteering: volunteeringDef,
  custom: customDef,
  spacer: spacerDef,
};
