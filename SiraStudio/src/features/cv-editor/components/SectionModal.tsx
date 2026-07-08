import { useState } from 'react';
import type { SectionType, CVSection, CustomFieldDef, CustomFieldKind, SectionLayout } from '../../../shared/types';
import { sectionRegistry } from '../sections/registry';
import { sectionCategories } from '../sections/categories';
import { spacerDef } from '../sections/spacer';
import { classicLayouts, professionalLayouts } from '../presets';
import { uid } from '../../../shared/utils/helpers';
import {
  LayoutPreviewSkeleton,
} from '../layouts/SkeletonPreview';
import { OptionCard, OptionRow } from './SectionLayoutPanel';

type WizardStep = 1 | 2 | 3;

const dateSlotLabels: Record<string, string> = {
  'right-inline': 'Far Right',
  'below-title': 'Below',
  'left-margin': 'After Title',
  hidden: 'Hidden',
};

const densityLabels: Record<string, string> = {
  compact: 'Compact',
  normal: 'Normal',
  relaxed: 'Relaxed',
};

const iconStyleLabels: Record<string, string> = {
  none: 'None',
  bullet: '•',
  dash: '–',
  chevron: '›',
};

interface SectionModalProps {
  onClose: () => void;
  onAddSection: (section: CVSection) => void;
}

