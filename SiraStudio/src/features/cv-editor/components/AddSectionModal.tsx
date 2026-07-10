import { useMemo, useState } from 'react';
import type { CVSection, CustomFieldKind, SectionFieldDef, SectionType } from '../../../shared/types';
import type { CVDocument } from '../../../app/store/types';
import { createCVStore, CVStoreProvider, useCVSelector } from '../../../app/store';
import { Modal } from '../../../shared/components/Modal';
import { uid } from '../../../shared/utils/helpers';
import { createSection, sectionRegistry } from '../sections/registry';
import { EditorProvider } from '../editor/EditorContext';
import { CVTextEditor } from '../editor/CVTextEditor';
import { SectionRenderer } from '../engine/SectionRenderer';

interface AddSectionModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (section: CVSection) => void;
}

interface FieldDraft {
  id: string;
  label: string;
  kind: CustomFieldKind;
}

interface FieldKindOption {
  value: CustomFieldKind;
  label: string;
  defaultFieldLabel: string;
  hint: string;
  example: string;
}

const FIELD_KINDS: FieldKindOption[] = [
  { value: 'text', label: 'Short text', defaultFieldLabel: 'Title', hint: 'One line', example: 'Role, company, city' },
  { value: 'multiline', label: 'Long text', defaultFieldLabel: 'Description', hint: 'Paragraph', example: 'Description or notes' },
  { value: 'date', label: 'Date', defaultFieldLabel: 'Date', hint: 'Time range', example: '2022 – Present' },
  { value: 'bullets', label: 'Bullet list', defaultFieldLabel: 'Achievements', hint: 'Points', example: 'Achievements or duties' },
  { value: 'tags', label: 'Tags', defaultFieldLabel: 'Skills', hint: 'Chips', example: 'Python, React, SQL' },
];

const STARTER_FIELDS: FieldDraft[] = [
  { id: 'starter-title', label: 'Title', kind: 'text' },
  { id: 'starter-date', label: 'Date', kind: 'date' },
  { id: 'starter-details', label: 'Achievements', kind: 'bullets' },
];

function defaultFieldLabel(kind: CustomFieldKind): string {
  return FIELD_KINDS.find((option) => option.value === kind)?.defaultFieldLabel ?? 'Field';
}

function newField(kind: CustomFieldKind = 'text', label = defaultFieldLabel(kind)): FieldDraft {
  return { id: uid(), label, kind };
}

function fieldKeyFromLabel(label: string): string {
  const asciiKey = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (asciiKey) return asciiKey;

  const characters = Array.from(label).filter((character) => /[\p{L}\p{N}]/u.test(character));
  return characters.length > 0
    ? `field_${characters.map((character) => character.codePointAt(0)?.toString(36)).join('_')}`
    : '';
}

function uniqueSchema(fields: FieldDraft[]): SectionFieldDef[] | null {
  const used = new Map<string, number>();
  const schema: SectionFieldDef[] = [];

  for (const field of fields) {
    const label = field.label.trim();
    const baseKey = fieldKeyFromLabel(label);
    if (!label || !baseKey) return null;

    const count = used.get(baseKey) ?? 0;
    used.set(baseKey, count + 1);
    const key = count === 0 ? baseKey : `${baseKey}_${count + 1}`;

    schema.push({ key, label, kind: field.kind });
  }

  return schema.length > 0 ? schema : null;
}

function fieldError(field: FieldDraft): string | null {
  if (!field.label.trim()) return 'Give this field a name';
  if (!fieldKeyFromLabel(field.label)) return 'Use letters or numbers in the name';
  return null;
}

function createPreviewDocument(title: string, schema: SectionFieldDef[]): CVDocument {
  const section = createSection('custom', { title: title.trim() || sectionRegistry.custom.defaultTitle, schema });
  return {
    schemaVersion: 1,
    revision: 0,
    data: {
      header: {
        name: '',
        location: '',
        phone: '',
        email: '',
        socialLinks: [],
      },
      sections: [section],
      template: { id: 'single-column', columns: 1 },
    },
    meta: { lastSavedAt: null },
  };
}

