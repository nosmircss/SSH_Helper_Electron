import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { HostConnection, PresetInfo, AppConfiguration, ExecutionResult } from '../shared/models';

// Type-safe API exposed to renderer
export interface ElectronAPI {
  ssh: {
    connect: (host: HostConnection) => Promise<{ success: boolean; error?: string }>;
    disconnect: (hostId: string) => Promise<void>;
    execute: (hostId: string, command: string, timeout?: number) => Promise<ExecutionResult>;
    executeOnHosts: (hosts: HostConnection[], command: string, timeout?: number) => Promise<void>;
    cancelExecution: () => Promise<void>;
    setDebugMode: (enabled: boolean) => Promise<void>;
    onOutput: (callback: (event: IpcRendererEvent, data: { hostId: string; output: string; type?: string }) => void) => () => void;
    onProgress: (callback: (event: IpcRendererEvent, data: { hostId: string; status: string }) => void) => () => void;
    onComplete: (callback: (event: IpcRendererEvent, result: ExecutionResult) => void) => () => void;
    onColumnUpdate: (callback: (event: IpcRendererEvent, data: { hostId: string; columnName: string; value: string }) => void) => () => void;
  };
  config: {
    load: () => Promise<AppConfiguration>;
    save: (config: Partial<AppConfiguration>) => Promise<void>;
    getPath: () => Promise<string>;
  };
  presets: {
    getAll: () => Promise<Record<string, PresetInfo>>;
    get: (name: string) => Promise<PresetInfo | null>;
    save: (name: string, preset: PresetInfo) => Promise<void>;
    delete: (name: string) => Promise<void>;
    rename: (oldName: string, newName: string) => Promise<void>;
    duplicate: (name: string, newName: string) => Promise<void>;
    exportPresets: (names: string[]) => Promise<string>;
    importPresets: (data: string) => Promise<string[]>;
  };
  csv: {
    import: (filePath: string) => Promise<{ columns: string[]; rows: Record<string, string>[] }>;
    export: (filePath: string, columns: string[], rows: Record<string, string>[]) => Promise<void>;
    showOpenDialog: () => Promise<string | null>;
    showSaveDialog: (defaultName?: string) => Promise<string | null>;
  };
  app: {
    getVersion: () => Promise<string>;
    getPlatform: () => string;
  };
  file: {
    writeText: (filePath: string, content: string) => Promise<void>;
    readText: (filePath: string) => Promise<string>;
  };
  menu: {
    onOpenCsv: (callback: () => void) => () => void;
    onSaveCsv: (callback: () => void) => () => void;
    onSaveCsvAs: (callback: () => void) => () => void;
    onExportPresets: (callback: () => void) => () => void;
    onImportPresets: (callback: () => void) => () => void;
    onSettings: (callback: () => void) => () => void;
    onFind: (callback: () => void) => () => void;
    onDebugMode: (callback: (enabled: boolean) => void) => () => void;
    onCheckUpdates: (callback: () => void) => () => void;
    onAbout: (callback: () => void) => () => void;
  };
}

const api: ElectronAPI = {
  ssh: {
    connect: (host) => ipcRenderer.invoke('ssh:connect', host),
    disconnect: (hostId) => ipcRenderer.invoke('ssh:disconnect', hostId),
    execute: (hostId, command, timeout) => ipcRenderer.invoke('ssh:execute', hostId, command, timeout),
    executeOnHosts: (hosts, command, timeout) => ipcRenderer.invoke('ssh:executeOnHosts', hosts, command, timeout),
    cancelExecution: () => ipcRenderer.invoke('ssh:cancel'),
    setDebugMode: (enabled) => ipcRenderer.invoke('ssh:setDebugMode', enabled),
    onOutput: (callback) => {
      ipcRenderer.on('ssh:output', callback);
      return () => ipcRenderer.removeListener('ssh:output', callback);
    },
    onProgress: (callback) => {
      ipcRenderer.on('ssh:progress', callback);
      return () => ipcRenderer.removeListener('ssh:progress', callback);
    },
    onComplete: (callback) => {
      ipcRenderer.on('ssh:complete', callback);
      return () => ipcRenderer.removeListener('ssh:complete', callback);
    },
    onColumnUpdate: (callback) => {
      ipcRenderer.on('ssh:columnUpdate', callback);
      return () => ipcRenderer.removeListener('ssh:columnUpdate', callback);
    },
  },
  config: {
    load: () => ipcRenderer.invoke('config:load'),
    save: (config) => ipcRenderer.invoke('config:save', config),
    getPath: () => ipcRenderer.invoke('config:getPath'),
  },
  presets: {
    getAll: () => ipcRenderer.invoke('presets:getAll'),
    get: (name) => ipcRenderer.invoke('presets:get', name),
    save: (name, preset) => ipcRenderer.invoke('presets:save', name, preset),
    delete: (name) => ipcRenderer.invoke('presets:delete', name),
    rename: (oldName, newName) => ipcRenderer.invoke('presets:rename', oldName, newName),
    duplicate: (name, newName) => ipcRenderer.invoke('presets:duplicate', name, newName),
    exportPresets: (names) => ipcRenderer.invoke('presets:export', names),
    importPresets: (data) => ipcRenderer.invoke('presets:import', data),
  },
  csv: {
    import: (filePath) => ipcRenderer.invoke('csv:import', filePath),
    export: (filePath, columns, rows) => ipcRenderer.invoke('csv:export', filePath, columns, rows),
    showOpenDialog: () => ipcRenderer.invoke('csv:showOpenDialog'),
    showSaveDialog: (defaultName) => ipcRenderer.invoke('csv:showSaveDialog', defaultName),
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPlatform: () => process.platform,
  },
  file: {
    writeText: (filePath, content) => ipcRenderer.invoke('file:writeText', filePath, content),
    readText: (filePath) => ipcRenderer.invoke('file:readText', filePath),
  },
  menu: {
    onOpenCsv: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('menu-open-csv', handler);
      return () => ipcRenderer.removeListener('menu-open-csv', handler);
    },
    onSaveCsv: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('menu-save-csv', handler);
      return () => ipcRenderer.removeListener('menu-save-csv', handler);
    },
    onSaveCsvAs: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('menu-save-csv-as', handler);
      return () => ipcRenderer.removeListener('menu-save-csv-as', handler);
    },
    onExportPresets: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('menu-export-presets', handler);
      return () => ipcRenderer.removeListener('menu-export-presets', handler);
    },
    onImportPresets: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('menu-import-presets', handler);
      return () => ipcRenderer.removeListener('menu-import-presets', handler);
    },
    onSettings: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('menu-settings', handler);
      return () => ipcRenderer.removeListener('menu-settings', handler);
    },
    onFind: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('menu-find', handler);
      return () => ipcRenderer.removeListener('menu-find', handler);
    },
    onDebugMode: (callback) => {
      const handler = (_event: IpcRendererEvent, enabled: boolean) => callback(enabled);
      ipcRenderer.on('menu-debug-mode', handler);
      return () => ipcRenderer.removeListener('menu-debug-mode', handler);
    },
    onCheckUpdates: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('menu-check-updates', handler);
      return () => ipcRenderer.removeListener('menu-check-updates', handler);
    },
    onAbout: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('menu-about', handler);
      return () => ipcRenderer.removeListener('menu-about', handler);
    },
  },
};

contextBridge.exposeInMainWorld('api', api);

// Type declaration for renderer
declare global {
  interface Window {
    api: ElectronAPI;
  }
}
