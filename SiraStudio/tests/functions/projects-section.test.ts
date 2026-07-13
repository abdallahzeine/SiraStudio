import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { projectsDef } from '../../src/features/cv-editor/sections/projects';

const item = {
  id: 'project-1',
  fields: {
    title: 'Contract Mapper',
    subtitle: 'TypeScript, Python',
    date: '2026',
    bullets: [{ id: 'project-bullet', text: 'Aligned both boundaries.' }],
  },
};
const layout = projectsDef.defaultLayout;

describe('projects section subtitle', () => {
  it('wires Tech Stack to its editable field path', () => {
    const frame = projectsDef.renderItemEditor!({
      item,
      itemPath: 'sections[2].content.items[0]',
      layout,
      index: 0,
      total: 1,
      onMove: () => undefined,
      onDelete: () => undefined,
    }) as ReactElement<{ children: ReactElement }>;
    const heading = Array.isArray(frame.props.children) ? frame.props.children[0] : frame.props.children;

    expect(heading.props.subtitle).toBe('TypeScript, Python');
    expect(heading.props.subtitlePath).toBe('sections[2].content.items[0].fields.subtitle');
    expect(heading.props.subtitlePlaceholder).toBe('Tech Stack');
  });

  it('passes Tech Stack to print rendering', () => {
    const frame = projectsDef.renderItemPrint!({ item, layout, dateFormat: 'YYYY' }) as ReactElement<{
      children: ReactElement[];
    }>;
    const heading = frame.props.children[0];

    expect(heading.props.subtitle).toBe('TypeScript, Python');
  });
});
