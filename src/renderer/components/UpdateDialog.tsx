import React, { useEffect, useState, useRef } from 'react';
import type { UpdateStatus, UpdateInfo, UpdateProgress } from '../../preload/index';

interface UpdateDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const GITHUB_REPO_URL = 'https://github.com/nosmircss/SSH_Helper_Electron';

export const UpdateDialog: React.FC<UpdateDialogProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<UpdateStatus['status']>('checking');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>('');

  // Resizable dialog state
  const [dialogSize, setDialogSize] = useState({ width: 480, height: 400 });
  const [isResizing, setIsResizing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const startPosRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  useEffect(() => {
    if (!isOpen) return;

    // Get current version
    window.api.app.getVersion().then(setCurrentVersion);

    // Listen for update status
    const cleanup = window.api.update.onStatus((updateStatus) => {
      setStatus(updateStatus.status);
      if (updateStatus.info) setUpdateInfo(updateStatus.info);
      if (updateStatus.progress) setProgress(updateStatus.progress);
      if (updateStatus.error) setError(updateStatus.error);
    });

    // Start checking for updates
    window.api.update.check().then((result) => {
      if (!result.success && result.error) {
        setError(result.error);
        setStatus('error');
      }
    });

    return cleanup;
  }, [isOpen]);

  // Handle resize mouse events
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startPosRef.current.x;
      const deltaY = e.clientY - startPosRef.current.y;

      setDialogSize({
        width: Math.max(400, Math.min(800, startPosRef.current.width + deltaX)),
        height: Math.max(300, Math.min(700, startPosRef.current.height + deltaY))
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: dialogSize.width,
      height: dialogSize.height
    };
  };

  const handleDownload = async () => {
    const result = await window.api.update.download();
    if (!result.success && result.error) {
      setError(result.error);
      setStatus('error');
    }
  };

  const handleInstall = () => {
    window.api.update.install();
  };

  const openReleaseNotes = () => {
    if (updateInfo?.version) {
      window.open(`${GITHUB_REPO_URL}/releases/tag/v${updateInfo.version}`, '_blank');
    } else {
      window.open(`${GITHUB_REPO_URL}/releases`, '_blank');
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const stripHtml = (html: string): string => {
    // Remove HTML tags and decode common entities
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\n\s*\n/g, '\n') // Remove multiple blank lines
      .trim();
  };

  const getReleaseNotes = (): string => {
    if (!updateInfo?.releaseNotes) return '';
    if (typeof updateInfo.releaseNotes === 'string') {
      return stripHtml(updateInfo.releaseNotes);
    }
    return updateInfo.releaseNotes.map(n => `${n.version}: ${stripHtml(n.note)}`).join('\n');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        ref={dialogRef}
        className="bg-white rounded-lg shadow-xl overflow-hidden flex flex-col relative"
        style={{
          width: dialogSize.width,
          height: status === 'available' ? dialogSize.height : 'auto',
          minHeight: 200
        }}
      >
        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Software Update</h2>
        </div>

        <div className="p-6 flex-1 overflow-auto">
          {status === 'checking' && (
            <div className="flex flex-col items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-gray-600">Checking for updates...</p>
            </div>
          )}

          {status === 'not-available' && (
            <div className="flex flex-col items-center py-8">
              <svg className="w-12 h-12 text-green-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-900 font-medium">You're up to date!</p>
              <p className="text-gray-500 text-sm mt-1">SSH Helper {currentVersion} is the latest version.</p>
            </div>
          )}

          {status === 'available' && updateInfo && (
            <div className="space-y-4 h-full flex flex-col">
              <div className="flex items-start space-x-4 flex-shrink-0">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-gray-900 font-medium">A new version is available!</h3>
                  <p className="text-gray-500 text-sm mt-1">
                    SSH Helper {updateInfo.version} is available. You have {currentVersion}.
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 flex-1 overflow-hidden flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2 flex-shrink-0">
                  <h4 className="text-sm font-medium text-gray-700">Release Notes:</h4>
                  <button
                    onClick={openReleaseNotes}
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                  >
                    <span>View on GitHub</span>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <pre className="text-sm text-gray-600 whitespace-pre-wrap font-sans">
                    {getReleaseNotes() || 'No release notes available.'}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {status === 'downloading' && progress && (
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                <span className="text-gray-900">Downloading update...</span>
              </div>
              <div className="space-y-2">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress.percent}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>{formatBytes(progress.transferred)} / {formatBytes(progress.total)}</span>
                  <span>{progress.percent.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          )}

          {status === 'downloaded' && (
            <div className="flex flex-col items-center py-8">
              <svg className="w-12 h-12 text-green-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-900 font-medium">Update downloaded!</p>
              <p className="text-gray-500 text-sm mt-1">
                The update will be installed when you restart the application.
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center py-8">
              <svg className="w-12 h-12 text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-900 font-medium">Update check failed</p>
              <div className="mt-2 w-full px-4">
                <pre className="text-gray-500 text-xs text-left bg-gray-100 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                  {error || 'An unknown error occurred'}
                </pre>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end space-x-3 flex-shrink-0">
          {status === 'available' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                Later
              </button>
              <button
                onClick={handleDownload}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
              >
                Download Update
              </button>
            </>
          )}

          {status === 'downloaded' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                Later
              </button>
              <button
                onClick={handleInstall}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
              >
                Restart & Install
              </button>
            </>
          )}

          {(status === 'checking' || status === 'not-available' || status === 'error' || status === 'downloading') && (
            <button
              onClick={onClose}
              disabled={status === 'downloading'}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
            >
              {status === 'downloading' ? 'Downloading...' : 'Close'}
            </button>
          )}
        </div>

        {/* Resize handle - only show when update is available */}
        {status === 'available' && (
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
            onMouseDown={handleResizeStart}
            style={{
              background: 'linear-gradient(135deg, transparent 50%, #9ca3af 50%)',
              borderBottomRightRadius: '0.5rem'
            }}
          />
        )}
      </div>
    </div>
  );
};
