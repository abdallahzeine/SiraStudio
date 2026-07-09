import type { Density } from '../../../shared/types';

interface ItemFramePrintProps {
  density: Density;
  children: React.ReactNode;
}

const densityClass: Record<Density, string> = {
  compact: 'mb-1',
  normal: 'mb-2',
  relaxed: 'mb-4',
};

export function ItemFramePrint({ density, children }: ItemFramePrintProps) {
  return <div className={`avoid-break ${densityClass[density]}`}>{children}</div>;
}
