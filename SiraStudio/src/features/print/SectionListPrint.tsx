import { Fragment } from 'react';
import type { CVSection, CVItem, DateFormat } from '../../shared/types';
import { sectionRegistry } from '../cv-editor/sections/registry';
import { ItemLinksProvider } from '../cv-editor/ItemLinks';
import { PrintRichText } from './PrintRichText';
import { ItemFramePrint } from './layouts/ItemFramePrint';
import { fieldString } from '../../shared/utils/cvContent';

interface SectionListPrintProps {
  sections: CVSection[];
  dateFormat: DateFormat;
}

function readGroup(node: { keepTogetherGroup?: string }): string | undefined {
  return node.keepTogetherGroup || undefined;
}

/** Adjacent siblings with the same group id form one run; gaps start a new run. */
function consecutiveGroupRuns<T>(
  list: T[],
  getGroup: (item: T) => string | undefined,
): { groupId: string | undefined; start: number; items: T[] }[] {
  const runs: { groupId: string | undefined; start: number; items: T[] }[] = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const groupId = getGroup(item);
    const last = runs[runs.length - 1];
    if (groupId && last?.groupId === groupId) {
      last.items.push(item);
    } else {
      runs.push({ groupId, start: i, items: [item] });
    }
  }
  return runs;
}

function renderItemFallback(section: CVSection, item: CVItem) {
  return (
    <ItemFramePrint density={section.layout.density}>
      <PrintRichText value={fieldString(item, 'title') || fieldString(item, 'subtitle') || fieldString(item, 'role') || fieldString(item, 'body')} className="text-gray-700 text-sm" />
    </ItemFramePrint>
  );
}

function renderSectionBody(
  section: CVSection,
  sectionIndex: number,
  dateFormat: DateFormat,
) {
  const definition = sectionRegistry[section.type] ?? sectionRegistry.custom;
  const renderPrint = definition.renderItemPrint;
  const sectionItemsClass = section.layout.columns === 2 ? 'columns-2' : '';
  const { items, schema } = section.content;
  const itemRuns = consecutiveGroupRuns(items, readGroup);

  return (
    <Fragment key={section.id}>
      <hr className="border-t border-gray-300 mb-2" />
      <section className="mb-3">
        <div className="text-lg font-bold text-gray-800 flex-1 mb-3" role="heading" aria-level={2}>
          <PrintRichText value={section.title} className="text-lg font-bold text-gray-800" inline />
        </div>
        <div className={sectionItemsClass}>
          {itemRuns.map((run) => {
            const nodes = run.items.map((item, offset) => {
              const itemIndex = run.start + offset;
              return (
                <ItemLinksProvider key={item.id} links={item.links}>
                  {renderPrint
                    ? renderPrint({
                        item,
                        section,
                        layout: section.layout,
                        sectionIndex,
                        index: itemIndex,
                        total: items.length,
                        dateFormat,
                        schema,
                      })
                    : renderItemFallback(section, item)}
                </ItemLinksProvider>
              );
            });
            if (run.groupId) {
              return (
                <div key={run.items[0].id} className="avoid-break">
                  {nodes}
                </div>
              );
            }
            return <Fragment key={run.items[0].id}>{nodes}</Fragment>;
          })}
        </div>
      </section>
    </Fragment>
  );
}

export function SectionListPrint({ sections, dateFormat }: SectionListPrintProps) {
  const sectionRuns = consecutiveGroupRuns(sections, readGroup);

  return (
    <>
      {sectionRuns.map((run) => {
        const body = run.items.map((section, offset) =>
          renderSectionBody(section, run.start + offset, dateFormat),
        );
        if (run.groupId) {
          return (
            <div key={run.items[0].id} className="avoid-break">
              {body}
            </div>
          );
        }
        return <Fragment key={run.items[0].id}>{body}</Fragment>;
      })}
    </>
  );
}
