import { create } from 'zustand';
import type {
  HostWithStatus,
  PresetInfo,
  AppConfiguration,
  OutputEntry,
  ExecutionStatus,
  SerializedOutputEntry,
} from '../../shared/models';
import { parseHostAndPort } from '../utils/hostParser';

interface AppState {
  // Config
  config: AppConfiguration | null;
  theme: 'light' | 'dark' | 'system';

  // Credentials (global defaults)
  username: string;
  password: string;

  // Hosts
  hosts: HostWithStatus[];
  selectedHostIds: Set<string>;
  columns: string[];

  // Presets
  presets: Record<string, PresetInfo>;
  presetFolders: string[];
  presetOrder: string[]; // Order of preset names (for within folders)
  folderOrder: string[]; // Order of folder names (legacy)
  sidebarOrder: string[]; // Unified order: 'preset:name' or 'folder:name'
  expandedFolders: Set<string>; // Which preset folders are expanded
  selectedPreset: string | null;

  // Command
  command: string;

  // Output
  output: OutputEntry[];
  currentSessionId: string | null;
  lastSelectedSessionId: string | null;
  hostSessionMap: Map<string, string>; // Maps hostId to sessionId for pending completions

  // Execution
  isExecuting: boolean;

  // Actions - Config
  loadConfig: () => Promise<void>;
  saveConfig: (config: Partial<AppConfiguration>) => Promise<void>;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setUsername: (username: string) => void;
  setPassword: (password: string) => void;

  // Actions - Hosts
  addHost: (ip: string, port?: number) => void;
  removeHost: (id: string) => void;
  updateHost: (id: string, updates: Partial<HostWithStatus>) => void;
  updateHostVariable: (id: string, columnName: string, value: string) => void;
  selectHost: (id: string, selected: boolean) => void;
  selectAllHosts: (selected: boolean) => void;
  setHostStatus: (id: string, status: ExecutionStatus) => void;
  clearHosts: () => void;
  importCsv: () => Promise<void>;
  exportCsv: () => Promise<void>;
  addColumn: (columnName: string) => void;
  removeColumn: (columnName: string) => void;
  renameColumn: (oldName: string, newName: string) => void;
  reorderColumns: (columns: string[]) => void;

  // Actions - Presets
  loadPresets: () => Promise<void>;
  selectPreset: (name: string | null) => void;
  savePreset: (name: string, preset: PresetInfo) => Promise<void>;
  deletePreset: (name: string) => Promise<void>;
  addPresetFolder: (folderName: string) => void;
  removePresetFolder: (folderName: string) => void;
  renamePresetFolder: (oldName: string, newName: string) => void;
  movePresetToFolder: (presetName: string, folderName: string | undefined) => void;
  reorderPresets: (presetOrder: string[]) => void;
  reorderFolders: (folderOrder: string[]) => void;
  reorderSidebar: (sidebarOrder: string[]) => void;
  toggleFolder: (folderName: string) => void;
  setExpandedFolders: (folders: Set<string>) => void;

  // Actions - Command
  setCommand: (command: string) => void;

  // Actions - Output
  addOutput: (entry: Omit<OutputEntry, 'id' | 'timestamp' | 'sessionId'> & { sessionId?: string }) => void;
  clearOutput: () => void;
  saveOutputHistory: () => Promise<void>;
  setLastSelectedSessionId: (sessionId: string | null) => void;

  // Actions - Execution
  runCommand: () => Promise<void>;
  cancelExecution: () => void;

  // Actions - State persistence
  saveState: () => Promise<void>;
}

