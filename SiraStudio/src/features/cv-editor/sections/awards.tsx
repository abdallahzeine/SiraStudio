import { classicLayouts, professionalLayouts } from '../presets';
import { createHeadingDateSectionDef } from './headingDateSection';

export const awardsDef = createHeadingDateSectionDef({
  type: 'awards',
  label: 'Awards',
  description: 'Awards, scholarships, and honors',
  defaultTitle: 'AWARDS & SCHOLARSHIPS',
  defaultLayout: classicLayouts.awards,
  recommendedLayout: professionalLayouts.awards,
  addItemLabel: 'Add award',
  iconStyle: ['none', 'bullet', 'dash', 'chevron'],
  secondaryField: 'subtitle',
});
