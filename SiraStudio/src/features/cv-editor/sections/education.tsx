import { classicLayouts, professionalLayouts } from '../presets';
import { createHeadingDateSectionDef } from './headingDateSection';

export const educationDef = createHeadingDateSectionDef({
  type: 'education',
  label: 'Education',
  description: 'Educational background and degrees',
  defaultTitle: 'EDUCATION',
  defaultLayout: classicLayouts.education,
  recommendedLayout: professionalLayouts.education,
  addItemLabel: 'Add education',
  iconStyle: ['none'],
  secondaryField: 'subtitle',
});
