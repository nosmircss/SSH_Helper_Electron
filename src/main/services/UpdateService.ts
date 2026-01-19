import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';
import { BrowserWindow, app } from 'electron';
import log from 'electron-log';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  info?: UpdateInfo;
  progress?: ProgressInfo;
  error?: string;
  isPortable?: boolean;
}

interface GitHubRelease {
  tag_name: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
  body?: string;
}

export class UpdateService {
  private mainWindow: BrowserWindow | null = null;
  private isCheckingForUpdates = false;
  private isPortable: boolean;
  private portableExePath: string | null = null;
  private downloadedUpdatePath: string | null = null;
  private latestReleaseInfo: GitHubRelease | null = null;

  // GitHub repo info - should match electron-builder.json
  private readonly githubOwner = 'nosmircss';
  private readonly githubRepo = 'SSH_Helper_Electron';

  constructor() {
    // Detect if running as portable
    // PORTABLE_EXECUTABLE_DIR is set by electron-builder when running portable exe
    this.isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR;

    if (this.isPortable) {
      this.portableExePath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
      log.info('Running in portable mode:', this.portableExePath);
    } else {
      log.info('Running in installed mode');
    }

    // Configure logging
    autoUpdater.logger = log;

    // Configure auto-updater (only used for installed version)
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    this.setupEventListeners();
  }