function StepIndicator({ current }: { current: WizardStep }) {
  const steps: { n: WizardStep; label: string }[] = [
    { n: 1, label: 'Section Type' },
    { n: 2, label: 'Layout' },
    { n: 3, label: 'Fields & Title' },
  ];
  return (
    <div className="flex items-center justify-center gap-2 py-1">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-2">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
              current === s.n
                ? 'bg-violet-600 text-white'
                : current > s.n
                  ? 'bg-violet-200 text-violet-700'
                  : 'bg-gray-200 text-gray-500'
            }`}
          >
            {current > s.n ? '✓' : s.n}
          </div>
          <span className={`text-xs font-medium ${current === s.n ? 'text-gray-900' : 'text-gray-400'}`}>
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <div className={`w-6 h-px ${current > s.n ? 'bg-violet-300' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

const FIELD_KINDS: { kind: CustomFieldKind; label: string }[] = [
  { kind: 'text', label: 'Short text' },
  { kind: 'multiline', label: 'Long text' },
  { kind: 'date', label: 'Date' },
  { kind: 'bullets', label: 'Bullet list' },
];

export function SectionModal({ onClose, onAddSection }: SectionModalProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [stepDirection, setStepDirection] = useState<'forward' | 'back'>('forward');
  const [selectedType, setSelectedType] = useState<SectionType | null>(null);
  const [draftLayout, setDraftLayout] = useState<SectionLayout | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [customFields, setCustomFields] = useState<CustomFieldDef[]>([
    { key: uid(), label: 'Field 1', kind: 'text' },
  ]);
  const [customTitle, setCustomTitle] = useState('');
  const [useCustomTitle, setUseCustomTitle] = useState(false);

  const def = selectedType ? sectionRegistry[selectedType] : null;

  const handleSelectType = (type: SectionType) => {
    setSelectedType(type);
    setDraftLayout({ ...sectionRegistry[type].defaultLayout });
    setStepDirection('forward');
    if (type === 'custom') {
      setStep(3);
    } else {
      setStep(2);
    }
  };

  const handleAddSpacer = () => {
    const newSection: CVSection = {
      id: uid(),
      type: 'spacer',
      title: '',
      items: [spacerDef.newItem()],
      layout: { ...spacerDef.defaultLayout },
    };
    onAddSection(newSection);
    onClose();
  };

  const handleCreate = () => {
    if (!selectedType || !draftLayout) return;
    if (selectedType === 'custom' && customFields.length === 0) return;
    const sectionDef = sectionRegistry[selectedType];
    const title = useCustomTitle && customTitle.trim()
      ? customTitle.trim().toUpperCase()
      : sectionDef.defaultTitle;
    const firstItem = sectionDef.newItem();
    const newSection: CVSection = {
      id: uid(),
      type: selectedType,
      title,
      items: [firstItem],
      layout: draftLayout,
      ...(selectedType === 'custom' ? { schema: { fields: customFields } } : {}),
    };
    onAddSection(newSection);
    onClose();
  };

  const addCustomField = () => {
    setCustomFields((prev) => [
      ...prev,
      { key: uid(), label: `Field ${prev.length + 1}`, kind: 'text' as CustomFieldKind },
    ]);
  };

  const updateCustomField = (idx: number, patch: Partial<CustomFieldDef>) => {
    setCustomFields((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const removeCustomField = (idx: number) => {
    setCustomFields((prev) => prev.filter((_, i) => i !== idx));
  };

  const setLayout = <K extends keyof SectionLayout>(key: K, value: SectionLayout[K]) => {
    if (!draftLayout) return;
    setDraftLayout({ ...draftLayout, [key]: value });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="modal-backdrop absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="modal-content relative z-10 w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Add New Section</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-3 pb-2 shrink-0 border-b border-gray-100">
          <StepIndicator current={step} />
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto flex-1 overflow-x-hidden">
          <div key={step} className={stepDirection === 'forward' ? 'animate-step-right' : 'animate-step-left'}>
          {/* ─── STEP 1: Choose section type ─── */}
          {step === 1 && (
            <div className="space-y-3">
              <button
                onClick={handleAddSpacer}
                className="w-full text-left px-4 py-2.5 rounded-lg border border-dashed border-violet-300 hover:border-violet-500 hover:bg-violet-50 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm text-violet-700">Spacer</div>
                    <div className="text-xs text-violet-400">Add empty vertical space between sections</div>
                  </div>
                  <span className="text-violet-400 text-lg leading-none">↕</span>
                </div>
              </button>
              {sectionCategories.map((cat) => {
                const isExpanded = expandedCategory === cat.id;
                const isSingleType = cat.types.length === 1;
                const isComingSoon = cat.id === 'custom';

                return (
                  <div key={cat.id}>
                    <button
                      disabled={isComingSoon}
                      onClick={() => {
                        if (isSingleType) {
                          handleSelectType(cat.types[0]);
                          return;
                        }
                        setExpandedCategory(isExpanded ? null : cat.id);
                      }}
                      className={`w-full text-left px-4 py-2.5 rounded-lg border transition-all ${
                        isComingSoon
                          ? 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-60'
                          : isExpanded
                            ? 'border-violet-500 bg-violet-50 shadow-sm'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-sm text-gray-900">{cat.label}</div>
                          <div className="text-xs text-gray-500">{cat.description}</div>
                        </div>
                        {isComingSoon ? (
                          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider border border-gray-200 rounded px-1.5 py-0.5">Coming Soon</span>
                        ) : !isSingleType ? (
                          <svg
                            className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        ) : null}
                      </div>
                    </button>

                    {/* Expanded sub-options */}
                    {isExpanded && cat.id === 'heading-date' && (
                      <div className="mt-2 ml-4 grid grid-cols-2 gap-2">
                        {cat.types.map((type) => {
                          const d = sectionRegistry[type];
                          return (
                            <button
                              key={type}
                              onClick={() => handleSelectType(type)}
                              className="text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-violet-300 hover:bg-violet-50 transition-colors"
                            >
                              <div className="text-sm font-medium text-gray-800">{d.defaultTitle}</div>
                              <div className="text-xs text-gray-500">{d.description}</div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ─── STEP 2: Choose layout ─── */}
          {step === 2 && def && draftLayout && selectedType && (
            <div className="space-y-5">
              {/* Preset cards */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quick Preset</h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDraftLayout({ ...classicLayouts[selectedType!] })}
                    className={`flex-1 relative text-left px-3 py-2.5 rounded-xl border-2 transition-all ${
                      draftLayout.presetId === 'classic'
                        ? 'border-violet-500 bg-violet-50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="text-sm font-medium text-gray-800">Classic</div>
                    <div className="text-xs text-gray-500">Original layout style</div>
                  </button>
                  <button
                    onClick={() => setDraftLayout({ ...professionalLayouts[selectedType!] })}
                    className={`flex-1 relative text-left px-3 py-2.5 rounded-xl border-2 transition-all ${
                      draftLayout.presetId === 'professional'
                        ? 'border-violet-500 bg-violet-50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                      ✓
                    </span>
                    <div className="text-sm font-medium text-gray-800">Professional</div>
                    <div className="text-xs text-gray-500">Optimized for recruiters</div>
                  </button>
                </div>
              </div>

              {/* Live skeleton preview */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Preview</p>
                <LayoutPreviewSkeleton
                  category={def.category}
                  layout={draftLayout}
                />
              </div>

              {/* Layout options */}
<div className="space-y-4">
                {def.allowedLayoutOptions.dateSlot.length > 1 && (
                  <OptionRow title="Date Position">
                    {def.allowedLayoutOptions.dateSlot.map((v) => (
                      <OptionCard
                        key={v}
                        label={dateSlotLabels[v]}
                        selected={draftLayout.dateSlot === v}
                        recommended={def.recommendedLayout.dateSlot === v}
                        onSelect={() => setLayout('dateSlot', v)}
                      />
                    ))}
                    {draftLayout.dateSlot === 'hidden' && (
                      <p className="w-full text-xs text-amber-600 mt-2">
                        <span className="font-medium">Tip:</span> Dates help recruiters understand your career timeline.
                      </p>
                    )}
                  </OptionRow>
                )}

                {def.allowedLayoutOptions.density.length > 1 && (
                  <OptionRow title="Spacing">
                    {def.allowedLayoutOptions.density.map((v) => (
                      <OptionCard
                        key={v}
                        label={densityLabels[v]}
                        selected={draftLayout.density === v}
                        recommended={def.recommendedLayout.density === v}
                        onSelect={() => setLayout('density', v)}
                      />
                    ))}
                  </OptionRow>
                )}

                {def.allowedLayoutOptions.iconStyle.length > 1 && (
                  <OptionRow title="Bullet Style">
                    {def.allowedLayoutOptions.iconStyle.map((v) => (
                      <OptionCard
                        key={v}
                        label={iconStyleLabels[v]}
                        selected={draftLayout.iconStyle === v}
                        recommended={def.recommendedLayout.iconStyle === v}
                        onSelect={() => setLayout('iconStyle', v)}
                      />
                    ))}
                  </OptionRow>
                )}

              </div>
            </div>
          )}

          {/* ─── STEP 3: Fields & Title (custom only) ─── */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Fields</label>
                <div className="space-y-2">
                  {customFields.map((field, idx) => (
                    <div key={field.key} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) => updateCustomField(idx, { label: e.target.value })}
                        placeholder="Field name"
                        className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-violet-500"
                      />
                      <select
                        value={field.kind}
                        onChange={(e) => updateCustomField(idx, { kind: e.target.value as CustomFieldKind })}
                        className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-500"
                      >
                        {FIELD_KINDS.map((fk) => (
                          <option key={fk.kind} value={fk.kind}>{fk.label}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => removeCustomField(idx)}
                        disabled={customFields.length <= 1}
                        className="text-red-400 hover:text-red-600 disabled:opacity-30 text-sm px-1"
                        title="Remove field"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={addCustomField}
                  className="mt-2 text-xs text-violet-600 hover:text-violet-700 border border-dashed border-violet-300 hover:border-violet-500 rounded px-3 py-1 transition-colors"
                >
                  + Add field
                </button>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <input
                    type="checkbox"
                    checked={useCustomTitle}
                    onChange={(e) => setUseCustomTitle(e.target.checked)}
                    className="w-4 h-4 text-violet-600 rounded border-gray-300 focus:ring-violet-500"
                  />
                  Use custom title
                </label>
                {useCustomTitle ? (
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Enter section title..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  />
                ) : (
                  <div className="text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
                    Default title: <span className="font-medium">{sectionRegistry.custom.defaultTitle}</span>
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Footer navigation */}
        <div className="px-6 py-3 bg-gray-50 flex items-center justify-between shrink-0">
          <div>
            {step > 1 && (
              <button
                onClick={() => { setStepDirection('back'); setStep((s) => (s - 1) as WizardStep); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                ← Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            {step === 2 && def && (
              <button
                onClick={handleCreate}
                className="px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors"
              >
                Create Section
              </button>
            )}
            {step === 3 && (
              <button
                onClick={handleCreate}
                disabled={selectedType === 'custom' && customFields.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Create Section
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