/** Real canvas section chrome + SectionRenderer, isolated store (no persist). */
function CanvasCustomSectionPreview({ title, schema }: { title: string; schema: SectionFieldDef[] }) {
  const structureKey = JSON.stringify({ title: title.trim(), schema });
  const store = useMemo(
    () => createCVStore(createPreviewDocument(title, schema), { persist: false }),
    [structureKey, title, schema],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">CV canvas preview</p>
        <p className="text-[11px] text-gray-400">Same editors as the real CV — try typing</p>
      </div>
      <div className="p-3 sm:p-4">
        <div
          key={structureKey}
          className="cv-document mx-auto max-w-3xl rounded-sm bg-white px-3 py-4 font-sans text-gray-800 shadow-md sm:px-6 sm:py-6"
        >
          <CVStoreProvider store={store}>
            <EditorProvider>
              <PreviewSectionBody />
            </EditorProvider>
          </CVStoreProvider>
        </div>
      </div>
    </div>
  );
}

function CustomSectionPreview({ title, schema }: { title: string; schema: SectionFieldDef[] | null }) {
  if (!schema) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-xs text-gray-500">
        Name every field to unlock the real CV canvas preview.
      </div>
    );
  }

  return <CanvasCustomSectionPreview title={title} schema={schema} />;
}

function PreviewSectionBody() {
  const section = useCVSelector((doc) => doc.data.sections[0]);
  if (!section) return null;

  return (
    <>
      <hr className="mb-1 border-t border-gray-300 md:mb-2" />
      <section className="mb-2 md:mb-3">
        <div className="mb-2 flex items-center gap-1 md:mb-3">
          <div className="flex-1 text-sm font-bold text-gray-800 md:text-lg" role="heading" aria-level={2}>
            <CVTextEditor
              value={section.title}
              path="sections[0].title"
              className="text-sm font-bold text-gray-800 md:text-lg"
              placeholder="SECTION TITLE"
              lazy={false}
            />
          </div>
        </div>
        <SectionRenderer sectionIndex={0} section={section} />
      </section>
    </>
  );
}

