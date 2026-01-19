import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import type { OutputType, OutputColorConfig } from '../../shared/models';
import { DEFAULT_OUTPUT_COLORS } from '../../shared/models';
import { ChevronDown, ChevronUp } from 'lucide-react';

const XIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

// Color presets with their ANSI codes and display hex colors
const COLOR_PRESETS: Record<string, { ansi: string; hex: string }> = {
  'Red': { ansi: '\x1b[31m', hex: '#ef4444' },
  'Green': { ansi: '\x1b[32m', hex: '#22c55e' },
  'Yellow': { ansi: '\x1b[33m', hex: '#eab308' },
  'Blue': { ansi: '\x1b[34m', hex: '#3b82f6' },
  'Magenta': { ansi: '\x1b[35m', hex: '#a855f7' },
  'Cyan': { ansi: '\x1b[36m', hex: '#06b6d4' },
  'White': { ansi: '\x1b[37m', hex: '#f3f4f6' },
  'Gray': { ansi: '\x1b[90m', hex: '#6b7280' },
  'Orange': { ansi: '\x1b[38;5;208m', hex: '#f97316' },
  'Default': { ansi: '\x1b[0m', hex: '#e5e7eb' },
};

// Get preset name from ANSI code, or 'Custom' if not found
const getPresetName = (ansi: string): string => {
  for (const [name, preset] of Object.entries(COLOR_PRESETS)) {
    if (preset.ansi === ansi) return name;
  }
  return 'Custom';
};

// Get hex color for an ANSI code (for preview)
const getHexColor = (ansi: string): string => {
  for (const preset of Object.values(COLOR_PRESETS)) {
    if (preset.ansi === ansi) return preset.hex;
  }
  // Try to parse common ANSI codes for custom values
  if (ansi.includes('[31m')) return '#ef4444';
  if (ansi.includes('[32m')) return '#22c55e';
  if (ansi.includes('[33m')) return '#eab308';
  if (ansi.includes('[34m')) return '#3b82f6';
  if (ansi.includes('[35m')) return '#a855f7';
  if (ansi.includes('[36m')) return '#06b6d4';
  if (ansi.includes('[37m')) return '#f3f4f6';
  if (ansi.includes('[90m')) return '#6b7280';
  if (ansi.includes('[0m')) return '#e5e7eb';
  return '#e5e7eb'; // Default gray
};

