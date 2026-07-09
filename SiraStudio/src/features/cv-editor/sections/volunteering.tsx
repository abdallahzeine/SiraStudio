import { classicLayouts, professionalLayouts } from '../presets';
import { uid } from '../../../shared/utils/helpers';
import { createHeadingDateSectionDef } from './headingDateSection';

export const volunteeringDef = createHeadingDateSectionDef({
  type: 'volunteering',
  label: 'Volunteering',
  description: 'Volunteer work and leadership roles',
  defaultTitle: 'VOLUNTEERING & LEADERSHIP',
  defaultLayout: classicLayouts.volunteering,
  recommendedLayout: professionalLayouts.volunteering,
  addItemLabel: 'Add entry',
  iconStyle: ['none'],
  secondaryField: 'role',
  newItem: () => ({ id: uid(), fields: { title: 'Organization', role: 'Role', date: 'MM/YYYY - Present' } }),
});
