import { memo, useCallback } from 'react';
import { Mail, MapPin, Phone } from 'lucide-react';
import type { CVData, SocialLink } from '../../../shared/types';
import { CVTextEditor } from './CVTextEditor';
import { LinkManager } from '../../links';
import { SingleColumn } from '../templates/SingleColumn';
import { SidebarLayout } from '../templates/SidebarLayout';
import { SectionList } from './SectionList';
import { DeleteButton } from '../layouts/Buttons';
import { useCVSelector, useDispatch } from '../../../app/store';

interface HeaderSectionProps {
  header: CVData['header'];
}

const HeaderSection = memo(function HeaderSection({
  header,
}: HeaderSectionProps) {
  const dispatch = useDispatch();
  const links = header.socialLinks ?? [];

  const addLink = useCallback((link: SocialLink) => {
    dispatch({ op: 'insert', path: 'header.socialLinks[-1]', value: link });
  }, [dispatch]);

  const updateLink = useCallback((index: number, link: SocialLink) => {
    dispatch({ op: 'replace', path: `header.socialLinks[${index}]`, value: link });
  }, [dispatch]);

  const deleteLink = useCallback((index: number) => {
    dispatch({ op: 'delete', path: `header.socialLinks[${index}]` });
  }, [dispatch]);

  const reorderLinks = useCallback((oldIndex: number, newIndex: number) => {
    if (oldIndex === newIndex) return;
    if (
      oldIndex < 0
      || newIndex < 0
      || oldIndex >= links.length
      || newIndex >= links.length
    ) {
      return;
    }

    dispatch({
      op: 'move',
      from: `header.socialLinks[${oldIndex}]`,
      path: `header.socialLinks[${newIndex}]`,
    });
  }, [dispatch, links.length]);

  return (
    <header className="text-center mb-1 md:mb-2">
      <div className="text-base md:text-3xl lg:text-4xl font-bold text-gray-900 mb-0.5 md:mb-1" role="heading" aria-level={1}>
        <CVTextEditor
          value={header.name}
          path="header.name"
          lazy={false}
          className="text-base md:text-3xl lg:text-4xl font-bold text-gray-900"
          placeholder="Your Name"
        />
      </div>
      {header.headline !== undefined ? (
        <div className="mb-2 flex items-center justify-center gap-1">
          <DeleteButton
            onClick={() => dispatch({ op: 'delete', path: 'header.headline' })}
            title="Remove headline"
          />
          <div className="text-sm text-gray-500">
            <CVTextEditor
              value={header.headline}
              path="header.headline"
              lazy={false}
              placeholder="e.g. Full-Stack Engineer | 4 Years Experience"
              className="text-sm text-gray-500"
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="no-print text-xs text-gray-400 hover:text-gray-600 mb-2 underline underline-offset-2"
          onClick={() => dispatch({ op: 'set', path: 'header.headline', value: '' })}
        >
          + Add headline
        </button>
      )}
      <div className="flex flex-wrap justify-center items-center gap-1 md:gap-4 text-[11px] md:text-sm text-gray-600 mb-1.5 md:mb-3">
        <div className="flex items-center gap-1">
          <MapPin size={16} className="shrink-0" />
          <CVTextEditor value={header.location} path="header.location" placeholder="City, Country" lazy={false} />
        </div>
        <div className="flex items-center gap-1">
          <Phone size={16} className="shrink-0" />
          <CVTextEditor value={header.phone} path="header.phone" placeholder="+1 234 567 890" lazy={false} />
        </div>
        <div className="flex items-center gap-1">
          <Mail size={16} className="shrink-0" />
          <CVTextEditor value={header.email} path="header.email" placeholder="email@example.com" className="text-[#0078D7]" lazy={false} />
        </div>
      </div>
      <LinkManager
        links={links}
        onAdd={addLink}
        onUpdate={updateLink}
        onDelete={deleteLink}
        onReorder={reorderLinks}
        layout="compact"
      />
    </header>
  );
});

HeaderSection.displayName = 'HeaderSection';

type PanelType = 'layout-settings';

interface EditorDocumentProps {
  onOpenPanel: (type: PanelType, sectionId?: string) => void;
}

export function EditorDocument({ onOpenPanel }: EditorDocumentProps) {
  const templateId = useCVSelector((store) => store.data.template.id);
  const header = useCVSelector((store) => store.data.header);
  const sections = useCVSelector((store) => store.data.sections);
  const TemplateShell =
    templateId === 'single-column' ? SingleColumn : SidebarLayout;

  return (
    <TemplateShell>
      <HeaderSection header={header} />
      <SectionList sections={sections} onOpenPanel={onOpenPanel} />
    </TemplateShell>
  );
}
