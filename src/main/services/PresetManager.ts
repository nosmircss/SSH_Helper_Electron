import { EventEmitter } from 'events';
import { ConfigurationService } from './ConfigurationService';
import type { PresetInfo } from '../../shared/models';
import * as zlib from 'zlib';

/**
 * Preset manager for CRUD operations on command presets
 * Ported from: Services/PresetManager.cs
 */
export class PresetManager extends EventEmitter {
  private configService: ConfigurationService;

  constructor(configService: ConfigurationService) {
    super();
    this.configService = configService;
  }

  /**
   * Get all presets
   */
  getAll(): Record<string, PresetInfo> {
    const config = this.configService.load();
    return config.presets;
  }

  /**
   * Get a specific preset by name
   */
  get(name: string): PresetInfo | null {
    const presets = this.getAll();
    return presets[name] || null;
  }

  /**
   * Save a preset
   */
  save(name: string, preset: PresetInfo): void {
    this.configService.update('presets', (presets) => {
      return { ...presets, [name]: preset };
    });
    this.emit('presetsChanged');
  }

  /**
   * Delete a preset
   */
  delete(name: string): void {
    this.configService.update('presets', (presets) => {
      const { [name]: _, ...rest } = presets;
      return rest;
    });

    // Also remove from manual order
    this.configService.update('manualPresetOrder', (order) => {
      return order.filter((n) => n !== name);
    });

    this.emit('presetsChanged');
  }

  /**
   * Rename a preset
   */
  rename(oldName: string, newName: string): void {
    if (oldName === newName) return;

    const preset = this.get(oldName);
    if (!preset) return;

    this.configService.update('presets', (presets) => {
      const { [oldName]: _, ...rest } = presets;
      return { ...rest, [newName]: preset };
    });

    // Update manual order
    this.configService.update('manualPresetOrder', (order) => {
      return order.map((n) => (n === oldName ? newName : n));
    });

    this.emit('presetsChanged');
  }

  /**
   * Duplicate a preset
   */
  duplicate(name: string, newName: string): void {
    const preset = this.get(name);
    if (!preset) return;

    const duplicated: PresetInfo = {
      ...preset,
      isFavorite: false, // Don't copy favorite status
    };

    this.save(newName, duplicated);
  }

  /**
   * Check if preset exists
   */
  exists(name: string): boolean {
    return this.get(name) !== null;
  }

  /**
   * Toggle favorite status
   */
  toggleFavorite(name: string): void {
    const preset = this.get(name);
    if (!preset) return;

    this.save(name, { ...preset, isFavorite: !preset.isFavorite });
  }

  /**
   * Move preset to folder
   */
  moveToFolder(name: string, folder?: string): void {
    const preset = this.get(name);
    if (!preset) return;

    this.save(name, { ...preset, folder });
  }

  /**
   * Export presets to compressed base64 string
   */
  exportPresets(names: string[]): string {
    const presets = this.getAll();
    const toExport: Record<string, PresetInfo> = {};

    for (const name of names) {
      if (presets[name]) {
        toExport[name] = presets[name];
      }
    }

    const json = JSON.stringify(toExport);
    const compressed = zlib.gzipSync(Buffer.from(json, 'utf-8'));
    return compressed.toString('base64');
  }

  /**
   * Import presets from compressed base64 string
   */
  importPresets(data: string): string[] {
    try {
      const compressed = Buffer.from(data, 'base64');
      const json = zlib.gunzipSync(compressed).toString('utf-8');
      const imported = JSON.parse(json) as Record<string, PresetInfo>;

      const importedNames: string[] = [];
      const existingPresets = this.getAll();

      for (const [name, preset] of Object.entries(imported)) {
        // Generate unique name if exists
        let finalName = name;
        let counter = 1;
        while (existingPresets[finalName]) {
          finalName = `${name} (${counter})`;
          counter++;
        }

        this.save(finalName, preset);
        importedNames.push(finalName);
      }

      return importedNames;
    } catch {
      throw new Error('Invalid preset data format');
    }
  }

  /**
   * Get presets in a folder
   */
  getPresetsInFolder(folder?: string): Record<string, PresetInfo> {
    const presets = this.getAll();
    const result: Record<string, PresetInfo> = {};

    for (const [name, preset] of Object.entries(presets)) {
      if (preset.folder === folder) {
        result[name] = preset;
      }
    }

    return result;
  }

  /**
   * Get all folders
   */
  getFolders(): string[] {
    const presets = this.getAll();
    const folders = new Set<string>();

    for (const preset of Object.values(presets)) {
      if (preset.folder) {
        folders.add(preset.folder);
      }
    }

    return Array.from(folders);
  }

  /**
   * Apply default timeout to presets that don't have one
   */
  applyDefaults(defaultTimeout: number): void {
    const presets = this.getAll();
    let modified = false;

    for (const [name, preset] of Object.entries(presets)) {
      if (preset.timeout === undefined) {
        presets[name] = { ...preset, timeout: defaultTimeout };
        modified = true;
      }
    }

    if (modified) {
      this.configService.save({ presets });
    }
  }
}
