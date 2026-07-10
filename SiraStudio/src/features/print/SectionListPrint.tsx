import { Fragment } from 'react';
import type { CVSection, CVItem, DateFormat } from '../../shared/types';
import { sectionRegistry } from '../cv-editor/sections/registry';
import { PrintRichText } from './PrintRichText';
import { ItemFramePrint } from './layouts/ItemFramePrint';
import { fieldString } from '../../shared/utils/cvContent';

interface SectionListPrintProps {
  sections: CVSection[];
  dateFormat: DateFormat;
}

function renderItemFallback(section: CVSection, item: CVItem) {
  return (
    <ItemFramePrint density={section.layout.density}>
      <PrintRichText value={fieldString(item, 'title') || fieldString(item, 'subtitle') || fieldString(item, 'role') || fieldString(item, 'body')} className="text-gray-700 text-sm" />
    </ItemFramePrint>
  );
}

export function SectionListPrint({ sections, dateFormat }: SectionListPrintProps) {
  return (
    <>
      {sections.map((section, sectionIndex) => {
        const definition = sectionRegistry[section.type] ?? sectionRegistry.custom;
        const renderPrint = definition.renderItemPrint;
        const sectionItemsClass = section.layout.columns === 2 ? 'columns-2' : '';
        const { items, schema } = section.content;

        return (
          <Fragment key={section.id}>
            <hr className="border-t border-gray-300 mb-2" />
            <section className="mb-3">
              <div className="text-lg font-bold text-gray-800 flex-1 mb-3" role="heading" aria-level={2}>
                <PrintRichText value={section.title} className="text-lg font-bold text-gray-800" inline />
              </div>
              <div className={sectionItemsClass}>
                {items.map((item, itemIndex) => {
                  if (renderPrint) {
                    return (
                      <Fragment key={item.id}>
                        {renderPrint({
                          item,
                          section,
                          layout: section.layout,
                          sectionIndex,
                          index: itemIndex,
                          total: items.length,
                          dateFormat,
                          schema,
                        })}
                      </Fragment>
                    );
                  }

                  return (
                    <Fragment key={item.id}>
                      {renderItemFallback(section, item)}
                    </Fragment>
                  );
                })}
              </div>
            </section>
          </Fragment>
        );
      })}
    </>
  );
}
