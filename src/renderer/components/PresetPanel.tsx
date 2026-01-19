import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { Plus, Minus, Copy, FolderPlus, FolderMinus, Star } from 'lucide-react';

const FolderIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);

const DocumentIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

interface ContextMenuState {
  x: number;
  y: number;
  presetName: string;
}

interface FolderContextMenuState {
  x: number;
  y: number;
  folderName: string;
}

// Unified item type for the sidebar
type SidebarItemType = { type: 'preset'; id: string } | { type: 'folder'; id: string };

export function PresetPanel() {
  const { presets, presetFolders, sidebarOrder, selectedPreset, selectPreset, command, savePreset, deletePreset, addPresetFolder, removePresetFolder, renamePresetFolder, movePresetToFolder, reorderSidebar, expandedFolders, toggleFolder, setExpandedFolders, saveState } = useAppStore();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [folderContextMenu, setFolderContextMenu] = useState<FolderContextMenuState | null>(null);
  const [isRenaming, setIsRenaming] = useState<string | null>(null);
  const [isRenamingFolder, setIsRenamingFolder] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const folderContextMenuRef = useRef<HTMLDivElement>(null);

  // Drag and drop state
  const [draggedItem, setDraggedItem] = useState<string | null>(null); // 'preset:name' or 'folder:name'
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);
  const [dragOverFolderForMove, setDragOverFolderForMove] = useState<string | null>(null);

  // Dialog states
  const [showAddPresetDialog, setShowAddPresetDialog] = useState(false);
  const [showAddPresetToFolderDialog, setShowAddPresetToFolderDialog] = useState<string | null>(null);
  const [showDeletePresetDialog, setShowDeletePresetDialog] = useState<string | null>(null);
  const [showAddFolderDialog, setShowAddFolderDialog] = useState(false);
  const [showDeleteFolderDialog, setShowDeleteFolderDialog] = useState(false);
  const [showSelectFolderDialog, setShowSelectFolderDialog] = useState(false);
  const [showMoveToFolderMenu, setShowMoveToFolderMenu] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [newPresetName, setNewPresetName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedFolderToDelete, setSelectedFolderToDelete] = useState<string | null>(null);

  // Get root level presets (not in any folder)
  const rootPresets = Object.entries(presets)
    .filter(([_, preset]) => !preset.folder)
    .map(([name, preset]) => ({ name, preset }));

  // Get all folder names
  const allFolderNames = [...new Set([
    ...Object.values(presets).map(p => p.folder).filter((f): f is string => !!f),
    ...presetFolders
  ])];

  // Group presets by folder
  const groupedPresets = Object.entries(presets).reduce(
    (acc, [name, preset]) => {
      const folder = preset.folder || '';
      if (!acc[folder]) acc[folder] = [];
      acc[folder].push({ name, preset });
      return acc;
    },
    {} as Record<string, { name: string; preset: typeof presets[string] }[]>
  );

  // Build the unified sidebar items list
  const buildSidebarItems = (): SidebarItemType[] => {
    const items: SidebarItemType[] = [];

    // All root presets as 'preset:name'
    rootPresets.forEach(({ name }) => {
      items.push({ type: 'preset', id: name });
    });

    // All folders as 'folder:name'
    allFolderNames.forEach(folder => {
      items.push({ type: 'folder', id: folder });
    });

    return items;
  };

  // Get ordered sidebar items
  const getOrderedSidebarItems = (): SidebarItemType[] => {
    const allItems = buildSidebarItems();

    if (sidebarOrder.length === 0) {
      return allItems;
    }

    // Sort by sidebarOrder
    const orderedItems: SidebarItemType[] = [];
    const itemMap = new Map(allItems.map(item => [`${item.type}:${item.id}`, item]));

    // First add items in the specified order
    sidebarOrder.forEach(key => {
      const item = itemMap.get(key);
      if (item) {
        orderedItems.push(item);
        itemMap.delete(key);
      }
    });

    // Then add any remaining items not in the order
    itemMap.forEach(item => orderedItems.push(item));

    return orderedItems;
  };

  const orderedItems = getOrderedSidebarItems();

  // Close context menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
      if (folderContextMenuRef.current && !folderContextMenuRef.current.contains(e.target as Node)) {
        setFolderContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Save state when expanded folders change
  useEffect(() => {
    // Debounce to avoid excessive saves
    const timeout = setTimeout(() => {
      saveState();
    }, 500);
    return () => clearTimeout(timeout);
  }, [expandedFolders, saveState]);

  const handleAddPreset = () => {
    setNewPresetName('');
    setShowAddPresetDialog(true);
  };

  const confirmAddPreset = () => {
    if (newPresetName.trim()) {
      savePreset(newPresetName.trim(), {
        commands: command || '',
        isFavorite: false,
      });
      selectPreset(newPresetName.trim());
    }
    setShowAddPresetDialog(false);
    setNewPresetName('');
  };

  const handleDeletePreset = () => {
    if (selectedPreset) {
      setShowDeletePresetDialog(selectedPreset);
    }
  };

  const confirmDeletePreset = () => {
    if (showDeletePresetDialog) {
      deletePreset(showDeletePresetDialog);
    }
    setShowDeletePresetDialog(null);
  };

  const handleRenamePreset = () => {
    if (selectedPreset) {
      setIsRenaming(selectedPreset);
      setRenameValue(selectedPreset);
    }
  };

  const handleRenameSubmit = () => {
    if (isRenaming && renameValue.trim() && renameValue !== isRenaming) {
      const preset = presets[isRenaming];
      if (preset) {
        savePreset(renameValue.trim(), preset);
        deletePreset(isRenaming);
        if (selectedPreset === isRenaming) {
          selectPreset(renameValue.trim());
        }
      }
    }
    setIsRenaming(null);
    setRenameValue('');
  };

  const handleDuplicate = () => {
    if (selectedPreset) {
      const preset = presets[selectedPreset];
      if (preset) {
        let newName = `${selectedPreset}_copy`;
        let counter = 1;
        while (presets[newName]) {
          newName = `${selectedPreset}_copy${counter++}`;
        }
        savePreset(newName, { ...preset });
        selectPreset(newName);
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent, presetName: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, presetName });
  };

  const handleContextMenuAction = (action: string) => {
    if (!contextMenu) return;
    const presetName = contextMenu.presetName;

    switch (action) {
      case 'update':
        if (command.trim()) {
          const preset = presets[presetName];
          if (preset) {
            savePreset(presetName, { ...preset, commands: command });
          }
        }
        break;
      case 'duplicate':
        const preset = presets[presetName];
        if (preset) {
          let newName = `${presetName}_copy`;
          let counter = 1;
          while (presets[newName]) {
            newName = `${presetName}_copy${counter++}`;
          }
          savePreset(newName, { ...preset });
        }
        break;
      case 'rename':
        setIsRenaming(presetName);
        setRenameValue(presetName);
        break;
      case 'delete':
        setShowDeletePresetDialog(presetName);
        break;
      case 'favorite':
        const p = presets[presetName];
        if (p) {
          savePreset(presetName, { ...p, isFavorite: !p.isFavorite });
        }
        break;
    }
    setContextMenu(null);
  };

  const handleFolderContextMenu = (e: React.MouseEvent, folderName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setFolderContextMenu({ x: e.clientX, y: e.clientY, folderName });
  };

  const handleFolderContextMenuAction = (action: string) => {
    if (!folderContextMenu) return;
    const folderName = folderContextMenu.folderName;

    switch (action) {
      case 'addPreset':
        handleAddPresetToFolder(folderName);
        break;
      case 'rename':
        setIsRenamingFolder(folderName);
        setRenameValue(folderName);
        break;
      case 'delete':
        setSelectedFolderToDelete(folderName);
        setShowDeleteFolderDialog(true);
        break;
    }
    setFolderContextMenu(null);
  };

  const handleFolderRenameSubmit = () => {
    if (isRenamingFolder && renameValue.trim() && renameValue !== isRenamingFolder) {
      renamePresetFolder(isRenamingFolder, renameValue.trim());
      // Update expanded folders if the renamed folder was expanded
      if (expandedFolders.has(isRenamingFolder)) {
        const next = new Set(expandedFolders);
        next.delete(isRenamingFolder);
        next.add(renameValue.trim());
        setExpandedFolders(next);
      }
    }
    setIsRenamingFolder(null);
    setRenameValue('');
  };

  const handleAddFolder = () => {
    setNewFolderName('');
    setShowAddFolderDialog(true);
  };

  const confirmAddFolder = () => {
    if (newFolderName.trim()) {
      addPresetFolder(newFolderName.trim());
      setExpandedFolders(new Set(expandedFolders).add(newFolderName.trim()));
    }
    setShowAddFolderDialog(false);
    setNewFolderName('');
  };

  const handleDeleteFolder = () => {
    if (allFolderNames.length === 0) {
      setAlertMessage('No folders to delete');
      return;
    }
    setShowSelectFolderDialog(true);
  };

  const handleSelectFolderToDelete = (folder: string) => {
    setSelectedFolderToDelete(folder);
    setShowSelectFolderDialog(false);
    setShowDeleteFolderDialog(true);
  };

  const confirmDeleteFolder = () => {
    if (selectedFolderToDelete) {
      const presetsInFolder = groupedPresets[selectedFolderToDelete] || [];
      presetsInFolder.forEach(({ name }) => movePresetToFolder(name, undefined));
      removePresetFolder(selectedFolderToDelete);
    }
    setShowDeleteFolderDialog(false);
    setSelectedFolderToDelete(null);
  };

  // Unified drag and drop handlers
  const handleDragStart = (e: React.DragEvent, itemKey: string) => {
    setDraggedItem(itemKey);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', itemKey);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverItem(null);
    setDropPosition(null);
    setDragOverFolderForMove(null);
  };

  const handleDragOver = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedItem || draggedItem === targetKey) {
      setDragOverItem(null);
      setDropPosition(null);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    // Determine if dropping before or after based on mouse position
    const position = y < height / 2 ? 'before' : 'after';

    setDragOverItem(targetKey);
    setDropPosition(position);

    // If dragging a preset over a folder, also show folder highlight for move-into
    if (draggedItem.startsWith('preset:') && targetKey.startsWith('folder:')) {
      setDragOverFolderForMove(targetKey.replace('folder:', ''));
    } else {
      setDragOverFolderForMove(null);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the element entirely
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOverItem(null);
      setDropPosition(null);
      setDragOverFolderForMove(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedItem || draggedItem === targetKey) {
      handleDragEnd();
      return;
    }

    // Check if dragging a preset into a folder (drop on folder content area)
    if (draggedItem.startsWith('preset:') && targetKey.startsWith('folder:') && dragOverFolderForMove) {
      const presetName = draggedItem.replace('preset:', '');
      const folderName = dragOverFolderForMove;
      movePresetToFolder(presetName, folderName);
      setExpandedFolders(new Set(expandedFolders).add(folderName));
      handleDragEnd();
      return;
    }

    // Reorder items
    const currentOrder = sidebarOrder.length > 0
      ? [...sidebarOrder]
      : orderedItems.map(item => `${item.type}:${item.id}`);

    // Remove dragged item from current position
    const newOrder = currentOrder.filter(key => key !== draggedItem);

    // Find target index
    let targetIndex = newOrder.indexOf(targetKey);

    // If dropping after, increment index
    if (dropPosition === 'after') {
      targetIndex += 1;
    }

    // Insert at new position
    if (targetIndex === -1) {
      newOrder.push(draggedItem);
    } else {
      newOrder.splice(targetIndex, 0, draggedItem);
    }

    reorderSidebar(newOrder);
    handleDragEnd();
  };

  // Handle drop at the very beginning (before first item)
  const handleDropAtStart = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedItem) {
      handleDragEnd();
      return;
    }

    const currentOrder = sidebarOrder.length > 0
      ? [...sidebarOrder]
      : orderedItems.map(item => `${item.type}:${item.id}`);

    // Remove dragged item and insert at beginning
    const newOrder = currentOrder.filter(key => key !== draggedItem);
    newOrder.unshift(draggedItem);

    reorderSidebar(newOrder);
    handleDragEnd();
  };

  const handleMoveToFolder = (folder: string | undefined) => {
    if (contextMenu?.presetName) {
      movePresetToFolder(contextMenu.presetName, folder);
      if (folder) {
        setExpandedFolders(new Set(expandedFolders).add(folder));
      }
    }
    setShowMoveToFolderMenu(false);
    setContextMenu(null);
  };

  const handleAddPresetToFolder = (folder: string) => {
    setShowAddPresetToFolderDialog(folder);
    setNewPresetName('');
  };

  const confirmAddPresetToFolder = () => {
    if (newPresetName.trim() && showAddPresetToFolderDialog) {
      savePreset(newPresetName.trim(), {
        commands: command || '',
        folder: showAddPresetToFolderDialog,
        isFavorite: false,
      });
      selectPreset(newPresetName.trim());
    }
    setShowAddPresetToFolderDialog(null);
    setNewPresetName('');
  };

  const renderPresetItem = (name: string, preset: typeof presets[string], indent = false, inFolder = false) => {
    const itemKey = `preset:${name}`;
    const isDragging = draggedItem === itemKey;
    const isDropTarget = dragOverItem === itemKey;

    if (isRenaming === name) {
      return (
        <div key={`preset-${name}`} className={`flex items-center gap-2 px-2 py-1 ${indent ? 'ml-4' : ''}`}>
          <DocumentIcon />
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') {
                setIsRenaming(null);
                setRenameValue('');
              }
            }}
            onBlur={handleRenameSubmit}
            autoFocus
            className="flex-1 px-1 py-0.5 text-sm rounded border border-primary-500 bg-white dark:bg-gray-700 focus:outline-none"
          />
        </div>
      );
    }

    return (
      <div
        key={`preset-${name}`}
        draggable={!inFolder}
        onDragStart={!inFolder ? (e) => handleDragStart(e, itemKey) : undefined}
        onDragEnd={!inFolder ? handleDragEnd : undefined}
        onDragOver={!inFolder ? (e) => handleDragOver(e, itemKey) : undefined}
        onDragLeave={!inFolder ? handleDragLeave : undefined}
        onDrop={!inFolder ? (e) => handleDrop(e, itemKey) : undefined}
        className={`flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
          !inFolder ? 'cursor-grab' : 'cursor-pointer'
        } ${
          selectedPreset === name ? 'bg-primary-100 dark:bg-primary-900/30' : ''
        } ${indent ? 'ml-4' : ''} ${isDragging ? 'opacity-50' : ''} ${
          isDropTarget && dropPosition === 'before' ? 'border-t-2 border-primary-500' : ''
        } ${
          isDropTarget && dropPosition === 'after' ? 'border-b-2 border-primary-500' : ''
        }`}
        onClick={() => selectPreset(name)}
        onContextMenu={(e) => handleContextMenu(e, name)}
      >
        <DocumentIcon />
        <span className="flex-1 truncate text-sm">{name}</span>
        {preset.isFavorite && <Star size={14} className="text-yellow-500 fill-yellow-500" />}
      </div>
    );
  };

  const renderFolderItem = (folder: string) => {
    const itemKey = `folder:${folder}`;
    const isDragging = draggedItem === itemKey;
    const isDropTarget = dragOverItem === itemKey;
    const items = groupedPresets[folder] || [];
    const isDropTargetForMove = dragOverFolderForMove === folder;

    // Render rename input if this folder is being renamed
    if (isRenamingFolder === folder) {
      return (
        <div key={`folder-${folder}`} className="mb-1">
          <div className="flex items-center gap-2 px-2 py-1">
            <FolderIcon />
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFolderRenameSubmit();
                if (e.key === 'Escape') {
                  setIsRenamingFolder(null);
                  setRenameValue('');
                }
              }}
              onBlur={handleFolderRenameSubmit}
              autoFocus
              className="flex-1 px-1 py-0.5 text-sm rounded border border-primary-500 bg-white dark:bg-gray-700 focus:outline-none"
            />
          </div>
        </div>
      );
    }

    return (
      <div key={`folder-${folder}`} className="mb-1">
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, itemKey)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, itemKey)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, itemKey)}
          className={`flex items-center gap-2 px-2 py-1 cursor-grab text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors ${
            isDragging ? 'opacity-50' : ''
          } ${
            isDropTarget && dropPosition === 'before' ? 'border-t-2 border-primary-500' : ''
          } ${
            isDropTarget && dropPosition === 'after' ? 'border-b-2 border-primary-500' : ''
          } ${
            isDropTargetForMove ? 'bg-primary-100 dark:bg-primary-900/30 ring-2 ring-primary-500' : ''
          }`}
          onClick={() => toggleFolder(folder)}
          onContextMenu={(e) => handleFolderContextMenu(e, folder)}
        >
          <FolderIcon />
          <span className="flex-1">{folder}</span>
          <span className="text-gray-400">({items.length})</span>
        </div>
        {expandedFolders.has(folder) && (
          <div className="ml-2">
            {items.map(({ name, preset }) => renderPresetItem(name, preset, true, true))}
          </div>
        )}
      </div>
    );
  };

  // Drop zone at the very top for dragging to first position
  const [showTopDropZone, setShowTopDropZone] = useState(false);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <h2 className="font-semibold text-sm text-gray-700 dark:text-gray-300">Presets</h2>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={handleAddPreset}
          className="p-1 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          title="Add preset"
        >
          <Plus size={16} />
        </button>
        <button
          onClick={handleDeletePreset}
          disabled={!selectedPreset}
          className="p-1 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-50"
          title="Delete preset"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={handleRenamePreset}
          disabled={!selectedPreset}
          className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-50"
          title="Rename preset"
        >
          Rename
        </button>
        <button
          onClick={handleDuplicate}
          disabled={!selectedPreset}
          className="p-1 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-50"
          title="Duplicate preset"
        >
          <Copy size={16} />
        </button>
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
        <button
          onClick={handleAddFolder}
          className="p-1 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          title="Add folder"
        >
          <FolderPlus size={16} />
        </button>
        <button
          onClick={handleDeleteFolder}
          className="p-1 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          title="Delete folder"
        >
          <FolderMinus size={16} />
        </button>
      </div>

      {/* Preset list */}
      <div className="flex-1 overflow-auto p-2">
        {/* Favorites section */}
        {Object.entries(presets).some(([_, p]) => p.isFavorite) && (
          <div className="mb-2">
            <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
              <Star size={12} className="text-yellow-500 fill-yellow-500" />
              Favorites
            </div>
            {Object.entries(presets)
              .filter(([_, p]) => p.isFavorite)
              .map(([name, preset]) => renderPresetItem(name, preset, false, true))}
          </div>
        )}

        {/* Drop zone at top */}
        {draggedItem && (
          <div
            className={`h-2 mb-1 rounded transition-colors ${showTopDropZone ? 'bg-primary-200 dark:bg-primary-800' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setShowTopDropZone(true);
            }}
            onDragLeave={() => setShowTopDropZone(false)}
            onDrop={(e) => {
              setShowTopDropZone(false);
              handleDropAtStart(e);
            }}
          />
        )}

        {/* Unified ordered list */}
        {orderedItems.map(item => {
          if (item.type === 'preset') {
            const preset = presets[item.id];
            if (!preset || preset.folder) return null; // Skip if in folder or doesn't exist
            if (preset.isFavorite) return null; // Skip favorites (shown separately)
            return renderPresetItem(item.id, preset);
          } else {
            return renderFolderItem(item.id);
          }
        })}

        {Object.keys(presets).length === 0 && allFolderNames.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 p-2 text-center">
            No presets yet. Click + to add one.
          </p>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => handleContextMenuAction('update')}
            disabled={!command.trim()}
            className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Update with Current Command
          </button>
          <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          <button
            onClick={() => handleContextMenuAction('favorite')}
            className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {presets[contextMenu.presetName]?.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
          </button>
          <button
            onClick={() => handleContextMenuAction('duplicate')}
            className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Duplicate
          </button>
          <button
            onClick={() => handleContextMenuAction('rename')}
            className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Rename
          </button>
          <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          {/* Move to Folder submenu */}
          <div className="relative">
            <button
              onClick={() => setShowMoveToFolderMenu(!showMoveToFolderMenu)}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between"
            >
              Move to Folder
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {showMoveToFolderMenu && (
              <div className="absolute left-full top-0 ml-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[120px]">
                <button
                  onClick={() => handleMoveToFolder(undefined)}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  (Root)
                </button>
                {allFolderNames.map((folder) => (
                  <button
                    key={folder}
                    onClick={() => handleMoveToFolder(folder)}
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    {folder}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          <button
            onClick={() => handleContextMenuAction('delete')}
            className="w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Delete
          </button>
        </div>
      )}

      {/* Folder Context Menu */}
      {folderContextMenu && (
        <div
          ref={folderContextMenuRef}
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[150px]"
          style={{ left: folderContextMenu.x, top: folderContextMenu.y }}
        >
          <button
            onClick={() => handleFolderContextMenuAction('addPreset')}
            className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Add Preset
          </button>
          <button
            onClick={() => handleFolderContextMenuAction('rename')}
            className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Rename Folder
          </button>
          <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          <button
            onClick={() => handleFolderContextMenuAction('delete')}
            className="w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Delete Folder
          </button>
        </div>
      )}

      {/* Add Preset Dialog */}
      {showAddPresetDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-80">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Add Preset</h3>
            <input
              type="text"
              placeholder="Enter preset name..."
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmAddPreset()}
              autoFocus
              className="w-full px-3 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 mb-3"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowAddPresetDialog(false);
                  setNewPresetName('');
                }}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                Cancel
              </button>
              <button
                onClick={confirmAddPreset}
                disabled={!newPresetName.trim()}
                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Preset Dialog */}
      {showDeletePresetDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-80">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Delete Preset</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Are you sure you want to delete "{showDeletePresetDialog}"?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeletePresetDialog(null)}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeletePreset}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Folder Dialog */}
      {showAddFolderDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-80">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Add Folder</h3>
            <input
              type="text"
              placeholder="Folder name..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmAddFolder()}
              autoFocus
              className="w-full px-3 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 mb-3"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Drag and drop presets into this folder after creation.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowAddFolderDialog(false);
                  setNewFolderName('');
                }}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                Cancel
              </button>
              <button
                onClick={confirmAddFolder}
                disabled={!newFolderName.trim()}
                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Preset to Folder Dialog */}
      {showAddPresetToFolderDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-80">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
              Add Preset to "{showAddPresetToFolderDialog}"
            </h3>
            <input
              type="text"
              placeholder="Preset name..."
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmAddPresetToFolder()}
              autoFocus
              className="w-full px-3 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 mb-3"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowAddPresetToFolderDialog(null);
                  setNewPresetName('');
                }}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                Cancel
              </button>
              <button
                onClick={confirmAddPresetToFolder}
                disabled={!newPresetName.trim()}
                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Select Folder to Delete Dialog */}
      {showSelectFolderDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-80">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Select Folder to Delete</h3>
            <div className="max-h-48 overflow-auto mb-3">
              {allFolderNames.map((folder) => {
                const items = groupedPresets[folder] || [];
                return (
                  <button
                    key={folder}
                    onClick={() => handleSelectFolderToDelete(folder)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  >
                    {folder} ({items.length} preset{items.length !== 1 ? 's' : ''})
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowSelectFolderDialog(false)}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Folder Dialog */}
      {showDeleteFolderDialog && selectedFolderToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-80">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Delete Folder</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {(groupedPresets[selectedFolderToDelete]?.length || 0) > 0
                ? `Delete folder "${selectedFolderToDelete}" and move ${groupedPresets[selectedFolderToDelete]?.length} preset(s) to root?`
                : `Delete empty folder "${selectedFolderToDelete}"?`}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowDeleteFolderDialog(false);
                  setSelectedFolderToDelete(null);
                }}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteFolder}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert Dialog */}
      {alertMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-80">
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">{alertMessage}</p>
            <div className="flex justify-end">
              <button
                onClick={() => setAlertMessage(null)}
                autoFocus
                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
