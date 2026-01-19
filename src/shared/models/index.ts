// ============================================
// Data Models - Ported from C# SSH_Helper
// ============================================

/**
 * SSH host connection details
 * Ported from: Models/HostConnection.cs
 */
export interface HostConnection {
  id: string;
  ipAddress: string;
  port: number;
  username?: string;
  password?: string;
  variables: Record<string, string>;
}

/**
 * Result of executing a command on a host
 * Ported from: Models/ExecutionResult.cs
 */
export interface ExecutionResult {
  hostId: string;
  host: HostConnection;
  output: string;
  success: boolean;
  errorMessage?: string;
  timestamp: Date;
  duration?: number;
}

/**
 * Preset type - simple commands or YAML script
 */
export type PresetType = 'Simple' | 'YamlScript';

/**
 * Command preset with optional timeout override
 * Ported from: Models/PresetInfo.cs
 */
export interface PresetInfo {
  commands: string;
  timeout?: number;
  isFavorite: boolean;
  folder?: string;
  type?: PresetType;
}

/**
 * Preset folder metadata
 * Ported from: Models/FolderInfo.cs
 */
export interface FolderInfo {
  isExpanded: boolean;
  sortOrder: number;
}

/**
 * Preset sort mode
 */
export type PresetSortMode = 'Ascending' | 'Descending' | 'Manual';

/**
 * Update settings for GitHub release checking
 */
export interface UpdateSettings {
  gitHubOwner: string;
  gitHubRepo: string;
  checkOnStartup: boolean;
  lastCheckTime?: string;
  skippedVersion?: string;
}

/**
 * Window state for restore
 */
export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
  splitterPositions?: Record<string, number>;
}

/**
 * Serializable output entry (Date stored as ISO string)
 */
export interface SerializedOutputEntry {
  id: string;
  sessionId: string;
  hostId?: string;
  text: string;
  type: OutputType;
  timestamp: string;
}

/**
 * Application state (persisted between sessions)
 */
export interface ApplicationState {
  hosts: HostConnection[];
  columns: string[];
  commandHistory: string[];
  lastPreset?: string;
  outputHistory?: SerializedOutputEntry[];
  selectedHostIds?: string[];
  lastSelectedSessionId?: string;
  expandedFolders?: string[]; // Preset folders that are expanded
}

/**
 * Root application configuration
 * Ported from: Models/AppConfiguration.cs
 */
