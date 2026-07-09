import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SocialLink } from '../../../shared/types';
import { getIconByType, getIconColor } from '../icons';
import { extractDomain } from '../utils/linkValidation';

interface LinkCardProps {
  link: SocialLink;
  onEdit: () => void;
  onDelete: () => void;
  layout?: 'compact' | 'grid' | 'list';
}

export function LinkCard({ link, onEdit, onDelete, layout = 'compact' }: LinkCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: link.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const iconDef = getIconByType(link.iconType);
  const iconColor = getIconColor(link.iconType, link.color);
  const domain = extractDomain(link.url);

  const handleClick = (e: React.MouseEvent) => {
    // Don't trigger if clicking delete button
    if ((e.target as HTMLElement).closest('.delete-btn')) {
      return;
    }
    onEdit();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onEdit();
    }
  };

  if (layout === 'compact') {
    return (
      <>
        {/* Editable version (screen only) */}
        <div
          ref={setNodeRef}
          style={style}
          className="group relative inline-flex items-center no-print"
        >
          <button
            {...attributes}
            {...listeners}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className="relative flex items-center justify-center w-9 h-9 rounded-full 
                       bg-gray-100 hover:bg-gray-200 
                       transition-all duration-200 ease-out
                       hover:scale-110 hover:shadow-md
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                       cursor-grab active:cursor-grabbing"
            style={{ color: iconColor }}
            aria-label={`Edit ${link.label || domain} link`}
            title={link.label || domain}
          >
            {link.iconType === 'custom' && link.customIconUrl ? (
              <img 
                src={link.customIconUrl} 
                alt="" 
                className="w-5 h-5 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <span dangerouslySetInnerHTML={{ __html: iconDef.svg }} />
            )}
          </button>
          
          {/* Delete button - appears on hover */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="delete-btn absolute -top-1 -right-1 w-4 h-4 
                       bg-red-500 text-white rounded-full 
                       flex items-center justify-center
                       opacity-0 group-hover:opacity-100
                       transition-opacity duration-200
                       hover:bg-red-600 focus:outline-none focus:ring-1 focus:ring-red-500"
            aria-label={`Delete ${link.label || domain} link`}
            title="Delete link"
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Print version */}
        <a
          href={link.url}
          className="hidden print:inline-flex print:items-center print:gap-1 print:text-sm print:text-gray-700"
          style={{ color: 'black !important' }}
        >
          <span 
            className="print:w-4 print:h-4"
            style={{ color: 'black' }}
            dangerouslySetInnerHTML={{ 
              __html: iconDef.svg.replace('currentColor', 'black').replace('class="w-5 h-5"', 'class="w-4 h-4"')
            }} 
          />
          <span className="print:underline">{link.label || domain}</span>
        </a>
      </>
    );
  }

  if (layout === 'grid') {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="group relative"
      >
        <button
          {...attributes}
          {...listeners}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          className="no-print w-full flex flex-col items-center p-4 rounded-xl
                     bg-white border border-gray-200 
                     hover:border-blue-300 hover:shadow-lg
                     transition-all duration-200 ease-out
                     hover:scale-[1.02]
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                     cursor-grab active:cursor-grabbing"
          aria-label={`Edit ${link.label || domain} link`}
        >
          <div 
            className="w-12 h-12 rounded-full flex items-center justify-center mb-2"
            style={{ 
              backgroundColor: `${iconColor}15`,
              color: iconColor 
            }}
          >
            {link.iconType === 'custom' && link.customIconUrl ? (
              <img 
                src={link.customIconUrl} 
                alt="" 
                className="w-6 h-6 object-contain"
              />
            ) : (
              <span dangerouslySetInnerHTML={{ 
                __html: iconDef.svg.replace('w-5 h-5', 'w-6 h-6') 
              }} />
            )}
          </div>
          <span className="text-sm font-medium text-gray-700 truncate w-full text-center">
            {link.label || domain}
          </span>
          <span className="text-xs text-gray-400 truncate w-full text-center mt-0.5">
            {domain}
          </span>
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="delete-btn no-print absolute top-2 right-2 w-6 h-6 
                     bg-red-500 text-white rounded-full 
                     flex items-center justify-center
                     opacity-0 group-hover:opacity-100
                     transition-opacity duration-200
                     hover:bg-red-600 focus:outline-none focus:ring-1 focus:ring-red-500"
          aria-label={`Delete ${link.label || domain} link`}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  // List layout
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative"
    >
      <button
        {...attributes}
        {...listeners}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className="no-print w-full flex items-center gap-3 p-3 rounded-lg
                   bg-white border border-gray-200 
                   hover:border-blue-300 hover:shadow-md
                   transition-all duration-200 ease-out
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                   cursor-grab active:cursor-grabbing"
        aria-label={`Edit ${link.label || domain} link`}
      >
        <div 
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ 
            backgroundColor: `${iconColor}15`,
            color: iconColor 
          }}
        >
          {link.iconType === 'custom' && link.customIconUrl ? (
            <img 
              src={link.customIconUrl} 
              alt="" 
              className="w-5 h-5 object-contain"
            />
          ) : (
            <span dangerouslySetInnerHTML={{ __html: iconDef.svg }} />
          )}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <span className="text-sm font-medium text-gray-700 block truncate">
            {link.label || domain}
          </span>
          <span className="text-xs text-gray-400 block truncate">
            {domain}
          </span>
        </div>
        <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="delete-btn no-print absolute top-1/2 right-3 -translate-y-1/2 w-6 h-6 
                   bg-red-500 text-white rounded-full 
                   flex items-center justify-center
                   opacity-0 group-hover:opacity-100
                   transition-opacity duration-200
                   hover:bg-red-600 focus:outline-none focus:ring-1 focus:ring-red-500"
        aria-label={`Delete ${link.label || domain} link`}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