// Output type labels for display
const OUTPUT_TYPE_LABELS: Record<OutputType, string> = {
  Info: 'Info',
  Command: 'Command',
  CommandOutput: 'Output',
  Debug: 'Debug',
  Warning: 'Warning',
  Error: 'Error',
  Success: 'Success',
};

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const { config, saveConfig } = useAppStore();

  // Local state for form fields
  const [timeout, setTimeout] = useState(30);
  const [connectionTimeout, setConnectionTimeout] = useState(10);
  const [maxHistoryEntries, setMaxHistoryEntries] = useState(30);
  const [rememberState, setRememberState] = useState(true);
  const [checkOnStartup, setCheckOnStartup] = useState(true);

  // Color settings state
  const [outputColoringEnabled, setOutputColoringEnabled] = useState(true);
  const [outputColors, setOutputColors] = useState<OutputColorConfig>({ ...DEFAULT_OUTPUT_COLORS });
  const [showAdvancedColors, setShowAdvancedColors] = useState(false);

  // Load config values when dialog opens
  useEffect(() => {
    if (isOpen && config) {
      setTimeout(config.timeout || 30);
      setConnectionTimeout(config.connectionTimeout || 10);
      setMaxHistoryEntries(config.maxHistoryEntries || 30);
      setRememberState(config.rememberState !== false);
      setCheckOnStartup(config.updateSettings?.checkOnStartup !== false);
      setOutputColoringEnabled(config.outputColoringEnabled !== false);
      setOutputColors(config.outputColors || { ...DEFAULT_OUTPUT_COLORS });
    }
  }, [isOpen, config]);

  const handleSave = async () => {
    await saveConfig({
      timeout,
      connectionTimeout,
      maxHistoryEntries,
      rememberState,
      outputColoringEnabled,
      outputColors,
      updateSettings: {
        ...config?.updateSettings,
        gitHubOwner: config?.updateSettings?.gitHubOwner || 'nosmircss',
        gitHubRepo: config?.updateSettings?.gitHubRepo || 'SSH_Helper',
        checkOnStartup,
      },
    });
    onClose();
  };

  const handleColorChange = (type: OutputType, value: string) => {
    setOutputColors(prev => ({ ...prev, [type]: value }));
  };

  const handlePresetSelect = (type: OutputType, presetName: string) => {
    if (presetName !== 'Custom' && COLOR_PRESETS[presetName]) {
      handleColorChange(type, COLOR_PRESETS[presetName].ansi);
    }
  };

  const handleResetColors = () => {
    setOutputColors({ ...DEFAULT_OUTPUT_COLORS });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Settings</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
          >
            <XIcon />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* General Section */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">General</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={rememberState}
                  onChange={(e) => setRememberState(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Remember application state on exit
                </span>
              </label>

              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600 dark:text-gray-400 w-40">
                  Max history entries:
                </label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={maxHistoryEntries}
                  onChange={(e) => setMaxHistoryEntries(parseInt(e.target.value) || 30)}
                  className="w-20 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>

          {/* Timeouts Section */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Timeouts</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600 dark:text-gray-400 w-40">
                  Command timeout (s):
                </label>
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={timeout}
                  onChange={(e) => setTimeout(parseInt(e.target.value) || 30)}
                  className="w-20 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600 dark:text-gray-400 w-40">
                  Connection timeout (s):
                </label>
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={connectionTimeout}
                  onChange={(e) => setConnectionTimeout(parseInt(e.target.value) || 10)}
                  className="w-20 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>

          {/* Output Colors Section */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Output Colors</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={outputColoringEnabled}
                  onChange={(e) => setOutputColoringEnabled(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Enable output coloring
                </span>
              </label>

              {outputColoringEnabled && (
                <>
                  <div className="space-y-2 pl-1">
                    {(Object.keys(OUTPUT_TYPE_LABELS) as OutputType[]).map((type) => (
                      <div key={type} className="flex items-center gap-2">
                        <label className="text-sm text-gray-600 dark:text-gray-400 w-20">
                          {OUTPUT_TYPE_LABELS[type]}:
                        </label>
                        <select
                          value={getPresetName(outputColors[type])}
                          onChange={(e) => handlePresetSelect(type, e.target.value)}
                          className="flex-1 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        >
                          {Object.keys(COLOR_PRESETS).map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                          {getPresetName(outputColors[type]) === 'Custom' && (
                            <option value="Custom">Custom</option>
                          )}
                        </select>
                        <div
                          className="w-6 h-6 rounded border border-gray-300 dark:border-gray-600 flex-shrink-0"
                          style={{ backgroundColor: getHexColor(outputColors[type]) }}
                          title={outputColors[type]}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Advanced Mode Toggle */}
                  <button
                    type="button"
                    onClick={() => setShowAdvancedColors(!showAdvancedColors)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    {showAdvancedColors ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    Advanced (ANSI codes)
                  </button>

                  {showAdvancedColors && (
                    <div className="space-y-2 pl-1 pt-2 border-t border-gray-200 dark:border-gray-700">
                      {(Object.keys(OUTPUT_TYPE_LABELS) as OutputType[]).map((type) => (
                        <div key={type} className="flex items-center gap-2">
                          <label className="text-xs text-gray-500 dark:text-gray-400 w-20">
                            {OUTPUT_TYPE_LABELS[type]}:
                          </label>
                          <input
                            type="text"
                            value={outputColors[type]}
                            onChange={(e) => handleColorChange(type, e.target.value)}
                            className="flex-1 px-2 py-1 text-xs font-mono rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
                            placeholder="\x1b[34m"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Reset Button */}
                  <button
                    type="button"
                    onClick={handleResetColors}
                    className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400"
                  >
                    Reset to defaults
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Updates Section */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Updates</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={checkOnStartup}
                  onChange={(e) => setCheckOnStartup(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Check for updates on startup
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-primary-600 text-white hover:bg-primary-700 rounded"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
