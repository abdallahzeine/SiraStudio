import type { SkillGroup } from '../../../shared/types';
import { PrintRichText } from '../PrintRichText';

interface SkillGridPrintProps {
  groups: SkillGroup[];
}

export function SkillGridPrint({ groups }: SkillGridPrintProps) {
  return (
    <div className="text-gray-700 text-sm space-y-0.5">
      {groups.map((group) => (
        <div key={group.id} className="flex items-baseline gap-1 flex-wrap">
          <div className="font-semibold">
            <PrintRichText value={group.label} inline />
          </div>
          <span>:</span>
          <div>
            <PrintRichText value={group.value} inline />
          </div>
        </div>
      ))}
    </div>
  );
}
