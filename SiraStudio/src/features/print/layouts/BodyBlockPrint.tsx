import { PrintRichText } from '../PrintRichText';

interface BodyBlockPrintProps {
  value: string;
}

export function BodyBlockPrint({ value }: BodyBlockPrintProps) {
  return <PrintRichText value={value} className="text-gray-700 text-sm leading-relaxed" />;
}