export interface AppConfiguration {
  presets: Record<string, PresetInfo>;
  username: string;
  timeout: number;
  connectionTimeout: number;
  windowState: WindowState;
  presetSortMode: PresetSortMode;
  manualPresetOrder: string[];
  presetFolders: Record<string, FolderInfo>;
  manualPresetOrderByFolder: Record<string, string[]>;
  manualFolderOrder: string[];
  updateSettings: UpdateSettings;
  rememberState: boolean;
  savedState?: ApplicationState;
  maxHistoryEntries: number;
  theme: 'light' | 'dark' | 'system';
  outputColoringEnabled: boolean;
  outputColors: OutputColorConfig;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: AppConfiguration = {
  presets: {},
  username: '',
  timeout: 30,
  connectionTimeout: 10,
  windowState: {
    width: 1400,
    height: 900,
    isMaximized: false,
  },
  presetSortMode: 'Manual',
  manualPresetOrder: [],
  presetFolders: {},
  manualPresetOrderByFolder: {},
  manualFolderOrder: [],
  updateSettings: {
    gitHubOwner: 'nosmircss',
    gitHubRepo: 'SSH_Helper',
    checkOnStartup: true,
  },
  rememberState: true,
  maxHistoryEntries: 30,
  theme: 'system',
  outputColoringEnabled: true,
  outputColors: {
    Info: '\x1b[34m',           // Blue
    Command: '\x1b[33m',        // Yellow
    CommandOutput: '\x1b[0m',   // Default
    Debug: '\x1b[90m',          // Gray
    Warning: '\x1b[38;5;208m',  // Orange
    Error: '\x1b[31m',          // Red
    Success: '\x1b[32m',        // Green
  },
};

// ============================================
// Scripting Models
// ============================================

/**
 * Output type for script messages
 */
export type OutputType = 'Info' | 'Command' | 'CommandOutput' | 'Debug' | 'Warning' | 'Error' | 'Success';

/**
 * Output color configuration - ANSI codes for each output type
 */
export interface OutputColorConfig {
  Info: string;
  Command: string;
  CommandOutput: string;
  Debug: string;
  Warning: string;
  Error: string;
  Success: string;
}

/**
 * Default output colors (ANSI escape codes)
 */
export const DEFAULT_OUTPUT_COLORS: OutputColorConfig = {
  Info: '\x1b[34m',           // Blue
  Command: '\x1b[33m',        // Yellow
  CommandOutput: '\x1b[0m',   // Default
  Debug: '\x1b[90m',          // Gray
  Warning: '\x1b[38;5;208m',  // Orange
  Error: '\x1b[31m',          // Red
  Success: '\x1b[32m',        // Green
};

/**
 * Output entry for display
 */
export interface OutputEntry {
  id: string;
  sessionId: string;
  hostId?: string;
  text: string;
  type: OutputType;
  timestamp: Date;
}

/**
 * Script step types
 */
export type StepType =
  | 'send'
  | 'print'
  | 'wait'
  | 'set'
  | 'exit'
  | 'extract'
  | 'if'
  | 'foreach'
  | 'while'
  | 'readfile'
  | 'writefile'
  | 'input'
  | 'updatecolumn';

/**
 * Extract options for regex capture
 */
export interface ExtractOptions {
  from: string;
  pattern: string;
  into: string | string[];
  match?: 'first' | 'last' | 'all' | number;
}

/**
 * Read file options
 */
export interface ReadFileOptions {
  path: string;
  into: string;
  skipEmptyLines?: boolean;
  trimLines?: boolean;
  maxLines?: number;
  encoding?: 'utf-8' | 'ascii' | 'utf-16' | 'utf-32';
}

/**
 * Write file options
 */
export interface WriteFileOptions {
  path: string;
  content: string;
  mode?: 'append' | 'overwrite';
}

/**
 * Input prompt options
 */
export interface InputOptions {
  prompt: string;
  into: string;
  default?: string;
  password?: boolean;
  validate?: string;
  validationError?: string;
}

/**
 * Update column options
 */
export interface UpdateColumnOptions {
  column: string;
  value: string;
}

/**
 * Script step definition
 */
export interface ScriptStep {
  type: StepType;
  value?: string | number;

  // Command options
  capture?: string;
  suppress?: boolean;
  expect?: string;
  timeout?: number;
  onError?: 'continue' | 'stop';

  // Extract options
  extract?: ExtractOptions;

  // File options
  readfile?: ReadFileOptions;
  writefile?: WriteFileOptions;

  // Input options
  input?: InputOptions;

  // Update column options
  updatecolumn?: UpdateColumnOptions;

  // Control flow
  condition?: string;
  then?: ScriptStep[];
  else?: ScriptStep[];
  do?: ScriptStep[];
  when?: string;

  // Foreach
  variable?: string;
  collection?: string;
}

/**
 * Parsed YAML script
 */
export interface Script {
  name?: string;
  description?: string;
  version?: string;
  debug?: boolean;
  vars?: Record<string, unknown>;
  steps: ScriptStep[];
}

/**
 * Script execution result
 */
export interface ScriptResult {
  success: boolean;
  output: string;
  error?: string;
  variables: Record<string, unknown>;
}

// ============================================
// UI State Types
// ============================================

/**
 * Execution status for hosts
 */
export type ExecutionStatus = 'idle' | 'connecting' | 'running' | 'success' | 'error' | 'cancelled';

/**
 * Host with UI state
 */
export interface HostWithStatus extends HostConnection {
  status: ExecutionStatus;
  output?: string;
  error?: string;
}
