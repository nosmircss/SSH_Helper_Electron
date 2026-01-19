import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { Clock, Trash2, Download } from 'lucide-react';
import type { OutputEntry } from '../../shared/models';

interface HistoryEntry {
  id: string;
  sessionId: string;
  timestamp: Date;
  presetName: string;
  output: string;
  entries: OutputEntry[];  // Full entries with type info for colored display
  hostCount: number;
  hasErrors: boolean;
}

interface OutputHistoryProps {
  onSelectEntry?: (output: string, entries?: OutputEntry[]) => void;
  onClearHistory?: () => void;
}

export function OutputHistory({ onSelectEntry, onClearHistory }: OutputHistoryProps) {
  const { output, clearOutput, currentSessionId, lastSelectedSessionId, setLastSelectedSessionId } = useAppStore();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: HistoryEntry } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const prevSessionIdRef = useRef<string | null>(null);

  // Use lastSelectedSessionId from store as the selected ID
  const selectedId = lastSelectedSessionId;
  const setSelectedId = (id: string | null) => {
    setLastSelectedSessionId(id);
  };

  // Close context menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-select the current session when execution starts
  useEffect(() => {
    if (currentSessionId && currentSessionId !== prevSessionIdRef.current) {
      setSelectedId(currentSessionId);
      prevSessionIdRef.current = currentSessionId;
    }
  }, [currentSessionId]);

  // Find the selected entry and get its combined output and entries for the callback
  const selectedEntryData = useMemo(() => {
    if (!selectedId) return null;
    // Build the combined output for the selected session from raw output entries
    const sessionEntries = output.filter(e => e.sessionId === selectedId);
    if (sessionEntries.length === 0) return null;
    return {
      output: sessionEntries.map(e => e.text).join('\n'),
      entries: sessionEntries
    };
  }, [selectedId, output]);

  // Call onSelectEntry when the user manually selects a history entry
  // We track this with a flag that's set only on click, not on automatic selection changes
  const userClickedRef = useRef(false);
  const prevSelectedEntry = useRef<string | null>(null);
  useEffect(() => {
    // Only update historyOutput if the user explicitly clicked a history entry
    // Don't update during live execution or when session auto-selects
    if (currentSessionId) {
      userClickedRef.current = false;
      return;
    }
    // Only call onSelectEntry if user clicked, not on automatic changes
    if (userClickedRef.current && selectedEntryData !== null) {
      onSelectEntry?.(selectedEntryData.output, selectedEntryData.entries);
      userClickedRef.current = false;
    }
    prevSelectedEntry.current = selectedEntryData?.output ?? null;
  }, [selectedEntryData, onSelectEntry, currentSessionId]);

  // Force populate output on initial mount when there's a restored selection
  // This handles the case where the app reloads with a previously selected history entry
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (!hasInitialized.current && selectedId && output.length > 0) {
      // Find the output for this session directly from the output array
      const sessionEntries = output.filter(e => e.sessionId === selectedId);
      if (sessionEntries.length > 0) {
        const combinedOutput = sessionEntries.map(e => e.text).join('\n');
        onSelectEntry?.(combinedOutput, sessionEntries);
      }
      hasInitialized.current = true;
    }
  }, [selectedId, output, onSelectEntry]);

  const formatTime = (date: Date) => {
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Group output entries into execution sessions by sessionId
  const historyEntries = useMemo(() => {
    const entries: HistoryEntry[] = [];
    const groups: Map<string, typeof output> = new Map();

    // Group by sessionId (each run button press creates a unique session)
    for (const entry of output) {
      const sessionId = entry.sessionId;
      if (!groups.has(sessionId)) {
        groups.set(sessionId, []);
      }
      groups.get(sessionId)!.push(entry);
    }

    // Convert groups to history entries
    for (const [sessionId, groupOutput] of groups) {
      const firstEntry = groupOutput[0];
      const timestamp = new Date(firstEntry.timestamp);
      const hasErrors = groupOutput.some(e => e.type === 'Error');
      const uniqueHosts = new Set(groupOutput.filter(e => e.hostId).map(e => e.hostId));

      // Combine all output text for this session
      const combinedOutput = groupOutput.map(e => e.text).join('\n');

      entries.push({
        id: sessionId,
        sessionId,
        timestamp,
        presetName: formatTime(timestamp), // Use formatted timestamp as display name
        output: combinedOutput,
        entries: groupOutput,  // Include full entries with type info
        hostCount: uniqueHosts.size,
        hasErrors,
      });
    }

    // Sort by timestamp, most recent first
    return entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [output]);

  const handleEntryClick = (entry: HistoryEntry) => {
    userClickedRef.current = true;
    setSelectedId(entry.id);
    onSelectEntry?.(entry.output, entry.entries);
  };

  const handleContextMenu = (e: React.MouseEvent, entry: HistoryEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  };

  const handleSaveEntry = async (entry: HistoryEntry) => {
    const defaultName = `SSH_Session_${entry.timestamp.toISOString().replace(/[:.]/g, '-')}.txt`;
    const filePath = await window.api.csv.showSaveDialog(defaultName);
    if (filePath) {
      try {
        await window.api.file.writeText(filePath, entry.output);
      } catch (error) {
        console.error('Failed to save entry:', error);
      }
    }
    setContextMenu(null);
  };

  const handleDeleteEntry = (entry: HistoryEntry) => {
    // Filter out all output entries that belong to this session
    useAppStore.setState((state) => ({
      output: state.output.filter((e) => e.sessionId !== entry.sessionId),
    }));

    // Persist the updated history
    useAppStore.getState().saveOutputHistory();

    if (selectedId === entry.id) {
      setSelectedId(null);
    }
    setContextMenu(null);
  };

  const handleClearAll = () => {
    clearOutput();
    onClearHistory?.();
  };

  const handleSaveAllHistory = async () => {
    const allOutput = historyEntries.map(e => e.output).join('\n\n');
    const defaultName = `SSH_History_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    const filePath = await window.api.csv.showSaveDialog(defaultName);
    if (filePath) {
      try {
        await window.api.file.writeText(filePath, allOutput);
      } catch (error) {
        console.error('Failed to save history:', error);
      }
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">History</span>
          <span className="text-xs text-gray-500">({historyEntries.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleSaveAllHistory}
            disabled={historyEntries.length === 0}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded disabled:opacity-50"
            title="Save all history"
          >
            <Download size={14} />
          </button>
          <button
            onClick={handleClearAll}
            disabled={output.length === 0}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded disabled:opacity-50"
            title="Clear history"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* History list - flat, not expandable */}
      <div className="flex-1 overflow-auto">
        {historyEntries.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
            No history yet
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {historyEntries.map((entry) => (
              <div
                key={entry.id}
                onClick={() => handleEntryClick(entry)}
                onContextMenu={(e) => handleContextMenu(e, entry)}
                className={`px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                  selectedId === entry.id ? 'bg-primary-50 dark:bg-primary-900/20 border-l-2 border-primary-500' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {formatTime(entry.timestamp)}
                  </span>
                  <div className="flex items-center gap-1">
                    {entry.hostCount > 0 && (
                      <span className="text-xs text-gray-500">
                        {entry.hostCount} host{entry.hostCount > 1 ? 's' : ''}
                      </span>
                    )}
                    {entry.hasErrors && (
                      <span className="w-2 h-2 rounded-full bg-red-500" title="Has errors" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => handleSaveEntry(contextMenu.entry)}
            className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <Download size={14} />
            Save...
          </button>
          <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          <button
            onClick={() => handleDeleteEntry(contextMenu.entry)}
            className="w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
