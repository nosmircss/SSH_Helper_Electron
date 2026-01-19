import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import type { ExecutionStatus } from '../../shared/models';

const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const PlayIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
  </svg>
);

const GripIcon = () => (
  <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
  </svg>
);

const statusConfig: Record<ExecutionStatus, { label: string; className: string }> = {
  idle: { label: 'Idle', className: 'status-idle' },
  connecting: { label: 'Connecting...', className: 'status-connecting' },
  running: { label: 'Running...', className: 'status-running' },
  success: { label: 'Success', className: 'status-success' },
  error: { label: 'Error', className: 'status-error' },
  cancelled: { label: 'Cancelled', className: 'status-idle' },
};

interface ContextMenuState {
  x: number;
  y: number;
  type: 'column' | 'row' | 'empty';
  column?: string;
  hostId?: string;
}

interface DragState {
  column: string;
  startX: number;
}

export function HostGrid() {
  const {
    hosts,
    columns,
    selectedHostIds,
    selectHost,
    selectAllHosts,
    addHost,
    removeHost,
    updateHost,
    updateHostVariable,
    runCommand,
    command,
    isExecuting,
    reorderColumns,
  } = useAppStore();

  const [newHostIp, setNewHostIp] = useState('');
  const [editingCell, setEditingCell] = useState<{ hostId: string; column: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showAddColumnDialog, setShowAddColumnDialog] = useState(false);
  const [showRenameColumnDialog, setShowRenameColumnDialog] = useState<string | null>(null);
  const [showDeleteColumnDialog, setShowDeleteColumnDialog] = useState<string | null>(null);
  const [showAddHostDialog, setShowAddHostDialog] = useState(false);
  const [addHostIp, setAddHostIp] = useState('');
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [newColumnName, setNewColumnName] = useState('');
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [contextMenu]);

  const handleAddHost = () => {
    if (newHostIp.trim()) {
      addHost(newHostIp.trim());
      setNewHostIp('');
    }
  };

  const startEditing = (hostId: string, column: string, value: string) => {
    setEditingCell({ hostId, column });
    setEditValue(value);
  };

  const finishEditing = () => {
    if (editingCell) {
      const { hostId, column } = editingCell;
      if (column === 'Host_IP') {
        updateHost(hostId, { ipAddress: editValue, variables: { ...hosts.find(h => h.id === hostId)?.variables, Host_IP: editValue } });
      } else {
        const host = hosts.find(h => h.id === hostId);
        if (host) {
          updateHost(hostId, { variables: { ...host.variables, [column]: editValue } });
        }
      }
    }
    setEditingCell(null);
    setEditValue('');
  };

  const handleColumnContextMenu = (e: React.MouseEvent, column: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'column', column });
  };

  const handleRowContextMenu = (e: React.MouseEvent, hostId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'row', hostId });
  };

  const handleEmptyAreaContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'empty' });
  };

  const handleAddHostFromContextMenu = () => {
    setContextMenu(null);
    setAddHostIp('');
    setShowAddHostDialog(true);
  };

  const confirmAddHost = () => {
    if (addHostIp.trim()) {
      addHost(addHostIp.trim());
    }
    setShowAddHostDialog(false);
    setAddHostIp('');
  };

  const handleAddColumn = () => {
    if (newColumnName.trim() && !columns.includes(newColumnName.trim())) {
      // Add column by updating first host (this will add column to store)
      if (hosts.length > 0) {
        updateHostVariable(hosts[0].id, newColumnName.trim(), '');
      } else {
        // If no hosts, we need to add column to columns array directly
        // This requires a new store action
        useAppStore.getState().addColumn(newColumnName.trim());
      }
      setNewColumnName('');
      setShowAddColumnDialog(false);
    }
  };

  const handleRenameColumn = () => {
    if (showRenameColumnDialog && newColumnName.trim() && newColumnName !== showRenameColumnDialog) {
      // Rename column in all hosts
      hosts.forEach(host => {
        const value = host.variables[showRenameColumnDialog] || '';
        const newVars = { ...host.variables };
        delete newVars[showRenameColumnDialog];
        newVars[newColumnName.trim()] = value;
        updateHost(host.id, { variables: newVars });
      });
      // Update columns array
      useAppStore.getState().renameColumn(showRenameColumnDialog, newColumnName.trim());
      setNewColumnName('');
      setShowRenameColumnDialog(null);
    }
    setContextMenu(null);
  };

  const handleDeleteColumn = (column: string) => {
    // Close context menu first
    setContextMenu(null);

    if (column === 'Host_IP') {
      setAlertMessage('Cannot delete Host_IP column');
      return;
    }

    // Show delete confirmation dialog instead of native confirm()
    setShowDeleteColumnDialog(column);
  };

  const confirmDeleteColumn = () => {
    const column = showDeleteColumnDialog;
    if (!column) return;

    // Clear any editing state for the deleted column to prevent stale references
    if (editingCell?.column === column) {
      setEditingCell(null);
      setEditValue('');
    }
    // Remove from all hosts
    hosts.forEach(host => {
      const newVars = { ...host.variables };
      delete newVars[column];
      updateHost(host.id, { variables: newVars });
    });
    // Remove from columns array
    useAppStore.getState().removeColumn(column);
    setShowDeleteColumnDialog(null);
  };

  const handleExecuteRow = async (hostId: string) => {
    if (!command.trim() || isExecuting) return;
    const host = hosts.find(h => h.id === hostId);
    if (host) {
      // Select only this host and run
      selectAllHosts(false);
      selectHost(hostId, true);
      await runCommand();
    }
    setContextMenu(null);
  };

  // Column drag and drop handlers
  const handleDragStart = (e: React.DragEvent, column: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', column);
    setDragState({ column, startX: e.clientX });
  };

  const handleDragOver = (e: React.DragEvent, column: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragState && dragState.column !== column) {
      setDragOverColumn(column);
    }
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, targetColumn: string) => {
    e.preventDefault();
    const sourceColumn = e.dataTransfer.getData('text/plain');

    if (sourceColumn && sourceColumn !== targetColumn) {
      const newColumns = [...columns];
      const sourceIndex = newColumns.indexOf(sourceColumn);
      const targetIndex = newColumns.indexOf(targetColumn);

      if (sourceIndex !== -1 && targetIndex !== -1) {
        // Remove from source position
        newColumns.splice(sourceIndex, 1);
        // Insert at target position
        newColumns.splice(targetIndex, 0, sourceColumn);
        reorderColumns(newColumns);
      }
    }

    setDragState(null);
    setDragOverColumn(null);
  };

  const handleDragEnd = () => {
    setDragState(null);
    setDragOverColumn(null);
  };

  const allSelected = hosts.length > 0 && selectedHostIds.size === hosts.length;
  const someSelected = selectedHostIds.size > 0 && selectedHostIds.size < hosts.length;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Hosts</span>
          <button
            onClick={() => setShowAddColumnDialog(true)}
            className="px-2 py-0.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            title="Add column"
          >
            + Column
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Add host..."
            value={newHostIp}
            onChange={(e) => setNewHostIp(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddHost()}
            className="w-48 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <button
            onClick={handleAddHost}
            disabled={!newHostIp.trim()}
            className="p-1 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-50 rounded"
            title="Add host"
          >
            <PlusIcon />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto" onContextMenu={handleEmptyAreaContextMenu}>
        <table className="data-grid">
          <thead>
            <tr>
              <th className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={(e) => selectAllHosts(e.target.checked)}
                  className="rounded"
                />
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  draggable
                  onDragStart={(e) => handleDragStart(e, col)}
                  onDragOver={(e) => handleDragOver(e, col)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, col)}
                  onDragEnd={handleDragEnd}
                  onContextMenu={(e) => handleColumnContextMenu(e, col)}
                  className={`cursor-grab select-none ${dragOverColumn === col ? 'bg-primary-100 dark:bg-primary-900/30' : ''} ${dragState?.column === col ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center gap-1">
                    <GripIcon />
                    <span>{col}</span>
                  </div>
                </th>
              ))}
              <th className="w-24">Status</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {hosts.map((host) => (
              <tr
                key={host.id}
                className={selectedHostIds.has(host.id) ? 'selected' : ''}
                onContextMenu={(e) => handleRowContextMenu(e, host.id)}
              >
                <td>
                  <input
                    type="checkbox"
                    checked={selectedHostIds.has(host.id)}
                    onChange={(e) => selectHost(host.id, e.target.checked)}
                    className="rounded"
                  />
                </td>
                {columns.map((col) => (
                  <td
                    key={`${host.id}-${col}`}
                    onDoubleClick={() => startEditing(host.id, col, host.variables[col] || '')}
                  >
                    {editingCell?.hostId === host.id && editingCell?.column === col ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={finishEditing}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') finishEditing();
                          if (e.key === 'Escape') {
                            setEditingCell(null);
                            setEditValue('');
                          }
                        }}
                        autoFocus
                        className="w-full px-1 py-0.5 border border-primary-500 rounded focus:outline-none"
                      />
                    ) : (
                      <span className="block truncate">{host.variables[col] || ''}</span>
                    )}
                  </td>
                ))}
                <td>
                  <span className={`status-badge ${statusConfig[host.status].className}`}>
                    {statusConfig[host.status].label}
                  </span>
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleExecuteRow(host.id)}
                      disabled={!command.trim() || isExecuting}
                      className="p-1 text-gray-400 hover:text-primary-500 rounded disabled:opacity-50"
                      title="Execute on this host"
                    >
                      <PlayIcon />
                    </button>
                    <button
                      onClick={() => removeHost(host.id)}
                      className="p-1 text-gray-400 hover:text-red-500 rounded"
                      title="Remove host"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {hosts.length === 0 && (
              <tr>
                <td colSpan={columns.length + 3} className="text-center text-gray-500 dark:text-gray-400 py-8">
                  No hosts yet. Add a host above or import a CSV file.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.type === 'column' && contextMenu.column && (
            <>
              <button
                onClick={handleAddHostFromContextMenu}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Add Host
              </button>
              <button
                onClick={() => {
                  setShowAddColumnDialog(true);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Add Column
              </button>
              <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
              <button
                onClick={() => {
                  setShowRenameColumnDialog(contextMenu.column!);
                  setNewColumnName(contextMenu.column!);
                  setContextMenu(null);
                }}
                disabled={contextMenu.column === 'Host_IP'}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Rename Column
              </button>
              <button
                onClick={() => handleDeleteColumn(contextMenu.column!)}
                disabled={contextMenu.column === 'Host_IP'}
                className="w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Delete Column
              </button>
            </>
          )}
          {contextMenu.type === 'row' && contextMenu.hostId && (
            <>
              <button
                onClick={handleAddHostFromContextMenu}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Add Host
              </button>
              <button
                onClick={() => handleExecuteRow(contextMenu.hostId!)}
                disabled={!command.trim() || isExecuting}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Execute on This Host
              </button>
              <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
              <button
                onClick={() => {
                  removeHost(contextMenu.hostId!);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Delete Host
              </button>
            </>
          )}
          {contextMenu.type === 'empty' && (
            <>
              <button
                onClick={handleAddHostFromContextMenu}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Add Host
              </button>
              <button
                onClick={() => {
                  setShowAddColumnDialog(true);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Add Column
              </button>
            </>
          )}
        </div>
      )}

      {/* Add Column Dialog */}
      {showAddColumnDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-80">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Add Column</h3>
            <input
              type="text"
              placeholder="Column name..."
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddColumn()}
              autoFocus
              className="w-full px-3 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 mb-3"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowAddColumnDialog(false);
                  setNewColumnName('');
                }}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleAddColumn}
                disabled={!newColumnName.trim() || columns.includes(newColumnName.trim())}
                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Column Dialog */}
      {showRenameColumnDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-80">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
              Rename Column: {showRenameColumnDialog}
            </h3>
            <input
              type="text"
              placeholder="New column name..."
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRenameColumn()}
              autoFocus
              className="w-full px-3 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 mb-3"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowRenameColumnDialog(null);
                  setNewColumnName('');
                }}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameColumn}
                disabled={!newColumnName.trim() || newColumnName === showRenameColumnDialog}
                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Column Confirmation Dialog */}
      {showDeleteColumnDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-80">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
              Delete Column
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Are you sure you want to delete the column "{showDeleteColumnDialog}"?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteColumnDialog(null)}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteColumn}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Host Dialog (from context menu) */}
      {showAddHostDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-80">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Add Host</h3>
            <input
              type="text"
              placeholder="Enter host IP address..."
              value={addHostIp}
              onChange={(e) => setAddHostIp(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmAddHost()}
              autoFocus
              className="w-full px-3 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 mb-3"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowAddHostDialog(false);
                  setAddHostIp('');
                }}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                Cancel
              </button>
              <button
                onClick={confirmAddHost}
                disabled={!addHostIp.trim()}
                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
              >
                Add
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
