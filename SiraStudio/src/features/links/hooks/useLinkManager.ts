import { useCallback, useState } from 'react';
import type { DragEndEvent } from '@dnd-kit/core';
import type { SocialLink } from '../../../shared/types';
import { useDndSensors } from '../../cv-editor/editor/useDndSensors';

interface UseLinkManagerOptions {
  links: SocialLink[];
  onAdd: (link: SocialLink) => void;
  onUpdate: (index: number, link: SocialLink) => void;
  onDelete: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export function useLinkManager({ links, onAdd, onUpdate, onDelete, onReorder }: UseLinkManagerOptions) {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<SocialLink | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const sensors = useDndSensors();

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setPendingDeleteId(null);

    if (over && active.id !== over.id) {
      const oldIndex = links.findIndex((link) => link.id === active.id);
      const newIndex = links.findIndex((link) => link.id === over.id);

      if (oldIndex >= 0 && newIndex >= 0) {
        onReorder(oldIndex, newIndex);
      }
    }
  }, [links, onReorder]);

  const handleAddLink = () => {
    setPendingDeleteId(null);
    setEditingLink(null);
    setIsEditorOpen(true);
  };

  const handleEditLink = (link: SocialLink) => {
    setPendingDeleteId(null);
    setEditingLink(link);
    setIsEditorOpen(true);
  };

  const handleDeleteLink = (linkId: string) => {
    setPendingDeleteId(linkId);
  };

  const confirmDeleteLink = () => {
    if (pendingDeleteId) {
      const index = links.findIndex((link) => link.id === pendingDeleteId);
      if (index >= 0) onDelete(index);
    }
    setPendingDeleteId(null);
  };

  const handleSaveLink = (link: SocialLink) => {
    const normalizedLink = {
      ...link,
      displayOrder: editingLink ? link.displayOrder : links.length,
    };

    if (editingLink) {
      const index = links.findIndex((candidate) => candidate.id === link.id);
      if (index >= 0) {
        onUpdate(index, normalizedLink);
      }
    } else {
      onAdd(normalizedLink);
    }
    setIsEditorOpen(false);
  };

  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    setEditingLink(null);
  };

  const cancelDeleteLink = () => setPendingDeleteId(null);
  const sortedLinks = links;
  const sortableIds = sortedLinks.map((link) => link.id);

  return {
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
  };
}
