import { CVTextEditor } from '../editor/CVTextEditor';

interface BodyBlockProps {
  value: string;
  path: string;
  placeholder?: string;
}

export function BodyBlock({ value, path, placeholder = 'Write here...' }: BodyBlockProps) {
  return (
    <div className="text-gray-700 text-sm leading-relaxed text-left">
      <CVTextEditor
        multiline
        value={value}
        path={path}
        placeholder={placeholder}
        className="text-gray-700 text-sm leading-relaxed"
      />
    </div>
  );
}
