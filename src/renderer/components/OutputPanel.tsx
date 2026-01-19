import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import 'xterm/css/xterm.css';
import { useAppStore } from '../store/appStore';
import type { OutputType } from '../../shared/models';
import { Trash2, Search, X, ChevronUp, ChevronDown, Copy, Save, Palette } from 'lucide-react';
import type { OutputEntry } from '../../shared/models';

// Default ANSI color codes for different output types (used as fallback)
const defaultOutputColors: Record<OutputType, string> = {
  Info: '\x1b[34m',      // Blue
  Command: '\x1b[33m',   // Yellow
  CommandOutput: '\x1b[0m', // Default
  Debug: '\x1b[90m',     // Gray
  Warning: '\x1b[38;5;208m', // Orange
  Error: '\x1b[31m',     // Red
  Success: '\x1b[32m',   // Green
};

const RESET = '\x1b[0m';

// Helper to get color for an output type from config or defaults
const getOutputColor = (type: OutputType, config: { outputColors?: Record<OutputType, string>; outputColoringEnabled?: boolean } | null): string => {
  if (config?.outputColoringEnabled === false) {
    return ''; // No color when disabled
  }
  return config?.outputColors?.[type] ?? defaultOutputColors[type] ?? '';
};

interface OutputPanelProps {
  historyOutput?: string | null;
  historyEntries?: OutputEntry[] | null;  // Full entries with type info for colored history display
  onClearHistory?: () => void;
}

