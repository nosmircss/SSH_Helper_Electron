import React, { useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { useAppStore } from '../store/appStore';

export function CommandEditor() {
  const { command, setCommand, selectedPreset, theme } = useAppStore();
  const editorRef = useRef<unknown>(null);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  // Determine if content looks like YAML
  const isYaml = command.trimStart().startsWith('---') ||
    command.includes('steps:') ||
    command.includes('- send:') ||
    command.includes('- print:');

  const editorTheme = theme === 'dark' ? 'vs-dark' : 'light';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Command</span>
          {selectedPreset && (
            <span className="text-xs px-2 py-0.5 bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 rounded">
              {selectedPreset}
            </span>
          )}
          {isYaml && (
            <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded">
              YAML Script
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>Variables: ${'{'}column_name{'}'}</span>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="yaml"
          language={isYaml ? 'yaml' : 'shell'}
          value={command}
          onChange={(value) => setCommand(value || '')}
          onMount={handleEditorMount}
          theme={editorTheme}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Consolas', monospace",
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            automaticLayout: true,
            padding: { top: 8, bottom: 8 },
            renderLineHighlight: 'line',
            quickSuggestions: false,
            folding: true,
            bracketPairColorization: { enabled: true },
          }}
        />
      </div>
    </div>
  );
}
