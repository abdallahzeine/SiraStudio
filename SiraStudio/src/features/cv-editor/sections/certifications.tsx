import { classicLayouts, professionalLayouts } from '../presets';
import { createHeadingDateSectionDef } from './headingDateSection';

export const certificationsDef = createHeadingDateSectionDef({
  type: 'certifications',
  label: 'Certifications',
  description: 'Professional certifications and licenses',
  defaultTitle: 'CERTIFICATIONS',
  defaultLayout: classicLayouts.certifications,
  recommendedLayout: professionalLayouts.certifications,
  addItemLabel: 'Add certification',
  iconStyle: ['none', 'bullet', 'dash', 'chevron'],
  secondaryField: 'subtitle',
});
