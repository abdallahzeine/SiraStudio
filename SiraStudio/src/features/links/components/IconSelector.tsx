import { useState } from 'react';
import type { IconType } from '../../../shared/types';
import { PREDEFINED_ICONS, getIconByType, LinkTypeIcon } from '../icons';

interface IconSelectorProps {
  selectedIcon: IconType;
  customIconUrl?: string;
  onSelect: (iconType: IconType, customUrl?: string) => void;
}

type IconCategory = 'all' | 'professional' | 'social' | 'contact' | 'other';

export function IconSelector({ selectedIcon, customIconUrl, onSelect }: IconSelectorProps) {
  const [activeCategory, setActiveCategory] = useState<IconCategory>('all');
  const [customUrl, setCustomUrl] = useState(customIconUrl || '');
  const [showCustomInput, setShowCustomInput] = useState(selectedIcon === 'custom');

  const categories: { id: IconCategory; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'professional', label: 'Professional' },
    { id: 'social', label: 'Social' },
    { id: 'contact', label: 'Contact' },
    { id: 'other', label: 'Other' },
  ];

  const filteredIcons = activeCategory === 'all'
    ? PREDEFINED_ICONS
    : PREDEFINED_ICONS.filter((icon) => icon.category === activeCategory);

  const handleCustomUrlChange = (url: string) => {
    setCustomUrl(url);
    if (url.trim()) {
      onSelect('custom', url);
    }
  };

  const selectedIconDef = getIconByType(selectedIcon);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors
              ${activeCategory === cat.id
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-2 max-h-48 overflow-y-auto p-1">
        {filteredIcons.map((icon) => (
          <button
            key={icon.type}
            onClick={() => {
              onSelect(icon.type);
              setShowCustomInput(icon.type === 'custom');
            }}
            className={`icon-grid-item flex flex-col items-center gap-1 p-2 rounded-lg transition-all
              ${selectedIcon === icon.type
                ? 'selected bg-blue-50 border-2 border-[#0078D7] shadow-sm'
                : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'}`}
            title={icon.name}
          >
            <div
              className="w-8 h-8 flex items-center justify-center rounded-full"
              style={{
                backgroundColor: selectedIcon === icon.type ? `${icon.color}20` : 'transparent',
                color: icon.color,
              }}
            >
              <LinkTypeIcon type={icon.type} size={16} color={icon.color} />
            </div>
            <span className="text-[10px] text-gray-600 truncate w-full text-center">
              {icon.name}
            </span>
          </button>
        ))}
      </div>

      {showCustomInput && (
        <div className="space-y-2 p-3 bg-gray-50 rounded-lg">
          <label className="block text-xs font-medium text-gray-700">
            Custom Icon URL
          </label>
          <input
            type="url"
            value={customUrl}
            onChange={(e) => handleCustomUrlChange(e.target.value)}
            placeholder="https://example.com/icon.png"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-[#0078D7] focus:border-transparent"
          />
          <p className="text-xs text-gray-500">
            Enter a URL to a custom icon image (PNG, SVG, or JPG)
          </p>
          {customUrl && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-600">Preview:</span>
              <img
                src={customUrl}
                alt="Custom icon preview"
                className="w-6 h-6 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
        <span className="text-xs text-gray-500">Selected:</span>
        <div
          className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 rounded-full"
          style={{ color: selectedIconDef.color }}
        >
          <LinkTypeIcon
            type={selectedIcon}
            customIconUrl={customIconUrl}
            size={14}
            color={selectedIconDef.color}
          />
          <span className="text-xs font-medium text-blue-700">
            {selectedIconDef.name}
          </span>
        </div>
      </div>
    </div>
  );
}
