import React, { useState, useEffect } from 'react';

const XIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  const [version, setVersion] = useState('1.0.0');

  useEffect(() => {
    if (isOpen) {
      window.api.app.getVersion().then(setVersion).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">About SSH Helper</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
          >
            <XIcon />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 text-center">
          <div className="mb-4">
            <svg className="w-16 h-16 mx-auto text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>

          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            SSH Helper
          </h3>

          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Version {version}
          </p>

          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            A tool for managing SSH connections and executing commands across multiple hosts.
          </p>

          <p className="text-xs text-gray-400 dark:text-gray-500">
            Electron Edition
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-center px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-6 py-2 text-sm bg-primary-600 text-white hover:bg-primary-700 rounded"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
