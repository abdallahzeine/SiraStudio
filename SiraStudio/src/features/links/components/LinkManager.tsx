import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import type { SocialLink } from "../../../shared/types";
import { LinkCard } from "./LinkCard";
import { LinkEditor } from "./LinkEditor";
import { getIconColor, LinkTypeIcon } from "../icons";
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
            bg-gray-100 hover:bg-blue-100 text-gray-400 hover:text-[#0078D7]
            transition-all duration-200 hover:scale-110
            focus:outline-none focus:ring-2 focus:ring-[#0078D7] focus:ring-offset-2"
          aria-label="Add new link"
          title="Add new link"
        >
          <Plus size={20} />
        </button>
      );
    }

    if (layout === "grid") {
      return (
        <button
          onClick={handleAddLink}
          className="no-print flex flex-col items-center justify-center p-4 rounded-xl
            border-2 border-dashed border-gray-300 hover:border-blue-400
            text-gray-400 hover:text-[#0078D7] bg-gray-50 hover:bg-blue-50
            transition-all duration-200"
          aria-label="Add new link"
        >
          <Plus size={32} className="mb-1" />
          <span className="text-xs font-medium">Add Link</span>
        </button>
      );
    }

    return (
      <button
        onClick={handleAddLink}
        className="no-print w-full flex items-center justify-center gap-2 p-3 rounded-lg
          border-2 border-dashed border-gray-300 hover:border-blue-400
          text-gray-400 hover:text-[#0078D7] bg-gray-50 hover:bg-blue-50
          transition-all duration-200"
        aria-label="Add new link"
      >
        <Plus size={20} />
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
      onArmDelete={() => handleDeleteLink(link.id)}
      isPendingDelete={pendingDeleteId === link.id}
      onConfirmDelete={confirmDeleteLink}
      onCancelDelete={cancelDeleteLink}
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
          {sortedLinks.map((link) => (
            <a
              key={link.id}
              href={link.url}
              className="print:inline-flex print:items-center print:gap-1.5 print:text-xs"
              style={{ color: "black" }}
            >
              <LinkTypeIcon
                type={link.iconType}
                customIconUrl={link.customIconUrl}
                size={16}
                color={getIconColor(link.iconType, link.color)}
              />
              <span style={{ color: "black" }}>{link.label}</span>
            </a>
          ))}
        </div>
      )}

      {isEditorOpen && (
        <LinkEditor
          onClose={handleCloseEditor}
          onSave={handleSaveLink}
          link={editingLink}
        />
      )}
    </>
  );
}
