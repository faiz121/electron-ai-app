import React from 'react';
import { createRoot } from 'react-dom/client';
import CommandSearchBar from './components/CommandSearchBar';

function PopupApp() {
  const handleSubmit = React.useCallback(async (text, mode) => {
    try {
      if (window.electronAPI) {
        // Process text first
        await window.electronAPI.processText(text, mode, null);
        // Then show main window
        window.electronAPI.showMainWindow();
      }
    } catch (error) {
      console.error('Error in handleSubmit:', error);
    }
  }, []);

  return (
    <div className="w-full bg-gray-800 rounded-lg">
      <CommandSearchBar onSubmit={handleSubmit} />
    </div>
  );
}

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('root');
  if (container) {
    const root = createRoot(container);
    root.render(
      <React.StrictMode>
        <PopupApp />
      </React.StrictMode>
    );
  }
});