  getIsPortable(): boolean {
    return this.isPortable;
  }

  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
  }

  private setupEventListeners(): void {
    // These listeners are for the installed (NSIS) version
    autoUpdater.on('checking-for-update', () => {
      if (!this.isPortable) {
        this.sendStatusToRenderer({
          status: 'checking',
          isPortable: false
        });
      }
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.isCheckingForUpdates = false;
      if (!this.isPortable) {
        this.sendStatusToRenderer({
          status: 'available',
          info,
          isPortable: false
        });
      }
    });

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      this.isCheckingForUpdates = false;
      if (!this.isPortable) {
        this.sendStatusToRenderer({
          status: 'not-available',
          info,
          isPortable: false
        });
      }
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      if (!this.isPortable) {
        this.sendStatusToRenderer({
          status: 'downloading',
          progress,
          isPortable: false
        });
      }
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      if (!this.isPortable) {
        this.sendStatusToRenderer({
          status: 'downloaded',
          info,
          isPortable: false
        });
      }
    });

    autoUpdater.on('error', (error: Error) => {
      this.isCheckingForUpdates = false;
      if (!this.isPortable) {
        this.sendStatusToRenderer({
          status: 'error',
          error: error.message,
          isPortable: false
        });
      }
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

    if (this.isPortable) {
      await this.checkForPortableUpdates();
    } else {
      try {
        await autoUpdater.checkForUpdates();
      } catch (error) {
        this.isCheckingForUpdates = false;
        throw error;
      }
    }
  }

  private async checkForPortableUpdates(): Promise<void> {
    this.sendStatusToRenderer({
      status: 'checking',
      isPortable: true
    });

    try {
      const release = await this.fetchLatestRelease();
      this.latestReleaseInfo = release;

      const currentVersion = this.getCurrentVersion();
      const latestVersion = release.tag_name.replace(/^v/, '');

      log.info(`Portable update check: current=${currentVersion}, latest=${latestVersion}`);

      if (this.isNewerVersion(latestVersion, currentVersion)) {
        // Find the portable exe in assets
        // Matches: "SSH.Helper.Portable.x.x.x.exe" or "SSH.Helper.x.x.x.exe" (old)
        // Excludes: Setup files
        const portableAsset = release.assets.find(asset => {
          const name = asset.name.toLowerCase();
          if (!name.endsWith('.exe')) return false;
          if (name.includes('setup')) return false;
          // Match format with "Portable": SSH.Helper.Portable.x.x.x.exe
          if (asset.name.match(/SSH[. ]Helper[. ]Portable[. ][\d.]+\.exe$/i)) return true;
          // Match old format without "Portable": SSH.Helper.x.x.x.exe
          if (asset.name.match(/SSH\.Helper\.[\d.]+\.exe$/i)) return true;
          return false;
        });

        if (portableAsset) {
          const info: UpdateInfo = {
            version: latestVersion,
            releaseDate: new Date().toISOString(),
            files: [{
              url: portableAsset.browser_download_url,
              size: portableAsset.size,
              sha512: '' // GitHub doesn't provide this directly
            }],
            path: portableAsset.name,
            sha512: '',
            releaseName: release.tag_name,
            releaseNotes: release.body || ''
          };

          this.isCheckingForUpdates = false;
          this.sendStatusToRenderer({
            status: 'available',
            info,
            isPortable: true
          });
        } else {
          throw new Error('Portable executable not found in release assets');
        }
      } else {
        this.isCheckingForUpdates = false;
        this.sendStatusToRenderer({
          status: 'not-available',
          info: {
            version: currentVersion,
            releaseDate: new Date().toISOString(),
            files: [],
            path: '',
            sha512: ''
          },
          isPortable: true
        });
      }
    } catch (error) {
      this.isCheckingForUpdates = false;
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error('Portable update check failed:', message);
      this.sendStatusToRenderer({
        status: 'error',
        error: message,
        isPortable: true
      });
    }
  }

  private fetchLatestRelease(): Promise<GitHubRelease> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${this.githubOwner}/${this.githubRepo}/releases/latest`,
        method: 'GET',
        headers: {
          'User-Agent': `SSH-Helper/${this.getCurrentVersion()}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error('Failed to parse release data'));
            }
          } else if (res.statusCode === 404) {
            reject(new Error('No releases found'));
          } else {
            reject(new Error(`GitHub API error: ${res.statusCode}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.end();
    });
  }

  private isNewerVersion(latest: string, current: string): boolean {
    const latestParts = latest.split('.').map(Number);
    const currentParts = current.split('.').map(Number);

    for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
      const l = latestParts[i] || 0;
      const c = currentParts[i] || 0;
      if (l > c) return true;
      if (l < c) return false;
    }
    return false;
  }

  async downloadUpdate(): Promise<void> {
    if (this.isPortable) {
      await this.downloadPortableUpdate();
    } else {
      await autoUpdater.downloadUpdate();
    }
  }

  private async downloadPortableUpdate(): Promise<void> {
    if (!this.latestReleaseInfo) {
      throw new Error('No update info available. Please check for updates first.');
    }

    // Find the portable exe in assets (same logic as checkForPortableUpdates)
    const portableAsset = this.latestReleaseInfo.assets.find(asset => {
      const name = asset.name.toLowerCase();
      if (!name.endsWith('.exe')) return false;
      if (name.includes('setup')) return false;
      if (asset.name.match(/SSH[. ]Helper[. ]Portable[. ][\d.]+\.exe$/i)) return true;
      if (asset.name.match(/SSH\.Helper\.[\d.]+\.exe$/i)) return true;
      return false;
    });

    if (!portableAsset) {
      throw new Error('Portable executable not found in release');
    }

    // Download to temp directory
    const tempDir = app.getPath('temp');
    const downloadPath = path.join(tempDir, portableAsset.name);
    this.downloadedUpdatePath = downloadPath;

    log.info(`Downloading portable update to: ${downloadPath}`);

    return new Promise((resolve, reject) => {
      this.downloadFile(
        portableAsset.browser_download_url,
        downloadPath,
        portableAsset.size,
        (progress) => {
          this.sendStatusToRenderer({
            status: 'downloading',
            progress,
            isPortable: true
          });
        }
      ).then(() => {
        log.info('Portable update downloaded successfully');
        this.sendStatusToRenderer({
          status: 'downloaded',
          info: {
            version: this.latestReleaseInfo!.tag_name.replace(/^v/, ''),
            releaseDate: new Date().toISOString(),
            files: [],
            path: downloadPath,
            sha512: ''
          },
          isPortable: true
        });
        resolve();
      }).catch((error) => {
        log.error('Portable update download failed:', error);
        this.sendStatusToRenderer({
          status: 'error',
          error: error.message,
          isPortable: true
        });
        reject(error);
      });
    });
  }

  private downloadFile(
    url: string,
    destPath: string,
    totalSize: number,
    onProgress: (progress: ProgressInfo) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);
      let downloadedBytes = 0;
      const startTime = Date.now();

      const makeRequest = (requestUrl: string) => {
        const urlObj = new URL(requestUrl);
        const options = {
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          method: 'GET',
          headers: {
            'User-Agent': `SSH-Helper/${this.getCurrentVersion()}`
          }
        };

        const req = https.request(options, (res) => {
          // Handle redirects (GitHub uses these for asset downloads)
          if (res.statusCode === 302 || res.statusCode === 301) {
            const redirectUrl = res.headers.location;
            if (redirectUrl) {
              makeRequest(redirectUrl);
              return;
            }
          }

          if (res.statusCode !== 200) {
            file.close();
            fs.unlink(destPath, () => {});
            reject(new Error(`Download failed with status: ${res.statusCode}`));
            return;
          }

          res.on('data', (chunk: Buffer) => {
            downloadedBytes += chunk.length;
            const elapsedSeconds = (Date.now() - startTime) / 1000;
            const bytesPerSecond = downloadedBytes / elapsedSeconds;

            onProgress({
              total: totalSize,
              delta: chunk.length,
              transferred: downloadedBytes,
              percent: (downloadedBytes / totalSize) * 100,
              bytesPerSecond
            });
          });

          res.pipe(file);

          file.on('finish', () => {
            file.close();
            resolve();
          });
        });

        req.on('error', (error) => {
          file.close();
          fs.unlink(destPath, () => {});
          reject(error);
        });

        req.end();
      };

      makeRequest(url);
    });
  }

  quitAndInstall(): void {
    if (this.isPortable) {
      this.installPortableUpdate();
    } else {
      autoUpdater.quitAndInstall(false, true);
    }
  }

  private installPortableUpdate(): void {
    if (!this.downloadedUpdatePath || !this.portableExePath) {
      log.error('Cannot install: missing download path or portable exe path');
      return;
    }

    if (!fs.existsSync(this.downloadedUpdatePath)) {
      log.error('Downloaded update file not found:', this.downloadedUpdatePath);
      return;
    }

    log.info('Installing portable update...');
    log.info('Current exe:', this.portableExePath);
    log.info('New exe:', this.downloadedUpdatePath);

    // Create an updater batch script that:
    // 1. Waits for the current process to exit
    // 2. Deletes the old exe and copies new exe to same directory (with new version in filename)
    // 3. Starts the new exe
    // 4. Deletes itself
    const batchPath = path.join(app.getPath('temp'), 'ssh-helper-updater.bat');
    const oldExePath = this.portableExePath;
    const newExePath = this.downloadedUpdatePath;
    // Target is in the same directory as the old exe, but with the new exe's filename (includes new version)
    const targetExePath = path.join(path.dirname(oldExePath), path.basename(newExePath));

    // VBS path for cleanup in batch script
    const vbsPath = path.join(app.getPath('temp'), 'ssh-helper-updater.vbs');

    const batchContent = `@echo off
setlocal

set "OLD_EXE=${oldExePath.replace(/\\/g, '\\\\')}"
set "NEW_EXE=${newExePath.replace(/\\/g, '\\\\')}"
set "TARGET=${targetExePath.replace(/\\/g, '\\\\')}"
set "VBS_FILE=${vbsPath.replace(/\\/g, '\\\\')}"

:waitloop
timeout /t 1 /nobreak >nul
tasklist /FI "IMAGENAME eq ${path.basename(oldExePath)}" 2>nul | find /I "${path.basename(oldExePath)}" >nul
if not errorlevel 1 goto waitloop

del "%OLD_EXE%" >nul 2>&1
if exist "%OLD_EXE%" (
    timeout /t 2 /nobreak >nul
    del "%OLD_EXE%" >nul 2>&1
)

copy /Y "%NEW_EXE%" "%TARGET%" >nul
if errorlevel 1 (
    exit /b 1
)

start "" "%TARGET%"

del "%NEW_EXE%" >nul 2>&1
del "%VBS_FILE%" >nul 2>&1
(goto) 2>nul & del "%~f0"
`;

    try {
      fs.writeFileSync(batchPath, batchContent, 'utf8');
      log.info('Created updater script:', batchPath);

      // Start the batch script detached and hidden using wscript
      // windowsHide doesn't work reliably with cmd.exe, so we use a VBScript wrapper
      const vbsContent = `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """${batchPath.replace(/\\/g, '\\\\')}""", 0, False
`;
      fs.writeFileSync(vbsPath, vbsContent, 'utf8');
      log.info('Created VBS launcher:', vbsPath);

      const child = spawn('wscript.exe', [vbsPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.unref();

      log.info('Updater script started via VBS, quitting application...');

      // Quit the app to allow the updater to replace the exe
      app.quit();
    } catch (error) {
      log.error('Failed to create/run updater script:', error);
      this.sendStatusToRenderer({
        status: 'error',
        error: 'Failed to install update: ' + (error instanceof Error ? error.message : 'Unknown error'),
        isPortable: true
      });
    }
  }

  getCurrentVersion(): string {
    return app.getVersion();
  }
}

// Singleton instance
export const updateService = new UpdateService();
