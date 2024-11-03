import React from 'react';
import { createRoot } from 'react-dom/client';
import CommandSearchBar from './components/CommandSearchBar';

function PopupApp() {
  const handleResize = React.useCallback(() => {
    const root = document.getElementById('root');
    if (root) {
      const height = root.getBoundingClientRect().height;
      // Now correctly passing the dimensions object
      window.electronAPI?.resizePopup({
        width: 600,
        height: Math.round(height + 16)
      });
    }
  }, []);

  React.useEffect(() => {
    // Initial resize
    handleResize();

    // Set up resize observer
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(handleResize);
    });
    
    const root = document.getElementById('root');
    if (root) {
      resizeObserver.observe(root);
    }

    // Cleanup observer on unmount
    return () => {
      resizeObserver.disconnect();
    };
  }, [handleResize]);

  const handleSubmit = React.useCallback((text, mode) => {
    if (window.electronAPI) {
      window.electronAPI.processText(text, mode, null);
      window.electronAPI.hideMainWindow();
    }
  }, []);

  return (
    <div className="h-full w-full bg-gray-800 rounded-lg">
      <div className="p-2">
        <CommandSearchBar 
          onSubmit={handleSubmit}
        />
      </div>
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