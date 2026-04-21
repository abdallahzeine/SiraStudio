import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { SocialLink, IconType } from '../../types';
import { IconSelector } from './IconSelector';
import { validateUrl, extractDomain } from '../../utils/linkValidation';
import { fetchFavicon } from '../../utils/faviconFetcher';
import { detectIconTypeFromUrl, getIconByType } from '../../constants/icons';

interface LinkEditorProps {
  onClose: () => void;
  onSave: (link: SocialLink) => void;
  link?: SocialLink | null;
}

const DEFAULT_LINK: Omit<SocialLink, 'id'> = {
  url: '',
  label: '',
  iconType: 'globe',
  customIconUrl: undefined,
  color: undefined,
  displayOrder: 0,
};

export function LinkEditor({ onClose, onSave, link }: LinkEditorProps) {
  const isEditing = !!link;

  const [formData, setFormData] = useState<Omit<SocialLink, 'id'>>(() =>
    link
      ? {
          url: link.url,
          label: link.label,
          iconType: link.iconType,
          customIconUrl: link.customIconUrl,
          color: link.color,
          displayOrder: link.displayOrder,
        }
      : { ...DEFAULT_LINK }
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isCheckingUrl, setIsCheckingUrl] = useState(() => !!link?.url);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const fetchCounterRef = useRef(0);

  useEffect(() => {
    if (!link?.url) return;
    let cancelled = false;
    fetchFavicon(link.url).then((result) => {
      if (!cancelled && result.url) setFaviconUrl(result.url);
      if (!cancelled) setIsCheckingUrl(false);
    });
    return () => { cancelled = true; };
  }, [link]);

  const handleUrlChange = useCallback(async (url: string) => {
    setFormData((prev) => ({ ...prev, url }));
    
    if (!url.trim()) {
      setValidationError(null);
      setFaviconUrl(null);
      return;
    }

    const validation = validateUrl(url);
    
    if (!validation.isValid) {
      setValidationError(validation.error);
      return;
    }

    setValidationError(null);
    
    const detectedIcon = detectIconTypeFromUrl(validation.normalizedUrl);
    setFormData((prev) => ({ 
      ...prev, 
      url: validation.normalizedUrl,
      iconType: prev.iconType === 'globe' || prev.iconType === 'custom' 
        ? detectedIcon 
        : prev.iconType 
    }));

    setIsCheckingUrl(true);
    const token = ++fetchCounterRef.current;
    const faviconResult = await fetchFavicon(validation.normalizedUrl);
    if (token !== fetchCounterRef.current) return; // stale — newer call in flight
    if (faviconResult.url) {
      setFaviconUrl(faviconResult.url);
    }
    setIsCheckingUrl(false);
  }, []);

  const handleUrlBlur = () => {
    if (formData.url && !formData.label) {
      const domain = extractDomain(formData.url);
      setFormData((prev) => ({ ...prev, label: domain }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const validation = validateUrl(formData.url);
    if (!validation.isValid) {
      setValidationError(validation.error);
      return;
    }

    const finalLink: SocialLink = {
      ...formData,
      id: link?.id || crypto.randomUUID(),
      url: validation.normalizedUrl,
    };

    onSave(finalLink);
    onClose();
  };

  const handleIconSelect = (iconType: IconType, customUrl?: string) => {
    setFormData((prev) => ({
      ...prev,
      iconType,
      customIconUrl: customUrl || prev.customIconUrl,
    }));
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <h2 className="text-lg font-semibold text-gray-800">
              {isEditing ? 'Edit Link' : 'Add New Link'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-200"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-5">
            {/* URL Input */}
            <div>
              <label htmlFor="link-url" className="block text-sm font-medium text-gray-700 mb-1.5">
                URL <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="link-url"
                  type="text"
                  value={formData.url}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  onBlur={handleUrlBlur}
                  placeholder="https://github.com/username or email@example.com"
                  className={`w-full px-3 py-2.5 pr-10 text-sm border rounded-lg transition-all
                    focus:outline-none focus:ring-2 focus:ring-offset-0
                    ${validationError 
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
                      : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'}`}
                  autoFocus
                />
                {isCheckingUrl && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {faviconUrl && !isCheckingUrl && (
                  <img 
                    src={faviconUrl} 
                    alt="" 
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 object-contain"
                  />
                )}
              </div>
              {validationError ? (
                <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {validationError}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-gray-500">
                  Supports websites (https://), email (mailto:), and phone (tel:)
                </p>
              )}
            </div>

            {/* Label Input */}
            <div>
              <label htmlFor="link-label" className="block text-sm font-medium text-gray-700 mb-1.5">
                Label
              </label>
              <input
                id="link-label"
                type="text"
                value={formData.label}
                onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
                placeholder="GitHub Profile"
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
              />
              <p className="mt-1.5 text-xs text-gray-500">
                Display name for this link (auto-generated from domain if left empty)
              </p>
            </div>

            {/* Icon Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Icon
              </label>
              <IconSelector
                selectedIcon={formData.iconType}
                customIconUrl={formData.customIconUrl}
                onSelect={handleIconSelect}
              />
            </div>

            {/* Color Picker */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Custom Color (optional)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formData.color || '#6B7280'}
                  onChange={(e) => setFormData((prev) => ({ ...prev, color: e.target.value }))}
                  className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.color || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, color: e.target.value }))}
                  placeholder="#6B7280"
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg
                    focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
                />
                {formData.color && (
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, color: undefined }))}
                    className="text-xs text-gray-500 hover:text-gray-700 underline whitespace-nowrap"
                  >
                    Professional
                  </button>
                )}
              </div>
              {formData.color && (
                <p className="mt-1.5 text-xs text-amber-600">
                  Custom colors may not print well. Remove for a professional look.
                </p>
              )}
            </div>

            {/* Preview */}
            {formData.url && !validationError && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Preview
                </span>
                <div className="mt-2 flex items-center gap-3">
                  <a 
                    href={formData.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border 
                      border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all"
                  >
                    {formData.iconType === 'custom' && formData.customIconUrl ? (
                      <img src={formData.customIconUrl} alt="" className="w-5 h-5 object-contain" />
                    ) : (
                      <span 
                        dangerouslySetInnerHTML={{ 
                          __html: getIconByType(formData.iconType).svg
                        }} 
                      />
                    )}
                    <span className="text-sm text-gray-700">
                      {formData.label || extractDomain(formData.url)}
                    </span>
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 
                rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!!validationError || !formData.url.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 
                rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isEditing ? 'Save Changes' : 'Add Link'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
