import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import type { SocialLink } from "../../../shared/types";
import { LinkCard } from "./LinkCard";
import { LinkEditor } from "./LinkEditor";
import { getIconByType } from "../icons";
import { ConfirmModal } from "../../../shared/components/ConfirmModal";
import { useLinkManager } from "../hooks/useLinkManager";

interface LinkManagerProps {
  links: SocialLink[];
  onAdd: (link: SocialLink) => void;
  onUpdate: (index: number, link: SocialLink) => void;
  onDelete: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  layout?: "compact" | "grid" | "list";
}

export function LinkManager({
  links,
  onAdd,
  onUpdate,
  onDelete,
  onReorder,
  layout = "compact",
}: LinkManagerProps) {
  const {
    isEditorOpen,
    editingLink,
    pendingDeleteId,
    sensors,
    sortedLinks,
    sortableIds,
    handleDragEnd,
    handleAddLink,
    handleEditLink,
    handleDeleteLink,
    confirmDeleteLink,
    handleSaveLink,
    handleCloseEditor,
    cancelDeleteLink,
  } = useLinkManager({ links, onAdd, onUpdate, onDelete, onReorder });

  const renderAddButton = () => {
    if (layout === "compact") {
      return (
        <button
          onClick={handleAddLink}
          className="flex items-center justify-center w-9 h-9 rounded-full
            bg-gray-100 hover:bg-blue-100 text-gray-400 hover:text-blue-600
            transition-all duration-200 hover:scale-110
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label="Add new link"
          title="Add new link"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
      );
    }

    if (layout === "grid") {
      return (
        <button
          onClick={handleAddLink}
          className="no-print flex flex-col items-center justify-center p-4 rounded-xl
            border-2 border-dashed border-gray-300 hover:border-blue-400
            text-gray-400 hover:text-blue-500 bg-gray-50 hover:bg-blue-50
            transition-all duration-200"
          aria-label="Add new link"
        >
          <svg
            className="w-8 h-8 mb-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          <span className="text-xs font-medium">Add Link</span>
        </button>
      );
    }

    return (
      <button
        onClick={handleAddLink}
        className="no-print w-full flex items-center justify-center gap-2 p-3 rounded-lg
          border-2 border-dashed border-gray-300 hover:border-blue-400
          text-gray-400 hover:text-blue-500 bg-gray-50 hover:bg-blue-50
          transition-all duration-200"
        aria-label="Add new link"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
        <span className="text-sm font-medium">Add New Link</span>
      </button>
    );
  };

  const sortableStrategy =
    layout === "compact" ? horizontalListSortingStrategy : rectSortingStrategy;

  const linkCards = sortedLinks.map((link) => (
    <LinkCard
      key={link.id}
      link={link}
      onEdit={() => handleEditLink(link)}
      onDelete={() => handleDeleteLink(link.id)}
      layout={layout}
    />
  ));

  const renderSortableContent = () => {
    if (layout === "compact") {
      return (
        <div className="no-print">
          <SortableContext items={sortableIds} strategy={sortableStrategy}>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {linkCards}
              {renderAddButton()}
            </div>
          </SortableContext>
        </div>
      );
    }

    if (layout === "grid") {
      return (
        <SortableContext items={sortableIds} strategy={sortableStrategy}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {linkCards}
            {renderAddButton()}
          </div>
        </SortableContext>
      );
    }

    return (
      <SortableContext items={sortableIds} strategy={sortableStrategy}>
        <div className="space-y-2">
          {linkCards}
          {renderAddButton()}
        </div>
      </SortableContext>
    );
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        {renderSortableContent()}
      </DndContext>

      {layout === "compact" && (
        <div className="hidden print:flex print:flex-wrap print:items-center print:justify-center print:gap-4 print:mt-2">
          {sortedLinks.map((link) => {
            const iconDef = getIconByType(link.iconType);
            const iconColor = link.color || iconDef.color;
            return (
              <a
                key={link.id}
                href={link.url}
                className="print:inline-flex print:items-center print:gap-1.5 print:text-xs"
                style={{ color: "black !important" }}
              >
                {link.iconType === "custom" && link.customIconUrl ? (
                  <img
                    src={link.customIconUrl}
                    alt=""
                    className="print:w-4 print:h-4"
                  />
                ) : (
                  <span
                    className="print:w-4 print:h-4"
                    style={{ color: iconColor }}
                    dangerouslySetInnerHTML={{
                      __html: iconDef.svg.replace(
                        'class="w-5 h-5"',
                        'width="16" height="16"',
                      ),
                    }}
                  />
                )}
                <span style={{ color: "black" }}>{link.label}</span>
              </a>
            );
          })}
        </div>
      )}

      {isEditorOpen && (
        <LinkEditor
          onClose={handleCloseEditor}
          onSave={handleSaveLink}
          link={editingLink}
        />
      )}
      {pendingDeleteId && (
        <ConfirmModal
          message="Are you sure you want to delete this link?"
          confirmLabel="Delete"
          onConfirm={confirmDeleteLink}
          onCancel={cancelDeleteLink}
        />
      )}
    </>
  );
}
