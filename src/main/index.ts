import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import * as path from 'path';
import { registerSshHandlers } from './ipc/ssh.ipc';
import { registerConfigHandlers } from './ipc/config.ipc';
import { registerPresetHandlers } from './ipc/presets.ipc';
import { registerCsvHandlers } from './ipc/csv.ipc';
import { registerFileHandlers } from './ipc/file.ipc';

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
    backgroundColor: '#ffffff',
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (isDev) {
    // Development: load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    // Uncomment to auto-open DevTools in development:
    // mainWindow.webContents.openDevTools();
  } else {
    // Production: load built files
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Register all IPC handlers
function registerIpcHandlers(): void {
  registerSshHandlers(ipcMain);
  registerConfigHandlers(ipcMain);
  registerPresetHandlers(ipcMain);
  registerCsvHandlers(ipcMain);
  registerFileHandlers(ipcMain);
}

// Create application menu
function createMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    // File menu
    {
      label: '&File',
      submenu: [
        {
          label: '&Open CSV...',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu-open-csv')
        },
        {
          label: '&Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu-save-csv')
        },
        {
          label: 'Save &As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow?.webContents.send('menu-save-csv-as')
        },
        { type: 'separator' },
        {
          label: 'E&xport All Presets...',
          click: () => mainWindow?.webContents.send('menu-export-presets')
        },
        {
          label: '&Import All Presets...',
          click: () => mainWindow?.webContents.send('menu-import-presets')
        },
        { type: 'separator' },
        {
          label: '&Settings...',
          click: () => mainWindow?.webContents.send('menu-settings')
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { label: 'E&xit', accelerator: 'Alt+F4', role: 'quit' }
      ]
    },
    // Edit menu
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: '&Find...',
          accelerator: 'CmdOrCtrl+F',
          click: () => mainWindow?.webContents.send('menu-find')
        },
        { type: 'separator' },
        {
          label: '&Debug Mode',
          type: 'checkbox',
          checked: false,
          click: (menuItem) => mainWindow?.webContents.send('menu-debug-mode', menuItem.checked)
        }
      ]
    },
    // View menu
    {
      label: '&View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    // Window menu
    {
      label: '&Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' } as Electron.MenuItemConstructorOptions,
              { role: 'front' } as Electron.MenuItemConstructorOptions
            ]
          : [{ role: 'close' } as Electron.MenuItemConstructorOptions])
      ]
    },
    // Help menu
    {
      label: '&Help',
      submenu: [
        {
          label: 'Check for &Updates...',
          click: () => mainWindow?.webContents.send('menu-check-updates')
        },
        { type: 'separator' },
        {
          label: '&About',
          click: () => mainWindow?.webContents.send('menu-about')
        }
      ]
    }
  ];

  // macOS: Add app menu
  if (isMac) {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createMenu();
  createWindow();

  app.on('activate', () => {
    // macOS: re-create window when dock icon clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // macOS: keep app running until explicitly quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