export function AddSectionModal({ open, onClose, onCreate }: AddSectionModalProps) {
  const [step, setStep] = useState<'select' | 'custom'>('select');
  const [title, setTitle] = useState(sectionRegistry.custom.defaultTitle);
  const [fields, setFields] = useState<FieldDraft[]>(() => STARTER_FIELDS.map((field) => ({ ...field, id: uid() })));

  const schema = useMemo(() => uniqueSchema(fields), [fields]);
  const titleReady = title.trim().length > 0;
  const canCreate = titleReady && schema !== null;
  const fieldErrors = fields.map(fieldError);
  const firstError = !titleReady
    ? 'Name your section first.'
    : fieldErrors.find(Boolean) ?? null;

  const reset = () => {
    setStep('select');
    setTitle(sectionRegistry.custom.defaultTitle);
    setFields(STARTER_FIELDS.map((field) => ({ ...field, id: uid() })));
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSelect = (type: SectionType) => {
    if (type === 'custom') {
      setStep('custom');
      return;
    }

    onCreate(createSection(type));
    handleClose();
  };

  const updateField = (id: string, patch: Partial<FieldDraft>) => {
    setFields((current) => current.map((field) => (field.id === id ? { ...field, ...patch } : field)));
  };

  const updateFieldKind = (field: FieldDraft, kind: CustomFieldKind) => {
    const isDefaultLabel = field.label === defaultFieldLabel(field.kind);
    updateField(field.id, {
      kind,
      label: isDefaultLabel ? defaultFieldLabel(kind) : field.label,
    });
  };

  const removeField = (id: string) => {
    setFields((current) => (current.length <= 1 ? current : current.filter((field) => field.id !== id)));
  };

  const handleCreateCustom = () => {
    if (!schema || !titleReady) return;
    onCreate(createSection('custom', { title: title.trim(), schema }));
    handleClose();
  };

  return (
    <Modal
      open={open}
      title={step === 'select' ? 'Add section' : 'Build a custom section'}
      onClose={handleClose}
      size="lg"
      contentClassName="max-h-[calc(100dvh-2rem)]"
      sideContent={step === 'custom' ? <CustomSectionPreview title={title} schema={schema} /> : undefined}
    >
      {step === 'select' ? (
        <div className="overflow-y-auto p-5">
          <p className="mb-4 text-sm text-gray-600">
            Pick a ready-made section, or build your own fields.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.values(sectionRegistry).map((definition) => (
              <button
                key={definition.type}
                type="button"
                autoFocus={definition.type === 'summary'}
                onClick={() => handleSelect(definition.type)}
                className={`rounded-xl border p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-violet-300 ${
                  definition.type === 'custom'
                    ? 'border-violet-300 bg-violet-50 hover:border-violet-400 hover:bg-violet-100'
                    : 'border-gray-200 hover:border-violet-300 hover:bg-violet-50'
                }`}
              >
                <span className="block text-sm font-semibold text-gray-800">{definition.label}</span>
                <span className="mt-1 block text-xs leading-relaxed text-gray-500">{definition.description}</span>
                {definition.type === 'custom' && (
                  <span className="mt-2 inline-block text-xs font-medium text-violet-700">You choose the fields →</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleCreateCustom();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="space-y-5">
                <ol className="flex flex-wrap gap-2 text-xs font-medium text-gray-500">
                  <li className="rounded-full bg-violet-100 px-2.5 py-1 text-violet-700">1. Name section</li>
                  <li className="rounded-full bg-violet-100 px-2.5 py-1 text-violet-700">2. Add fields</li>
                  <li className="rounded-full bg-gray-100 px-2.5 py-1">3. Create</li>
                </ol>

                <div>
                  <label htmlFor="custom-section-title" className="mb-1.5 block text-sm font-semibold text-gray-800">
                    Section name
                  </label>
                  <p className="mb-2 text-xs text-gray-500">This is the heading on your CV (for example PUBLICATIONS).</p>
                  <input
                    id="custom-section-title"
                    type="text"
                    autoFocus
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="e.g. PUBLICATIONS"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-800 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800">Fields in each entry</h3>
                      <p className="mt-1 text-xs text-gray-500">
                        Each entry can have several pieces of information. Name them the way they should appear on the CV.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFields((current) => [...current, newField('text')])}
                      className="shrink-0 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-300"
                    >
                      + Add field
                    </button>
                  </div>

                  <div className="mt-3 space-y-3">
                    {fields.map((field, index) => {
                      const error = fieldErrors[index];
                      const kindMeta = FIELD_KINDS.find((kind) => kind.value === field.kind) ?? FIELD_KINDS[0];

                      return (
                        <div key={field.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                              Field {index + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeField(field.id)}
                              disabled={fields.length <= 1}
                              className="text-xs font-medium text-red-600 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              Remove
                            </button>
                          </div>

                          <label htmlFor={`custom-field-label-${field.id}`} className="mb-1 block text-xs font-medium text-gray-700">
                            Field name on CV
                          </label>
                          <input
                            id={`custom-field-label-${field.id}`}
                            type="text"
                            value={field.label}
                            onChange={(event) => updateField(field.id, { label: event.target.value })}
                            placeholder="e.g. Title, Company, Description"
                            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 ${
                              error
                                ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                                : 'border-gray-300 focus:border-violet-500 focus:ring-violet-200'
                            }`}
                          />
                          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

                          <p className="mb-2 mt-3 text-xs font-medium text-gray-700">What kind of input is this?</p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {FIELD_KINDS.map((kind) => {
                              const selected = field.kind === kind.value;
                              return (
                                <button
                                  key={kind.value}
                                  type="button"
                                  onClick={() => updateFieldKind(field, kind.value)}
                                  className={`rounded-lg border px-3 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-violet-300 ${
                                    selected
                                      ? 'border-violet-400 bg-violet-50 ring-1 ring-violet-200'
                                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                  }`}
                                >
                                  <span className="block text-xs font-semibold text-gray-800">{kind.label}</span>
                                  <span className="mt-0.5 block text-[11px] text-gray-500">{kind.hint} · {kind.example}</span>
                                </button>
                              );
                            })}
                          </div>
                          <p className="mt-2 text-[11px] text-gray-400">Example: {kindMeta.example}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              <div className="xl:hidden">
                <CustomSectionPreview title={title} schema={schema} />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
            <p id="custom-section-help" role="status" className={`mb-3 text-xs ${firstError ? 'text-amber-700' : 'text-emerald-700'}`}>
              {firstError ?? 'Looks good — create the section and fill it in on the CV.'}
            </p>
            <div className="flex justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep('select')}
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={!canCreate}
                aria-describedby="custom-section-help"
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create section
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
