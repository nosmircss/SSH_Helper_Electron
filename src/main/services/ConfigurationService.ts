import Store from 'electron-store';
import { app } from 'electron';
import * as path from 'path';
import type { AppConfiguration } from '../../shared/models';
import { DEFAULT_CONFIG } from '../../shared/models';

/**
 * Configuration service for persisting app settings
 * Ported from: Services/ConfigurationService.cs
 */
export class ConfigurationService {
  private store: Store<AppConfiguration>;
  private cachedConfig: AppConfiguration | null = null;

  constructor() {
    this.store = new Store<AppConfiguration>({
      name: 'config',
      defaults: DEFAULT_CONFIG,
    });
  }

  /**
   * Get the configuration file path
   */
  getConfigPath(): string {
    return path.join(app.getPath('userData'), 'config.json');
  }

  /**
   * Load configuration (with caching)
   */
  load(): AppConfiguration {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    // Get all values and merge with defaults
    const config: AppConfiguration = {
      ...DEFAULT_CONFIG,
      presets: this.store.get('presets', DEFAULT_CONFIG.presets),
      username: this.store.get('username', DEFAULT_CONFIG.username),
      timeout: this.store.get('timeout', DEFAULT_CONFIG.timeout),
      connectionTimeout: this.store.get('connectionTimeout', DEFAULT_CONFIG.connectionTimeout),
      windowState: this.store.get('windowState', DEFAULT_CONFIG.windowState),
      presetSortMode: this.store.get('presetSortMode', DEFAULT_CONFIG.presetSortMode),
      manualPresetOrder: this.store.get('manualPresetOrder', DEFAULT_CONFIG.manualPresetOrder),
      presetFolders: this.store.get('presetFolders', DEFAULT_CONFIG.presetFolders),
      manualPresetOrderByFolder: this.store.get('manualPresetOrderByFolder', DEFAULT_CONFIG.manualPresetOrderByFolder),
      manualFolderOrder: this.store.get('manualFolderOrder', DEFAULT_CONFIG.manualFolderOrder),
      updateSettings: this.store.get('updateSettings', DEFAULT_CONFIG.updateSettings),
      rememberState: this.store.get('rememberState', DEFAULT_CONFIG.rememberState),
      savedState: this.store.get('savedState') || DEFAULT_CONFIG.savedState,
      maxHistoryEntries: this.store.get('maxHistoryEntries', DEFAULT_CONFIG.maxHistoryEntries),
      theme: this.store.get('theme', DEFAULT_CONFIG.theme),
    };

    this.cachedConfig = config;
    return config;
  }

  /**
   * Save configuration (partial update)
   */
  save(config: Partial<AppConfiguration>): void {
    for (const [key, value] of Object.entries(config)) {
      this.store.set(key, value);
    }

    // Invalidate cache
    this.cachedConfig = null;
  }

  /**
   * Update specific field with callback
   */
  update<K extends keyof AppConfiguration>(key: K, updater: (value: AppConfiguration[K]) => AppConfiguration[K]): void {
    const current = this.store.get(key) as AppConfiguration[K];
    const updated = updater(current);
    this.store.set(key, updated);
    this.cachedConfig = null;
  }

  /**
   * Get current cached config (or load if not cached)
   */
  getCurrent(): AppConfiguration {
    return this.cachedConfig || this.load();
  }

  /**
   * Reset to defaults
   */
  reset(): void {
    this.store.clear();
    this.cachedConfig = null;
  }
}
