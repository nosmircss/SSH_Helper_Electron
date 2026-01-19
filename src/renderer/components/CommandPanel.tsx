import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { Play, Square } from 'lucide-react';

export function CommandPanel() {
  const {
    command,
    setCommand,
    selectedPreset,
    presets,
    savePreset,
    selectPreset,
    runCommand,
    cancelExecution,
    isExecuting,
    hosts,
    selectedHostIds,
    config,
    saveConfig,
  } = useAppStore();

  const [presetName, setPresetName] = useState('');
  const [timeout, setTimeout] = useState(config?.timeout || 30);
  const [lineCol, setLineCol] = useState({ line: 1, col: 1 });
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync preset name when selection changes
  useEffect(() => {
    if (selectedPreset) {
      setPresetName(selectedPreset);
      const preset = presets[selectedPreset];
      if (preset?.timeout) {
        setTimeout(preset.timeout);
      }
    } else {
      setPresetName('');
    }
  }, [selectedPreset, presets]);

  // Sync timeout from config
  useEffect(() => {
    if (config?.timeout) {
      setTimeout(config.timeout);
    }
  }, [config?.timeout]);

  // Track cursor position
  const updateLineCol = () => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const text = textarea.value.substring(0, textarea.selectionStart);
    const lines = text.split('\n');
    setLineCol({
      line: lines.length,
      col: lines[lines.length - 1].length + 1,
    });
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) {
      setAlertMessage('Please enter a preset name');
      return;
    }

    const existingPreset = presets[presetName];
    savePreset(presetName.trim(), {
      commands: command,
      timeout: timeout,
      isFavorite: existingPreset?.isFavorite || false,
      folder: existingPreset?.folder,
    });

    // Select the newly saved preset
    if (selectedPreset !== presetName.trim()) {
      selectPreset(presetName.trim());
    }
  };

  const handleRunSelected = async () => {
    if (!command.trim() || isExecuting || selectedHostIds.size === 0) return;
    // Run only on selected hosts
    await runCommand();
  };

  const handleStop = () => {
    cancelExecution();
  };

  const handleTimeoutChange = (value: number) => {
    setTimeout(value);
    saveConfig({ timeout: value });
  };

  const selectedCount = selectedHostIds.size;
  const totalCount = hosts.length;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      {/* Header with preset name, timeout, and save button */}
      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 dark:text-gray-400">Name:</label>
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name..."
              className="w-32 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 dark:text-gray-400">Timeout (s):</label>
            <input
              type="number"
              value={timeout}
              onChange={(e) => handleTimeoutChange(parseInt(e.target.value) || 30)}
              min={1}
              max={300}
              className="w-16 px-2 py-1 text-sm text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <button
            onClick={handleSavePreset}
            disabled={!command.trim()}
            className="px-4 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
        <div className="mt-2 text-xs font-medium text-gray-600 dark:text-gray-400">
          Commands
        </div>
      </div>

      {/* Command editor */}
      <div className="flex-1 overflow-hidden relative">
        <textarea
          ref={textareaRef}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyUp={updateLineCol}
          onClick={updateLineCol}
          placeholder="Enter commands here...&#10;&#10;For YAML scripts, start with:&#10;name: my_script&#10;steps:&#10;  - send: show version"
          className="w-full h-full p-3 font-mono text-sm bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-none resize-none focus:outline-none"
          style={{ fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Consolas', monospace" }}
          spellCheck={false}
        />
      </div>

      {/* Footer with line/col indicator */}
      <div className="px-3 py-1 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 text-right">
        Ln {lineCol.line}, Col {lineCol.col}
      </div>

      {/* Execute buttons */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
        {!isExecuting ? (
          <button
            onClick={handleRunSelected}
            disabled={!command.trim() || selectedCount === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play size={16} />
            Run
            {selectedCount > 0 && <span className="text-xs opacity-75">({selectedCount}/{totalCount})</span>}
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded hover:bg-red-700"
          >
            <Square size={16} />
            Stop
          </button>
        )}
      </div>

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
