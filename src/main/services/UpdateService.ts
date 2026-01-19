import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';
import { BrowserWindow, app } from 'electron';
import log from 'electron-log';

export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  info?: UpdateInfo;
  progress?: ProgressInfo;
  error?: string;
}

export class UpdateService {
  private mainWindow: BrowserWindow | null = null;
  private isCheckingForUpdates = false;

  constructor() {
    // Configure logging
    autoUpdater.logger = log;

    // Configure auto-updater
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    this.setupEventListeners();
  }

  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
  }

  private setupEventListeners(): void {
    autoUpdater.on('checking-for-update', () => {
      this.sendStatusToRenderer({
        status: 'checking'
      });
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.isCheckingForUpdates = false;
      this.sendStatusToRenderer({
        status: 'available',
        info
      });
    });

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      this.isCheckingForUpdates = false;
      this.sendStatusToRenderer({
        status: 'not-available',
        info
      });
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.sendStatusToRenderer({
        status: 'downloading',
        progress
      });
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.sendStatusToRenderer({
        status: 'downloaded',
        info
      });
    });

    autoUpdater.on('error', (error: Error) => {
      this.isCheckingForUpdates = false;
      this.sendStatusToRenderer({
        status: 'error',
        error: error.message
      });
    });
  }

  private sendStatusToRenderer(status: UpdateStatus): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('update-status', status);
    }
  }

  async checkForUpdates(): Promise<void> {
    if (this.isCheckingForUpdates) {
      return;
    }

    this.isCheckingForUpdates = true;

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.isCheckingForUpdates = false;
      throw error;
    }
  }

  async downloadUpdate(): Promise<void> {
    await autoUpdater.downloadUpdate();
  }

  quitAndInstall(): void {
    autoUpdater.quitAndInstall(false, true);
  }

  getCurrentVersion(): string {
    return app.getVersion();
  }
}

// Singleton instance
export const updateService = new UpdateService();
