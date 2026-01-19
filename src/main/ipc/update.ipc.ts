import { ipcMain } from 'electron';
import { updateService } from '../services/UpdateService';

export function registerUpdateHandlers(): void {
  ipcMain.handle('update:check', async () => {
    try {
      await updateService.checkForUpdates();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('update:download', async () => {
    try {
      await updateService.downloadUpdate();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('update:install', () => {
    try {
      updateService.quitAndInstall();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('update:get-version', () => {
    return updateService.getCurrentVersion();
  });

  ipcMain.handle('update:is-portable', () => {
    return updateService.getIsPortable();
  });
}
