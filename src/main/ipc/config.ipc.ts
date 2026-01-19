import { IpcMain, app } from 'electron';
import { ConfigurationService } from '../services/ConfigurationService';

let configService: ConfigurationService;

export function registerConfigHandlers(ipcMain: IpcMain): void {
  configService = new ConfigurationService();

  ipcMain.handle('config:load', async () => {
    return configService.load();
  });

  ipcMain.handle('config:save', async (_event, config) => {
    configService.save(config);
  });

  ipcMain.handle('config:getPath', async () => {
    return configService.getConfigPath();
  });

  ipcMain.handle('app:getVersion', async () => {
    return app.getVersion();
  });
}
