import { IpcMain, dialog, BrowserWindow } from 'electron';
import { CsvManager } from '../services/CsvManager';

const csvManager = new CsvManager();

export function registerCsvHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    'csv:import',
    async (_event, filePath: string): Promise<{ columns: string[]; rows: Record<string, string>[] }> => {
      return csvManager.loadFromFile(filePath);
    }
  );

  ipcMain.handle(
    'csv:export',
    async (_event, filePath: string, columns: string[], rows: Record<string, string>[]): Promise<void> => {
      csvManager.saveToFile(filePath, columns, rows);
    }
  );

  ipcMain.handle('csv:showOpenDialog', async (event): Promise<string | null> => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window!, {
      title: 'Import CSV',
      filters: [
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle('csv:showSaveDialog', async (event, defaultName?: string): Promise<string | null> => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(window!, {
      title: 'Export CSV',
      defaultPath: defaultName || 'hosts.csv',
      filters: [
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    return result.filePath;
  });
}
