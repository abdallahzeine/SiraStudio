import type { Patch } from '../../app/store/types';

interface KeepTogetherSibling {
  keepTogetherGroup?: string;
}

export function keepTogetherReorderPatches(
  siblings: KeepTogetherSibling[],
  fromIndex: number,
  toIndex: number,
  siblingsPath: string,
): Patch[] {
  if (
    fromIndex === toIndex
    || fromIndex < 0
    || toIndex < 0
    || fromIndex >= siblings.length
    || toIndex >= siblings.length
  ) return [];

  const reordered = [...siblings];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);

  const lastPositions = new Map<string, number>();
  const splitGroups = new Set<string>();
  reordered.forEach((sibling, index) => {
    const group = sibling.keepTogetherGroup;
    if (!group) return;
    const lastPosition = lastPositions.get(group);
    if (lastPosition !== undefined && lastPosition !== index - 1) splitGroups.add(group);
    lastPositions.set(group, index);
  });

  return [
    ...siblings.flatMap<Patch>((sibling, index) => (
      sibling.keepTogetherGroup && splitGroups.has(sibling.keepTogetherGroup)
        ? [{ op: 'delete', path: `${siblingsPath}[${index}].keepTogetherGroup` }]
        : []
    )),
    {
      op: 'move',
      from: `${siblingsPath}[${fromIndex}]`,
      path: `${siblingsPath}[${toIndex}]`,
    },
  ];
}
