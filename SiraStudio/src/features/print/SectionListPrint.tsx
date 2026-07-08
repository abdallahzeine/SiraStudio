import { Fragment } from 'react';
import type { CVSection, CVItem, DateFormat } from '../../shared/types';
import { sectionRegistry } from '../cv-editor/sections/registry';
import { PrintRichText } from './PrintRichText';
import { ItemFramePrint } from './layouts/ItemFramePrint';

interface SectionListPrintProps {
  sections: CVSection[];
  dateFormat: DateFormat;
}

function renderItemFallback(section: CVSection, item: CVItem) {
  return (
    <ItemFramePrint density={section.layout.density}>
      <PrintRichText value={item.title || item.subtitle || item.role || item.body || ''} className="text-gray-700 text-sm" />
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

        if (section.type === 'spacer') {
          const spacerItems = section.items.length === 0
            ? [{ id: `${section.id}-spacer`, body: '32' }]
            : section.items;

          return (
            <Fragment key={section.id}>
              {spacerItems.map((item, itemIndex) => (
                <Fragment key={item.id}>
                  {renderPrint
                    ? renderPrint({
                      item,
                      section,
                      layout: section.layout,
                      sectionIndex,
                      index: itemIndex,
                      total: spacerItems.length,
                      dateFormat,
                      schema: section.schema,
                    })
                    : renderItemFallback(section, item)}
                </Fragment>
              ))}
            </Fragment>
          );
        }

        return (
          <Fragment key={section.id}>
            <hr className="border-t border-gray-300 mb-2" />
            <section className="mb-3">
              <div className="text-lg font-bold text-gray-800 flex-1 mb-3" role="heading" aria-level={2}>
                <PrintRichText value={section.title} className="text-lg font-bold text-gray-800" inline />
              </div>
              <div className={sectionItemsClass}>
                {section.items.map((item, itemIndex) => {
                  if (renderPrint) {
                    return (
                      <Fragment key={item.id}>
                        {renderPrint({
                          item,
                          section,
                          layout: section.layout,
                          sectionIndex,
                          index: itemIndex,
                          total: section.items.length,
                          dateFormat,
                          schema: section.schema,
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
