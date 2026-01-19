import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Toolbar } from './components/Toolbar';
import { HostGrid } from './components/HostGrid';
import { PresetPanel } from './components/PresetPanel';
import { CommandPanel } from './components/CommandPanel';
import { OutputPanel } from './components/OutputPanel';
import { OutputHistory } from './components/OutputHistory';
import { SettingsDialog } from './components/SettingsDialog';
import { AboutDialog } from './components/AboutDialog';
import { MessageDialog, MessageType } from './components/MessageDialog';
import { useAppStore } from './store/appStore';
import type { OutputEntry } from '../shared/models';

function App() {
  const { theme, loadConfig, loadPresets, saveState, runCommand, cancelExecution, importCsv, exportCsv, isExecuting, currentSessionId, presets } = useAppStore();
  const [debugMode, setDebugMode] = useState(false);
  // Debug mode will be used for verbose logging and diagnostic display in future
  if (debugMode) {
    console.debug('[Debug Mode Active]');
  }
  const [isLoading, setIsLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [messageDialog, setMessageDialog] = useState<{ open: boolean; title: string; message: string; type: MessageType }>({
    open: false,
    title: '',
    message: '',
    type: 'info',
  });
  const [historyOutput, setHistoryOutput] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<OutputEntry[] | null>(null);
  const prevSessionIdRef = useRef<string | null>(null);

  // Helper to show message dialog
  const showMessage = useCallback((title: string, message: string, type: MessageType = 'info') => {
    setMessageDialog({ open: true, title, message, type });
  }, []);

  // Panel sizes (percentages)
  const [topPanelHeight, setTopPanelHeight] = useState(50); // Top section (hosts + presets/command)
  const [hostsWidth, setHostsWidth] = useState(35); // Hosts grid width in top section
  const [presetsWidth, setPresetsWidth] = useState(50); // Presets width (of remaining space after hosts)
  const [historyWidth, setHistoryWidth] = useState(20); // History width in output section

  // Refs for resize handling
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingVertical = useRef(false);
  const isDraggingHosts = useRef(false);
  const isDraggingPresets = useRef(false);
  const isDraggingHistory = useRef(false);

  // Handle history entry selection
  const handleHistorySelect = useCallback((output: string, entries?: OutputEntry[]) => {
    setHistoryOutput(output);
    setHistoryEntries(entries || null);
  }, []);

  // Clear historyOutput when a new execution session starts
  // This prevents stale history content from being written to the terminal
  useEffect(() => {
    if (currentSessionId && currentSessionId !== prevSessionIdRef.current) {
      setHistoryOutput(null);
      setHistoryEntries(null);
    }
    prevSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    // Apply theme
    if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    // Load initial data
    const init = async () => {
      try {
        await loadConfig();
        await loadPresets();

        // After loading, initialize historyOutput if there's a selected session
        const state = useAppStore.getState();
        if (state.lastSelectedSessionId && state.output.length > 0) {
          const sessionEntries = state.output.filter(
            (e) => e.sessionId === state.lastSelectedSessionId
          );
          if (sessionEntries.length > 0) {
            const combinedOutput = sessionEntries.map((e) => e.text).join('\n');
            setHistoryOutput(combinedOutput);
          }
        }
      } catch (error) {
        console.error('Failed to load config:', error);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [loadConfig, loadPresets]);

  // Save state on window close
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveState();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveState]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+O - Open/Import CSV
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        importCsv();
      }
      // Ctrl+S - Save/Export CSV
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        exportCsv();
      }
      // F5 - Run on all hosts
      if (e.key === 'F5' && !isExecuting) {
        e.preventDefault();
        runCommand();
      }
      // Escape - Cancel execution
      if (e.key === 'Escape' && isExecuting) {
        e.preventDefault();
        cancelExecution();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [importCsv, exportCsv, runCommand, cancelExecution, isExecuting]);

  // Menu event handlers
  useEffect(() => {
    const cleanupFns: (() => void)[] = [];

    // File menu
    cleanupFns.push(window.api.menu.onOpenCsv(() => importCsv()));
    cleanupFns.push(window.api.menu.onSaveCsv(() => exportCsv()));
    cleanupFns.push(window.api.menu.onSaveCsvAs(() => exportCsv()));

    // Export/Import all presets
    cleanupFns.push(window.api.menu.onExportPresets(async () => {
      try {
        const presetNames = Object.keys(presets);
        if (presetNames.length === 0) {
          showMessage('Export Presets', 'No presets to export', 'warning');
          return;
        }
        const data = await window.api.presets.exportPresets(presetNames);
        const filePath = await window.api.csv.showSaveDialog('presets.json');
        if (filePath) {
          await window.api.file.writeText(filePath, data);
          showMessage('Export Presets', `Successfully exported ${presetNames.length} presets`, 'success');
        }
      } catch (error) {
        console.error('Failed to export presets:', error);
        showMessage('Export Presets', 'Failed to export presets', 'error');
      }
    }));

    cleanupFns.push(window.api.menu.onImportPresets(async () => {
      try {
        const filePath = await window.api.csv.showOpenDialog();
        if (!filePath) return;
        const data = await window.api.file.readText(filePath);
        const importedNames = await window.api.presets.importPresets(data);
        await loadPresets();
        showMessage('Import Presets', `Successfully imported ${importedNames.length} presets`, 'success');
      } catch (error) {
        console.error('Failed to import presets:', error);
        showMessage('Import Presets', 'Failed to import presets', 'error');
      }
    }));

    // Settings
    cleanupFns.push(window.api.menu.onSettings(() => setSettingsOpen(true)));

    // Find (placeholder - could open a find dialog)
    cleanupFns.push(window.api.menu.onFind(() => {
      // TODO: Implement find functionality
      console.log('Find requested');
    }));

    // Debug mode
    cleanupFns.push(window.api.menu.onDebugMode(async (enabled) => {
      setDebugMode(enabled);
      await window.api.ssh.setDebugMode(enabled);
      console.log('Debug mode:', enabled);
    }));

    // Check for updates
    cleanupFns.push(window.api.menu.onCheckUpdates(() => {
      // TODO: Implement update check
      showMessage('Check for Updates', 'Update check not implemented yet', 'info');
    }));

    // About
    cleanupFns.push(window.api.menu.onAbout(() => setAboutOpen(true)));

    return () => cleanupFns.forEach(fn => fn());
  }, [importCsv, exportCsv, presets, loadPresets, showMessage]);

  // Vertical resize (between top and output)
  const handleVerticalMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingVertical.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  // Hosts resize
  const handleHostsMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingHosts.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  // Presets resize
  const handlePresetsMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingPresets.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  // History resize
  const handleHistoryMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingHistory.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const container = containerRef.current;
      const rect = container.getBoundingClientRect();

      if (isDraggingVertical.current) {
        const percentage = ((e.clientY - rect.top) / rect.height) * 100;
        setTopPanelHeight(Math.min(Math.max(percentage, 25), 75));
      }

      if (isDraggingHosts.current) {
        const percentage = ((e.clientX - rect.left) / rect.width) * 100;
        setHostsWidth(Math.min(Math.max(percentage, 20), 50));
      }

      if (isDraggingPresets.current) {
        // Calculate presets width as percentage of remaining space after hosts
        const hostsPixels = (hostsWidth / 100) * rect.width;
        const remainingWidth = rect.width - hostsPixels;
        const percentage = ((e.clientX - rect.left - hostsPixels) / remainingWidth) * 100;
        setPresetsWidth(Math.min(Math.max(percentage, 30), 70));
      }

      if (isDraggingHistory.current) {
        const percentage = ((e.clientX - rect.left) / rect.width) * 100;
        setHistoryWidth(Math.min(Math.max(percentage, 15), 40));
      }
    };

    const handleMouseUp = () => {
      if (isDraggingVertical.current || isDraggingHosts.current || isDraggingPresets.current || isDraggingHistory.current) {
        isDraggingVertical.current = false;
        isDraggingHosts.current = false;
        isDraggingPresets.current = false;
        isDraggingHistory.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [hostsWidth]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-100 dark:bg-gray-900">
      {/* Toolbar */}
      <Toolbar onOpenSettings={() => setSettingsOpen(true)} />

      {/* Main content area */}
      <div ref={containerRef} className="flex flex-col flex-1 overflow-hidden">
        {/* Top section: Hosts | Presets | Command/Script */}
        <div
          className="flex overflow-hidden"
          style={{ height: `${topPanelHeight}%` }}
        >
          {/* Hosts grid */}
          <div
            className="overflow-hidden border-r border-gray-200 dark:border-gray-700"
            style={{ width: `${hostsWidth}%` }}
          >
            <HostGrid />
          </div>

          {/* Hosts resize handle */}
          <div
            className="w-1 bg-gray-200 dark:bg-gray-700 hover:bg-primary-400 dark:hover:bg-primary-600 cursor-col-resize transition-colors flex-shrink-0"
            onMouseDown={handleHostsMouseDown}
          />

          {/* Presets + Command area */}
          <div className="flex flex-1 overflow-hidden">
            {/* Presets panel */}
            <div
              className="overflow-hidden border-r border-gray-200 dark:border-gray-700"
              style={{ width: `${presetsWidth}%` }}
            >
              <PresetPanel />
            </div>

            {/* Presets resize handle */}
            <div
              className="w-1 bg-gray-200 dark:bg-gray-700 hover:bg-primary-400 dark:hover:bg-primary-600 cursor-col-resize transition-colors flex-shrink-0"
              onMouseDown={handlePresetsMouseDown}
            />

            {/* Command/Script panel */}
            <div className="flex-1 overflow-hidden">
              <CommandPanel />
            </div>
          </div>
        </div>

        {/* Vertical resize handle */}
        <div
          className="h-1 bg-gray-200 dark:bg-gray-700 hover:bg-primary-400 dark:hover:bg-primary-600 cursor-row-resize transition-colors flex-shrink-0"
          onMouseDown={handleVerticalMouseDown}
        />

        {/* Bottom section: History | Output */}
        <div
          className="flex overflow-hidden"
          style={{ height: `${100 - topPanelHeight}%` }}
        >
          {/* History panel */}
          <div
            className="overflow-hidden border-r border-gray-200 dark:border-gray-700"
            style={{ width: `${historyWidth}%` }}
          >
            <OutputHistory onSelectEntry={handleHistorySelect} onClearHistory={() => setHistoryOutput(null)} />
          </div>

          {/* History resize handle */}
          <div
            className="w-1 bg-gray-200 dark:bg-gray-700 hover:bg-primary-400 dark:hover:bg-primary-600 cursor-col-resize transition-colors flex-shrink-0"
            onMouseDown={handleHistoryMouseDown}
          />

          {/* Output panel */}
          <div className="flex-1 overflow-hidden">
            <OutputPanel historyOutput={historyOutput} historyEntries={historyEntries} onClearHistory={() => { setHistoryOutput(null); setHistoryEntries(null); }} />
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-xs">
        <span className="text-gray-600 dark:text-gray-400">Ready</span>
        <span className="text-gray-500 dark:text-gray-500">SSH Helper v1.0.0</span>
      </div>

      {/* Settings Dialog */}
      <SettingsDialog isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* About Dialog */}
      <AboutDialog isOpen={aboutOpen} onClose={() => setAboutOpen(false)} />

      {/* Message Dialog */}
      <MessageDialog
        isOpen={messageDialog.open}
        onClose={() => setMessageDialog(prev => ({ ...prev, open: false }))}
        title={messageDialog.title}
        message={messageDialog.message}
        type={messageDialog.type}
      />
    </div>
  );
}

export default App;