let outputIdCounter = 0;

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  config: null,
  theme: 'system',
  username: '',
  password: '',
  hosts: [],
  selectedHostIds: new Set(),
  columns: ['Host_IP'],
  presets: {},
  presetFolders: [],
  presetOrder: [],
  folderOrder: [],
  sidebarOrder: [],
  expandedFolders: new Set(),
  selectedPreset: null,
  command: '',
  output: [],
  currentSessionId: null,
  lastSelectedSessionId: null,
  hostSessionMap: new Map(),
  isExecuting: false,

  // Config actions
  loadConfig: async () => {
    try {
      const config = await window.api.config.load();
      // Restore output history from saved state
      const restoredOutput: OutputEntry[] = (config.savedState?.outputHistory || []).map(
        (entry: SerializedOutputEntry) => ({
          ...entry,
          timestamp: new Date(entry.timestamp),
        })
      );
      // Restore selected host IDs as a Set
      const restoredSelectedHostIds = new Set<string>(config.savedState?.selectedHostIds || []);

      // Restore expanded folders as a Set
      const restoredExpandedFolders = new Set<string>(config.savedState?.expandedFolders || []);

      // Get command from preset if one was selected
      const lastPreset = config.savedState?.lastPreset;
      const restoredCommand = lastPreset && config.presets?.[lastPreset]
        ? config.presets[lastPreset].commands
        : '';

      set({
        config,
        theme: config.theme,
        username: config.username || '',
        // Restore saved state if available
        hosts: config.savedState?.hosts?.map((h) => ({ ...h, status: 'idle' as ExecutionStatus })) || [],
        columns: config.savedState?.columns || ['Host_IP'],
        output: restoredOutput,
        selectedHostIds: restoredSelectedHostIds,
        expandedFolders: restoredExpandedFolders,
        selectedPreset: lastPreset || null,
        command: restoredCommand,
        lastSelectedSessionId: config.savedState?.lastSelectedSessionId || null,
      });
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  },

  saveConfig: async (updates) => {
    try {
      await window.api.config.save(updates);
      set((state) => ({
        config: state.config ? { ...state.config, ...updates } : null,
      }));
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  },

  setTheme: (theme) => {
    set({ theme });
    get().saveConfig({ theme });
  },

  setUsername: (username) => {
    set({ username });
    get().saveConfig({ username });
  },

  setPassword: (password) => {
    set({ password });
    // Don't persist password to config for security
  },

  // Host actions
  addHost: (ip, port) => {
    const id = `host-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    // Parse host:port format if provided
    const parsed = parseHostAndPort(ip);
    const finalHost = parsed.host;
    const finalPort = port !== undefined ? port : parsed.port;
    
    set((state) => ({
      hosts: [
        ...state.hosts,
        {
          id,
          ipAddress: finalHost,
          port: finalPort,
          variables: { Host_IP: finalHost },
          status: 'idle',
        },
      ],
    }));
  },

  removeHost: (id) => {
    set((state) => ({
      hosts: state.hosts.filter((h) => h.id !== id),
      selectedHostIds: new Set([...state.selectedHostIds].filter((hid) => hid !== id)),
    }));
  },

  updateHost: (id, updates) => {
    set((state) => ({
      hosts: state.hosts.map((h) => (h.id === id ? { ...h, ...updates } : h)),
    }));
  },

  updateHostVariable: (id, columnName, value) => {
    set((state) => {
      // Add column if it doesn't exist
      const columns = state.columns.includes(columnName)
        ? state.columns
        : [...state.columns, columnName];

      return {
        columns,
        hosts: state.hosts.map((h) =>
          h.id === id
            ? { ...h, variables: { ...h.variables, [columnName]: value } }
            : h
        ),
      };
    });
  },

  selectHost: (id, selected) => {
    set((state) => {
      const newSelected = new Set(state.selectedHostIds);
      if (selected) {
        newSelected.add(id);
      } else {
        newSelected.delete(id);
      }
      return { selectedHostIds: newSelected };
    });
  },

  selectAllHosts: (selected) => {
    set((state) => ({
      selectedHostIds: selected ? new Set(state.hosts.map((h) => h.id)) : new Set(),
    }));
  },

  setHostStatus: (id, status) => {
    set((state) => ({
      hosts: state.hosts.map((h) => (h.id === id ? { ...h, status } : h)),
    }));
  },

  clearHosts: () => {
    set({ hosts: [], selectedHostIds: new Set() });
  },

  importCsv: async () => {
    try {
      const filePath = await window.api.csv.showOpenDialog();
      if (!filePath) return;

      const { columns, rows } = await window.api.csv.import(filePath);

      const hosts: HostWithStatus[] = rows.map((row, index) => {
        // Parse host:port format from Host_IP if provided
        const parsed = parseHostAndPort(row.Host_IP || '');
        return {
          id: `host-${Date.now()}-${index}`,
          ipAddress: parsed.host,
          port: parsed.port,
          variables: { ...row, Host_IP: parsed.host },
          status: 'idle',
        };
      });

      set({ hosts, columns });
    } catch (error) {
      console.error('Failed to import CSV:', error);
    }
  },

  exportCsv: async () => {
    try {
      const { hosts, columns } = get();
      const filePath = await window.api.csv.showSaveDialog();
      if (!filePath) return;

      const rows = hosts.map((h) => h.variables);
      await window.api.csv.export(filePath, columns, rows);
    } catch (error) {
      console.error('Failed to export CSV:', error);
    }
  },

  addColumn: (columnName) => {
    set((state) => ({
      columns: state.columns.includes(columnName) ? state.columns : [...state.columns, columnName],
    }));
  },

  removeColumn: (columnName) => {
    set((state) => ({
      columns: state.columns.filter((c) => c !== columnName),
    }));
  },

  renameColumn: (oldName, newName) => {
    set((state) => ({
      columns: state.columns.map((c) => (c === oldName ? newName : c)),
    }));
  },

  reorderColumns: (columns) => {
    set({ columns });
  },

  // Preset actions
  loadPresets: async () => {
    try {
      const presets = await window.api.presets.getAll();
      set({ presets });
    } catch (error) {
      console.error('Failed to load presets:', error);
    }
  },

  selectPreset: (name) => {
    set({ selectedPreset: name });
    if (name) {
      const preset = get().presets[name];
      if (preset) {
        set({ command: preset.commands });
      }
    }
  },

  savePreset: async (name, preset) => {
    try {
      await window.api.presets.save(name, preset);
      set((state) => ({
        presets: { ...state.presets, [name]: preset },
      }));
    } catch (error) {
      console.error('Failed to save preset:', error);
    }
  },

  deletePreset: async (name) => {
    try {
      await window.api.presets.delete(name);
      set((state) => {
        const { [name]: _, ...rest } = state.presets;
        return {
          presets: rest,
          selectedPreset: state.selectedPreset === name ? null : state.selectedPreset,
        };
      });
    } catch (error) {
      console.error('Failed to delete preset:', error);
    }
  },

  addPresetFolder: (folderName) => {
    set((state) => ({
      presetFolders: state.presetFolders.includes(folderName)
        ? state.presetFolders
        : [...state.presetFolders, folderName],
    }));
  },

  removePresetFolder: (folderName) => {
    set((state) => ({
      presetFolders: state.presetFolders.filter((f) => f !== folderName),
    }));
  },

  renamePresetFolder: (oldName, newName) => {
    const { presets, presetFolders } = get();
    // Update folder name in all presets
    Object.entries(presets).forEach(([name, preset]) => {
      if (preset.folder === oldName) {
        get().savePreset(name, { ...preset, folder: newName });
      }
    });
    // Update folders array
    set({
      presetFolders: presetFolders.map((f) => (f === oldName ? newName : f)),
    });
  },

  movePresetToFolder: (presetName, folderName) => {
    const preset = get().presets[presetName];
    if (preset) {
      get().savePreset(presetName, { ...preset, folder: folderName });
    }
  },

  reorderPresets: (presetOrder) => {
    set({ presetOrder });
  },

  reorderFolders: (folderOrder) => {
    set({ folderOrder });
  },

  reorderSidebar: (sidebarOrder) => {
    set({ sidebarOrder });
  },

  toggleFolder: (folderName) => {
    set((state) => {
      const next = new Set(state.expandedFolders);
      if (next.has(folderName)) {
        next.delete(folderName);
      } else {
        next.add(folderName);
      }
      return { expandedFolders: next };
    });
  },

  setExpandedFolders: (folders) => {
    set({ expandedFolders: folders });
  },

  // Command actions
  setCommand: (command) => {
    set({ command });
  },

  // Output actions
  addOutput: (entry) => {
    const { currentSessionId, hostSessionMap } = get();
    // Use provided sessionId, then currentSessionId, then lookup by hostId, then fallback to new random
    const sessionId =
      entry.sessionId ||
      currentSessionId ||
      (entry.hostId ? hostSessionMap.get(entry.hostId) : null) ||
      `session-${Date.now()}`;
    const newEntry: OutputEntry = {
      ...entry,
      id: `output-${outputIdCounter++}`,
      sessionId,
      timestamp: new Date(),
    };
    set((state) => ({
      output: [...state.output, newEntry],
    }));
  },

  clearOutput: () => {
    set({ output: [] });
    // Also persist the cleared state
    get().saveOutputHistory();
  },

  saveOutputHistory: async () => {
    const { output, config } = get();
    if (!config) return;

    // Apply maxHistoryEntries limit - limit by number of SESSIONS, not individual entries
    const maxSessions = config.maxHistoryEntries || 30;

    // Group entries by sessionId and sort sessions by timestamp (most recent first)
    const sessionMap = new Map<string, OutputEntry[]>();
    for (const entry of output) {
      if (!sessionMap.has(entry.sessionId)) {
        sessionMap.set(entry.sessionId, []);
      }
      sessionMap.get(entry.sessionId)!.push(entry);
    }

    // Sort sessions by their first entry's timestamp (most recent first)
    const sortedSessions = [...sessionMap.entries()].sort((a, b) => {
      const aTime = a[1][0]?.timestamp?.getTime() || 0;
      const bTime = b[1][0]?.timestamp?.getTime() || 0;
      return bTime - aTime;
    });

    // Keep only the most recent sessions
    const sessionsToKeep = sortedSessions.slice(0, maxSessions);
    const sessionIdsToKeep = new Set(sessionsToKeep.map(([id]) => id));

    // Filter output to only include entries from sessions we're keeping
    const prunedOutput = output.filter((entry) => sessionIdsToKeep.has(entry.sessionId));

    // Update in-memory state if we pruned anything
    if (prunedOutput.length !== output.length) {
      set({ output: prunedOutput });
    }

    // Serialize for storage (convert Date to ISO string)
    const serializedOutput: SerializedOutputEntry[] = prunedOutput.map((entry) => ({
      id: entry.id,
      sessionId: entry.sessionId,
      hostId: entry.hostId,
      text: entry.text,
      type: entry.type,
      timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : entry.timestamp,
    }));

    // Save to config
    await get().saveConfig({
      savedState: {
        ...config.savedState,
        hosts: config.savedState?.hosts || [],
        columns: config.savedState?.columns || ['Host_IP'],
        commandHistory: config.savedState?.commandHistory || [],
        outputHistory: serializedOutput,
      },
    });
  },

  setLastSelectedSessionId: (sessionId) => {
    set({ lastSelectedSessionId: sessionId });
  },

  // Execution actions
  runCommand: async () => {
    const { hosts, selectedHostIds, command, config, username, password } = get();
    if (!command.trim()) return;

    // Only run on selected hosts - caller must ensure hosts are selected
    const hostsToRun = hosts.filter((h) => selectedHostIds.has(h.id));

    if (hostsToRun.length === 0) return;

    // Generate a new session ID for this execution
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Build host-to-session map for this execution so onComplete can find the right session
    const newHostSessionMap = new Map(get().hostSessionMap);
    hostsToRun.forEach((h) => newHostSessionMap.set(h.id, sessionId));

    set({ isExecuting: true, currentSessionId: sessionId, hostSessionMap: newHostSessionMap });

    // Reset all host statuses
    hostsToRun.forEach((h) => get().setHostStatus(h.id, 'connecting'));

    try {
      await window.api.ssh.executeOnHosts(
        hostsToRun.map((h) => ({
          id: h.id,
          ipAddress: h.ipAddress,
          port: h.port,
          username: h.username || username,
          password: h.password || password,
          variables: h.variables,
        })),
        command,
        (config?.timeout || 30) * 1000
      );
    } catch (error) {
      get().addOutput({ text: `Error: ${(error as Error).message}`, type: 'Error' });
    } finally {
      set({ isExecuting: false, currentSessionId: null });
      // Note: hostSessionMap is NOT cleared here - it persists until the next run
      // This allows onComplete events (which fire asynchronously) to still find the right session
      // Save output history after execution completes
      get().saveOutputHistory();
    }
  },

  cancelExecution: () => {
    window.api.ssh.cancelExecution();
    set({ isExecuting: false });
    get().addOutput({ text: 'Execution cancelled', type: 'Warning' });
    // Save output history after cancellation
    get().saveOutputHistory();
  },

  // State persistence
  saveState: async () => {
    const { hosts, columns, selectedPreset, selectedHostIds, expandedFolders, lastSelectedSessionId, config, output } = get();
    if (!config?.rememberState) return;

    // Apply maxHistoryEntries limit
    const maxEntries = config.maxHistoryEntries || 30;
    const entriesToSave = output.slice(-maxEntries);

    // Serialize output for storage
    const serializedOutput: SerializedOutputEntry[] = entriesToSave.map((entry) => ({
      id: entry.id,
      sessionId: entry.sessionId,
      hostId: entry.hostId,
      text: entry.text,
      type: entry.type,
      timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : String(entry.timestamp),
    }));

    // Save application state
    await get().saveConfig({
      savedState: {
        hosts: hosts.map(({ status, output, error, ...host }) => host),
        columns,
        commandHistory: [],
        lastPreset: selectedPreset || undefined,
        outputHistory: serializedOutput,
        selectedHostIds: [...selectedHostIds],
        expandedFolders: [...expandedFolders],
        lastSelectedSessionId: lastSelectedSessionId || undefined,
      },
    });
  },
}));

// Set up IPC listeners for SSH events
if (typeof window !== 'undefined' && window.api) {
  window.api.ssh.onOutput((_event, { hostId, output, type }) => {
    useAppStore.getState().addOutput({ hostId, text: output, type: (type as OutputEntry['type']) || 'CommandOutput' });
  });

  window.api.ssh.onProgress((_event, { hostId, status }) => {
    const statusMap: Record<string, ExecutionStatus> = {
      connecting: 'connecting',
      connected: 'running',
      running: 'running',
      success: 'success',
      error: 'error',
      disconnected: 'idle',
    };
    useAppStore.getState().setHostStatus(hostId, statusMap[status] || 'idle');
  });

  window.api.ssh.onComplete((_event, result) => {
    const status: ExecutionStatus = result.success ? 'success' : 'error';
    useAppStore.getState().setHostStatus(result.hostId, status);
    // Add error message if execution failed (connection errors come through here, not via onOutput)
    if (!result.success && result.errorMessage) {
      useAppStore.getState().addOutput({
        hostId: result.hostId,
        text: `Error: ${result.errorMessage}`,
        type: 'Error',
      });
    }
  });

  window.api.ssh.onColumnUpdate((_event, { hostId, columnName, value }) => {
    useAppStore.getState().updateHostVariable(hostId, columnName, value);
  });
}
