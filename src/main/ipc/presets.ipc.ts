import { IpcMain } from 'electron';
import { PresetManager } from '../services/PresetManager';
import { ConfigurationService } from '../services/ConfigurationService';
import type { PresetInfo } from '../../shared/models';

let presetManager: PresetManager;

export function registerPresetHandlers(ipcMain: IpcMain): void {
  const configService = new ConfigurationService();
  presetManager = new PresetManager(configService);

  ipcMain.handle('presets:getAll', async (): Promise<Record<string, PresetInfo>> => {
    return presetManager.getAll();
  });

  ipcMain.handle('presets:get', async (_event, name: string): Promise<PresetInfo | null> => {
    return presetManager.get(name);
  });

  ipcMain.handle('presets:save', async (_event, name: string, preset: PresetInfo): Promise<void> => {
    presetManager.save(name, preset);
  });

  ipcMain.handle('presets:delete', async (_event, name: string): Promise<void> => {
    presetManager.delete(name);
  });

  ipcMain.handle('presets:rename', async (_event, oldName: string, newName: string): Promise<void> => {
    presetManager.rename(oldName, newName);
  });

  ipcMain.handle('presets:duplicate', async (_event, name: string, newName: string): Promise<void> => {
    presetManager.duplicate(name, newName);
  });

  ipcMain.handle('presets:export', async (_event, names: string[]): Promise<string> => {
    return presetManager.exportPresets(names);
  });

  ipcMain.handle('presets:import', async (_event, data: string): Promise<string[]> => {
    return presetManager.importPresets(data);
  });
}
