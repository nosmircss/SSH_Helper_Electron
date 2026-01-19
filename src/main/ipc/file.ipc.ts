import { IpcMain } from 'electron';
import * as fs from 'fs/promises';

export function registerFileHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('file:writeText', async (_event, filePath: string, content: string) => {
    await fs.writeFile(filePath, content, 'utf-8');
  });

  ipcMain.handle('file:readText', async (_event, filePath: string) => {
    return await fs.readFile(filePath, 'utf-8');
  });
}