export function OutputPanel({ historyOutput, historyEntries, onClearHistory }: OutputPanelProps) {
  const { output, clearOutput, hosts, theme, currentSessionId, config, saveConfig } = useAppStore();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastOutputLength = useRef(0);
  const lastSessionIdRef = useRef<string | null>(null);

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchCount, setMatchCount] = useState<number | null>(null);

  // Track if component is mounted
  const [isReady, setIsReady] = useState(false);

  // Wait for layout to stabilize before showing terminal
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 200);
    return () => clearTimeout(timer);
  }, []);

  // Initialize terminal only after component is ready
  useEffect(() => {
    if (!isReady || !terminalRef.current) return;

    const container = terminalRef.current;
    const rect = container.getBoundingClientRect();

    // Don't initialize if container has no size
    if (rect.width === 0 || rect.height === 0) return;

    const terminal = new Terminal({
      cursorBlink: false,
      cursorStyle: 'bar',
      disableStdin: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Consolas', monospace",
      theme: theme === 'dark' ? {
        background: '#1f2937',
        foreground: '#e5e7eb',
        cursor: '#e5e7eb',
        selectionBackground: '#374151',
      } : {
        background: '#111827',
        foreground: '#e5e7eb',
        cursor: '#e5e7eb',
        selectionBackground: '#374151',
      },
      convertEol: true,
      scrollback: 10000,
      cols: 80,
      rows: 24,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);

    terminal.open(container);
    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // Fit after a brief delay to let xterm initialize its internals
    const fitTimer = setTimeout(() => {
      try {
        fitAddon.fit();
      } catch (e) {
        // Ignore
      }
    }, 50);

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try {
          if (xtermRef.current && fitAddonRef.current) {
            fitAddonRef.current.fit();
          }
        } catch (e) {
          // Ignore
        }
      });
    });
    resizeObserver.observe(container);

    return () => {
      clearTimeout(fitTimer);
      resizeObserver.disconnect();
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [isReady]);

  // Update terminal theme when app theme changes
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = theme === 'dark' ? {
        background: '#1f2937',
        foreground: '#e5e7eb',
        cursor: '#e5e7eb',
        selectionBackground: '#374151',
      } : {
        background: '#111827',
        foreground: '#e5e7eb',
        cursor: '#e5e7eb',
        selectionBackground: '#374151',
      };
    }
  }, [theme]);

  // Track the session we're currently displaying
  const displayedSessionIdRef = useRef<string | null>(null);
  // Track what historyOutput was on the previous render
  const prevHistoryOutputRef = useRef<string | null | undefined>(undefined);
  // Track color settings for re-rendering when they change
  const prevColoringEnabledRef = useRef<boolean | undefined>(undefined);
  const prevOutputColorsRef = useRef<string | undefined>(undefined);

  // Helper function to render entries to terminal
  const renderEntriesToTerminal = useCallback((terminal: Terminal, entries: typeof output, colorConfig: typeof config) => {
    for (const entry of entries) {
      const color = getOutputColor(entry.type, colorConfig);
      const text = entry.text.replace(/\r?\n/g, '\r\n');
      const reset = colorConfig?.outputColoringEnabled !== false ? RESET : '';
      terminal.writeln(`${color}${text}${reset}`);
    }
  }, []);

  // Combined effect for handling session changes, output writing, and history display
  // Having everything in one effect ensures proper sequencing
  useEffect(() => {
    if (!xtermRef.current) return;

    const terminal = xtermRef.current;

    // Check if color settings changed - need to re-render all content
    const currentColoringEnabled = config?.outputColoringEnabled;
    const currentColorsJson = JSON.stringify(config?.outputColors);
    const colorSettingsChanged =
      prevColoringEnabledRef.current !== undefined &&
      (prevColoringEnabledRef.current !== currentColoringEnabled ||
       prevOutputColorsRef.current !== currentColorsJson);

    // If output was cleared (array is now empty but we had content before), clear the terminal
    if (output.length === 0 && lastOutputLength.current > 0) {
      terminal.clear();
      lastOutputLength.current = 0;
      displayedSessionIdRef.current = null;
      prevHistoryOutputRef.current = historyOutput;
      prevColoringEnabledRef.current = currentColoringEnabled;
      prevOutputColorsRef.current = currentColorsJson;
      return;
    }

    // Detect when a new session starts (currentSessionId changes from null to a value)
    const isNewSession = currentSessionId && currentSessionId !== lastSessionIdRef.current;
    if (isNewSession) {
      // Clear terminal for fresh output - this is critical on first run after app load
      // to prevent old history content from being displayed
      terminal.clear();
      // Reset to 0 so we rewrite all entries for this session from scratch
      lastOutputLength.current = 0;
      // Track that we're now displaying this session
      displayedSessionIdRef.current = currentSessionId;
    }

    // When execution ends (currentSessionId goes from a value to null), scroll to top
    if (!currentSessionId && lastSessionIdRef.current) {
      setTimeout(() => {
        xtermRef.current?.scrollToLine(0);
      }, 100);
    }

    lastSessionIdRef.current = currentSessionId;

    // During live execution, only show entries from the current session
    if (currentSessionId) {
      // If color settings changed during execution, re-render all entries
      if (colorSettingsChanged) {
        terminal.clear();
        const entriesToShow = output.filter(e => e.sessionId === currentSessionId);
        renderEntriesToTerminal(terminal, entriesToShow, config);
        lastOutputLength.current = entriesToShow.length;
      } else {
        const entriesToShow = output.filter(e => e.sessionId === currentSessionId);
        const newEntries = entriesToShow.slice(lastOutputLength.current);
        lastOutputLength.current = entriesToShow.length;
        renderEntriesToTerminal(terminal, newEntries, config);
      }
    } else {
      // Not executing - handle history display
      // If historyOutput was cleared (went from something to null), clear the terminal
      if (historyOutput === null && prevHistoryOutputRef.current && prevHistoryOutputRef.current !== null) {
        terminal.clear();
        lastOutputLength.current = 0;
      } else if (historyOutput && (historyOutput !== prevHistoryOutputRef.current || colorSettingsChanged)) {
        // historyOutput changed to a new value OR color settings changed - display it
        terminal.clear();
        lastOutputLength.current = 0;

        // If we have full history entries with type info, use them for colored output
        if (historyEntries && historyEntries.length > 0) {
          renderEntriesToTerminal(terminal, historyEntries, config);
        } else {
          // Fallback to plain text if no typed entries available
          const lines = historyOutput.split('\n');
          for (const line of lines) {
            terminal.writeln(line);
          }
        }
        // Scroll to the top so history starts at the beginning
        setTimeout(() => {
          terminal.scrollToLine(0);
        }, 0);
      } else if (colorSettingsChanged && output.length > 0 && !historyOutput) {
        // Color settings changed but we're showing the current output (not history)
        // Re-render the last session's output
        const lastSessionId = lastSessionIdRef.current;
        if (lastSessionId) {
          terminal.clear();
          const entriesToShow = output.filter(e => e.sessionId === lastSessionId);
          renderEntriesToTerminal(terminal, entriesToShow, config);
          lastOutputLength.current = entriesToShow.length;
        }
      }
    }

    prevHistoryOutputRef.current = historyOutput;
    prevColoringEnabledRef.current = currentColoringEnabled;
    prevOutputColorsRef.current = currentColorsJson;
  }, [currentSessionId, output, historyOutput, historyEntries, config, renderEntriesToTerminal]);

  const getHostLabel = (hostId: string) => {
    const host = hosts.find((h) => h.id === hostId);
    return host?.ipAddress || hostId.substring(0, 8);
  };

  const handleClear = () => {
    clearOutput();
    lastOutputLength.current = 0;
    xtermRef.current?.clear();
    onClearHistory?.();
  };

  const handleSearch = useCallback((direction: 'next' | 'prev') => {
    if (!searchAddonRef.current || !searchQuery) return;

    if (direction === 'next') {
      searchAddonRef.current.findNext(searchQuery, { caseSensitive: false });
    } else {
      searchAddonRef.current.findPrevious(searchQuery, { caseSensitive: false });
    }
  }, [searchQuery]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch(e.shiftKey ? 'prev' : 'next');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowSearch(false);
      setSearchQuery('');
      searchAddonRef.current?.clearDecorations();
    }
  }, [handleSearch]);

  const toggleSearch = useCallback(() => {
    setShowSearch((prev) => {
      if (!prev) {
        setTimeout(() => searchInputRef.current?.focus(), 0);
      } else {
        setSearchQuery('');
        searchAddonRef.current?.clearDecorations();
      }
      return !prev;
    });
  }, []);

  // Copy selected text or all output to clipboard
  const handleCopy = useCallback(() => {
    if (!xtermRef.current) return;

    // Try to get selected text first
    const selection = xtermRef.current.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection);
      return true;
    } else {
      // If no selection, copy all visible output (no IP prefix)
      const allText = output.map(entry => entry.text).join('\n');
      navigator.clipboard.writeText(allText);
      return true;
    }
  }, [output]);

  // Save output to file
  const handleSaveOutput = useCallback(async () => {
    const allText = output.map(entry => entry.text).join('\n');

    // Use file save dialog
    const filePath = await window.api.csv.showSaveDialog(`SSH_Output_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
    if (filePath) {
      // Write using the main process
      try {
        await window.api.file.writeText(filePath, allText);
      } catch (error) {
        console.error('Failed to save output:', error);
      }
    }
  }, [output, hosts]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        toggleSearch();
      }
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSaveOutput();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSearch, handleSaveOutput]);

  // Handle Ctrl+C for copy - attach directly to terminal for better handling
  useEffect(() => {
    if (!xtermRef.current) return;

    const terminal = xtermRef.current;
    const disposable = terminal.attachCustomKeyEventHandler((e) => {
      // Allow Ctrl+C to copy selected text
      if (e.ctrlKey && e.key === 'c' && e.type === 'keydown') {
        const selection = terminal.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
          return false; // Prevent default xterm handling
        }
      }
      // Allow Ctrl+A to select all
      if (e.ctrlKey && e.key === 'a' && e.type === 'keydown') {
        terminal.selectAll();
        return false;
      }
      return true; // Let other keys pass through
    });

    return () => disposable.dispose();
  }, [isReady]);

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-300">Output</span>
          <button
            onClick={() => saveConfig({ outputColoringEnabled: config?.outputColoringEnabled === false })}
            className={`p-1 rounded transition-colors ${
              config?.outputColoringEnabled !== false
                ? 'text-primary-400 bg-gray-700'
                : 'text-gray-400 hover:text-gray-200'
            }`}
            title={config?.outputColoringEnabled !== false ? 'Disable output colors' : 'Enable output colors'}
          >
            <Palette size={14} />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            disabled={output.length === 0}
            className="p-1 text-gray-400 hover:text-gray-200 rounded disabled:opacity-50 transition-colors"
            title="Copy (Ctrl+C)"
          >
            <Copy size={16} />
          </button>
          <button
            onClick={handleSaveOutput}
            disabled={output.length === 0}
            className="p-1 text-gray-400 hover:text-gray-200 rounded disabled:opacity-50 transition-colors"
            title="Save output (Ctrl+S)"
          >
            <Save size={16} />
          </button>
          <button
            onClick={toggleSearch}
            className={`p-1 rounded transition-colors ${showSearch ? 'text-primary-400 bg-gray-700' : 'text-gray-400 hover:text-gray-200'}`}
            title="Find (Ctrl+F)"
          >
            <Search size={16} />
          </button>
          <button
            onClick={handleClear}
            disabled={output.length === 0}
            className="p-1 text-gray-400 hover:text-gray-200 rounded disabled:opacity-50 transition-colors"
            title="Clear output"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border-b border-gray-700">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search..."
            className="flex-1 px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <button
            onClick={() => handleSearch('prev')}
            disabled={!searchQuery}
            className="p-1 text-gray-400 hover:text-gray-200 rounded disabled:opacity-50 transition-colors"
            title="Previous (Shift+Enter)"
          >
            <ChevronUp size={16} />
          </button>
          <button
            onClick={() => handleSearch('next')}
            disabled={!searchQuery}
            className="p-1 text-gray-400 hover:text-gray-200 rounded disabled:opacity-50 transition-colors"
            title="Next (Enter)"
          >
            <ChevronDown size={16} />
          </button>
          <button
            onClick={() => {
              setShowSearch(false);
              setSearchQuery('');
              searchAddonRef.current?.clearDecorations();
            }}
            className="p-1 text-gray-400 hover:text-gray-200 rounded transition-colors"
            title="Close (Escape)"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Terminal */}
      <div ref={terminalRef} className="flex-1 overflow-hidden p-2" />
    </div>
  );
}
