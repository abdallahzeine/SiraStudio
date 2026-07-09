import { useMemo } from 'react';
import { sanitizeRichText } from '../../app/store/sanitize';

interface PrintRichTextProps {
  value: string | null | undefined;
  className?: string;
  inline?: boolean;
}

export function PrintRichText({ value, className, inline = false }: PrintRichTextProps) {
  const sanitized = useMemo(() => sanitizeRichText(value), [value]);
  if (!sanitized) return null;

  const rootClass = [
    'print-rich-text',
    inline ? 'print-rich-text-inline' : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  if (inline) {
    return <span className={rootClass} dangerouslySetInnerHTML={{ __html: sanitized }} />;
  }

  return <div className={rootClass} dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
