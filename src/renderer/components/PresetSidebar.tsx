import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store/appStore';

const UploadIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);

const DownloadIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const FolderIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);

const StarIcon = ({ filled }: { filled: boolean }) => (
  <svg className={`w-4 h-4 ${filled ? 'text-yellow-500 fill-current' : 'text-gray-400'}`} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
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
  presetName?: string;
  folderName?: string;
  isEmptyArea?: boolean;
}

export function PresetSidebar() {
  const { presets, selectedPreset, selectPreset, command, savePreset, deletePreset } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [isRenaming, setIsRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenamingFolder, setIsRenamingFolder] = useState<string | null>(null);
  const [renameFolderValue, setRenameFolderValue] = useState('');
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [showAddFolderDialog, setShowAddFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Dialog states
  const [showDeletePresetDialog, setShowDeletePresetDialog] = useState<string | null>(null);
  const [showDeleteFolderDialog, setShowDeleteFolderDialog] = useState<string | null>(null);
  const [showNewFolderForMoveDialog, setShowNewFolderForMoveDialog] = useState(false);
  const [newFolderForMove, setNewFolderForMove] = useState('');
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

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

  // Get all folder names
  const folderNames = Object.keys(groupedPresets).filter(f => f !== '');

  // Filter by search
  const filteredPresets = searchTerm
    ? Object.entries(presets)
        .filter(([name]) => name.toLowerCase().includes(searchTerm.toLowerCase()))
        .map(([name, preset]) => ({ name, preset }))
    : null;

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreatePreset = () => {
    if (newPresetName.trim() && command.trim()) {
      savePreset(newPresetName.trim(), {
        commands: command,
        isFavorite: false,
      });
      setNewPresetName('');
      setIsCreating(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, presetName: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, presetName });
  };

  const handleDuplicate = () => {
    if (!contextMenu) return;
    const preset = presets[contextMenu.presetName];
    if (preset) {
      let newName = `${contextMenu.presetName}_copy`;
      let counter = 1;
      while (presets[newName]) {
        newName = `${contextMenu.presetName}_copy${counter++}`;
      }
      savePreset(newName, { ...preset });
    }
    setContextMenu(null);
  };

  const handleRename = () => {
    if (!contextMenu) return;
    setIsRenaming(contextMenu.presetName);
    setRenameValue(contextMenu.presetName);
    setContextMenu(null);
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

  const handleDelete = () => {
    if (!contextMenu?.presetName) return;
    setShowDeletePresetDialog(contextMenu.presetName);
    setContextMenu(null);
  };

  const confirmDeletePreset = () => {
    if (showDeletePresetDialog) {
      deletePreset(showDeletePresetDialog);
    }
    setShowDeletePresetDialog(null);
  };

  const handleToggleFavorite = () => {
    if (!contextMenu) return;
    const preset = presets[contextMenu.presetName];
    if (preset) {
      savePreset(contextMenu.presetName, { ...preset, isFavorite: !preset.isFavorite });
    }
    setContextMenu(null);
  };

  const handleUpdatePreset = () => {
    if (!contextMenu || !command.trim()) return;
    const preset = presets[contextMenu.presetName];
    if (preset) {
      savePreset(contextMenu.presetName, { ...preset, commands: command });
    }
    setContextMenu(null);
  };

  const handleExportPreset = async () => {
    if (!contextMenu) return;
    try {
      const exportData = await window.api.presets.exportPresets([contextMenu.presetName]);
      // Copy to clipboard
      await navigator.clipboard.writeText(exportData);
      setAlertMessage('Preset exported to clipboard!');
    } catch (error) {
      console.error('Failed to export preset:', error);
      setAlertMessage('Failed to export preset');
    }
    setContextMenu(null);
  };

  const handleExportAllPresets = async () => {
    try {
      const allNames = Object.keys(presets);
      if (allNames.length === 0) {
        setAlertMessage('No presets to export');
        return;
      }
      const exportData = await window.api.presets.exportPresets(allNames);
      // Save to file
      const filePath = await window.api.csv.showSaveDialog('presets_export.txt');
      if (filePath) {
        await window.api.file.writeText(filePath, exportData);
        setAlertMessage(`Exported ${allNames.length} preset(s) to file`);
      }
    } catch (error) {
      console.error('Failed to export presets:', error);
      setAlertMessage('Failed to export presets');
    }
  };

  const handleImportPresets = async () => {
    try {
      // Try to read from clipboard first
      const clipboardText = await navigator.clipboard.readText();
      if (clipboardText.trim()) {
        const importedNames = await window.api.presets.importPresets(clipboardText);
        if (importedNames.length > 0) {
          // Reload presets
          const newPresets = await window.api.presets.getAll();
          useAppStore.setState({ presets: newPresets });
          setAlertMessage(`Imported ${importedNames.length} preset(s): ${importedNames.join(', ')}`);
          return;
        }
      }
    } catch {
      // Clipboard might not have valid data, try file
    }

    // Try to load from file
    const filePath = await window.api.csv.showOpenDialog();
    if (filePath) {
      try {
        const fileContent = await window.api.file.readText(filePath);
        const importedNames = await window.api.presets.importPresets(fileContent);
        // Reload presets
        const newPresets = await window.api.presets.getAll();
        useAppStore.setState({ presets: newPresets });
        setAlertMessage(`Imported ${importedNames.length} preset(s): ${importedNames.join(', ')}`);
      } catch (error) {
        console.error('Failed to import presets:', error);
        setAlertMessage('Failed to import presets. Invalid format.');
      }
    }
  };

  // Folder management handlers
  const handleAddFolder = () => {
    if (newFolderName.trim() && !folderNames.includes(newFolderName.trim())) {
      // Create a placeholder preset in the folder to establish it
      // (folders exist implicitly through presets)
      setShowAddFolderDialog(false);
      setNewFolderName('');
      // For now, just close the dialog - folders are created when moving presets
      setAlertMessage('Folder will be created when you move a preset into it, or create a new preset in it.');
    }
  };

  const handleFolderContextMenu = (e: React.MouseEvent, folderName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, folderName });
  };

  const handleEmptyAreaContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, isEmptyArea: true });
  };

  const handleRenameFolder = () => {
    if (!contextMenu?.folderName) return;
    setIsRenamingFolder(contextMenu.folderName);
    setRenameFolderValue(contextMenu.folderName);
    setContextMenu(null);
  };

  const handleRenameFolderSubmit = () => {
    if (isRenamingFolder && renameFolderValue.trim() && renameFolderValue !== isRenamingFolder) {
      // Update all presets in the folder
      const presetsInFolder = groupedPresets[isRenamingFolder] || [];
      presetsInFolder.forEach(({ name, preset }) => {
        savePreset(name, { ...preset, folder: renameFolderValue.trim() });
      });
    }
    setIsRenamingFolder(null);
    setRenameFolderValue('');
  };

  const handleDeleteFolder = () => {
    if (!contextMenu?.folderName) return;
    setShowDeleteFolderDialog(contextMenu.folderName);
    setContextMenu(null);
  };

  const confirmDeleteFolder = () => {
    if (showDeleteFolderDialog) {
      const presetsInFolder = groupedPresets[showDeleteFolderDialog] || [];
      presetsInFolder.forEach(({ name, preset }) => {
        savePreset(name, { ...preset, folder: undefined });
      });
    }
    setShowDeleteFolderDialog(null);
  };

  const handleMoveToFolder = (targetFolder: string | undefined) => {
    if (!contextMenu?.presetName) return;
    const preset = presets[contextMenu.presetName];
    if (preset) {
      savePreset(contextMenu.presetName, { ...preset, folder: targetFolder });
    }
    setContextMenu(null);
    setShowMoveMenu(false);
  };

  const confirmNewFolderForMove = () => {
    if (newFolderForMove.trim() && contextMenu?.presetName) {
      handleMoveToFolder(newFolderForMove.trim());
    }
    setShowNewFolderForMoveDialog(false);
    setNewFolderForMove('');
  };

  const renderPresetItem = (name: string, preset: typeof presets[string]) => {
    if (isRenaming === name) {
      return (
        <div key={name} className="flex items-center gap-2 px-2 py-1.5">
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
        key={name}
        className={`preset-item ${selectedPreset === name ? 'selected' : ''}`}
        onClick={() => selectPreset(name)}
        onContextMenu={(e) => handleContextMenu(e, name)}
      >
        <DocumentIcon />
        <span className="flex-1 truncate text-sm">{name}</span>
        {preset.isFavorite && <StarIcon filled />}
      </div>
    );
  };

  return (
    <div className="w-64 flex flex-col bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-sm text-gray-700 dark:text-gray-300">Presets</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={handleImportPresets}
              className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded"
              title="Import presets"
            >
              <UploadIcon />
            </button>
            <button
              onClick={handleExportAllPresets}
              disabled={Object.keys(presets).length === 0}
              className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded disabled:opacity-50"
              title="Export all presets"
            >
              <DownloadIcon />
            </button>
          </div>
        </div>
        <input
          type="text"
          placeholder="Search presets..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Preset list */}
      <div className="flex-1 overflow-auto p-2" onContextMenu={handleEmptyAreaContextMenu}>
        {filteredPresets ? (
          // Search results
          <div className="space-y-1">
            {filteredPresets.map(({ name, preset }) => renderPresetItem(name, preset))}
            {filteredPresets.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 p-2">No presets found</p>
            )}
          </div>
        ) : (
          // Grouped view
          <>
            {/* Favorites */}
            {Object.entries(presets).some(([_, p]) => p.isFavorite) && (
              <div className="mb-3">
                <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  <StarIcon filled />
                  Favorites
                </div>
                <div className="space-y-1">
                  {Object.entries(presets)
                    .filter(([_, p]) => p.isFavorite)
                    .map(([name, preset]) => renderPresetItem(name, preset))}
                </div>
              </div>
            )}

            {/* Root level presets */}
            {groupedPresets[''] && (
              <div className="space-y-1 mb-3">
                {groupedPresets['']
                  .filter(({ preset }) => !preset.isFavorite)
                  .map(({ name, preset }) => renderPresetItem(name, preset))}
              </div>
            )}

            {/* Folders */}
            {Object.entries(groupedPresets)
              .filter(([folder]) => folder !== '')
              .map(([folder, items]) => (
                <div key={folder} className="mb-3">
                  {isRenamingFolder === folder ? (
                    <div className="flex items-center gap-2 px-2 py-1">
                      <FolderIcon />
                      <input
                        type="text"
                        value={renameFolderValue}
                        onChange={(e) => setRenameFolderValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameFolderSubmit();
                          if (e.key === 'Escape') {
                            setIsRenamingFolder(null);
                            setRenameFolderValue('');
                          }
                        }}
                        onBlur={handleRenameFolderSubmit}
                        autoFocus
                        className="flex-1 px-1 py-0.5 text-xs rounded border border-primary-500 bg-white dark:bg-gray-700 focus:outline-none"
                      />
                    </div>
                  ) : (
                    <div
                      className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 cursor-context-menu hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                      onContextMenu={(e) => handleFolderContextMenu(e, folder)}
                    >
                      <FolderIcon />
                      {folder}
                      <span className="text-xs text-gray-400">({items.length})</span>
                    </div>
                  )}
                  <div className="space-y-1 ml-2">
                    {items.map(({ name, preset }) => renderPresetItem(name, preset))}
                  </div>
                </div>
              ))}

            {Object.keys(presets).length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 p-2">No presets yet</p>
            )}
          </>
        )}
      </div>

      {/* New preset */}
      <div className="p-2 border-t border-gray-200 dark:border-gray-700">
        {isCreating ? (
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Preset name..."
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreatePreset()}
              autoFocus
              className="w-full px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreatePreset}
                disabled={!newPresetName.trim() || !command.trim()}
                className="flex-1 px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setNewPresetName('');
                }}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsCreating(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <PlusIcon />
            New Preset
          </button>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {/* Preset context menu */}
          {contextMenu.presetName && (
            <>
              <button
                onClick={handleUpdatePreset}
                disabled={!command.trim()}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Update with Current Command
              </button>
              <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
              <button
                onClick={handleToggleFavorite}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {presets[contextMenu.presetName]?.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
              </button>
              <button
                onClick={handleDuplicate}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Duplicate
              </button>
              <button
                onClick={handleRename}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Rename
              </button>
              <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
              {/* Move to folder submenu */}
              <div className="relative">
                <button
                  onClick={() => setShowMoveMenu(!showMoveMenu)}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between"
                >
                  Move to Folder
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                {showMoveMenu && (
                  <div className="absolute left-full top-0 ml-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[120px]">
                    <button
                      onClick={() => handleMoveToFolder(undefined)}
                      className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      (Root)
                    </button>
                    {folderNames.map((folder) => (
                      <button
                        key={folder}
                        onClick={() => handleMoveToFolder(folder)}
                        className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        {folder}
                      </button>
                    ))}
                    <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                    <button
                      onClick={() => {
                        setNewFolderForMove('');
                        setShowNewFolderForMoveDialog(true);
                      }}
                      className="w-full text-left px-3 py-1.5 text-sm text-primary-600 dark:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      + New Folder...
                    </button>
                  </div>
                )}
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
              <button
                onClick={handleExportPreset}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Export to Clipboard
              </button>
              <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
              <button
                onClick={handleDelete}
                className="w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Delete
              </button>
            </>
          )}

          {/* Folder context menu */}
          {contextMenu.folderName && (
            <>
              <button
                onClick={handleRenameFolder}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Rename Folder
              </button>
              <button
                onClick={handleDeleteFolder}
                className="w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Delete Folder
              </button>
            </>
          )}

          {/* Empty area context menu */}
          {contextMenu.isEmptyArea && (
            <>
              <button
                onClick={() => {
                  setIsCreating(true);
                  setContextMenu(null);
                }}
                disabled={!command.trim()}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                New Preset
              </button>
              <button
                onClick={handleImportPresets}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Import Presets
              </button>
            </>
          )}
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

      {/* Delete Folder Dialog */}
      {showDeleteFolderDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-80">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Delete Folder</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Delete folder "{showDeleteFolderDialog}" and move {groupedPresets[showDeleteFolderDialog]?.length || 0} preset(s) to root?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteFolderDialog(null)}
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

      {/* New Folder for Move Dialog */}
      {showNewFolderForMoveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-80">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">New Folder</h3>
            <input
              type="text"
              placeholder="Enter folder name..."
              value={newFolderForMove}
              onChange={(e) => setNewFolderForMove(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmNewFolderForMove()}
              autoFocus
              className="w-full px-3 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 mb-3"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowNewFolderForMoveDialog(false);
                  setNewFolderForMove('');
                }}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                Cancel
              </button>
              <button
                onClick={confirmNewFolderForMove}
                disabled={!newFolderForMove.trim()}
                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
              >
                Create & Move
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
