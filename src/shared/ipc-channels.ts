/**
 * IPC Channel names - centralized for type safety
 */
export const IPC_CHANNELS = {
  // SSH operations
  SSH_CONNECT: 'ssh:connect',
  SSH_DISCONNECT: 'ssh:disconnect',
  SSH_EXECUTE: 'ssh:execute',
  SSH_EXECUTE_ON_HOSTS: 'ssh:executeOnHosts',
  SSH_CANCEL: 'ssh:cancel',
  SSH_OUTPUT: 'ssh:output',
  SSH_PROGRESS: 'ssh:progress',
  SSH_COMPLETE: 'ssh:complete',

  // Configuration
  CONFIG_LOAD: 'config:load',
  CONFIG_SAVE: 'config:save',
  CONFIG_GET_PATH: 'config:getPath',

  // Presets
  PRESETS_GET_ALL: 'presets:getAll',
  PRESETS_GET: 'presets:get',
  PRESETS_SAVE: 'presets:save',
  PRESETS_DELETE: 'presets:delete',
  PRESETS_RENAME: 'presets:rename',
  PRESETS_DUPLICATE: 'presets:duplicate',
  PRESETS_EXPORT: 'presets:export',
  PRESETS_IMPORT: 'presets:import',

  // CSV operations
  CSV_IMPORT: 'csv:import',
  CSV_EXPORT: 'csv:export',
  CSV_SHOW_OPEN_DIALOG: 'csv:showOpenDialog',
  CSV_SHOW_SAVE_DIALOG: 'csv:showSaveDialog',

  // App info
  APP_GET_VERSION: 'app:getVersion',
} as const;
