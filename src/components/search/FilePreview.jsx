import React, { useState, useEffect } from 'react';
import { FileText, Loader, XCircle, Maximize, Minimize } from 'lucide-react';

const FilePreview = ({ filePath, isExpanded }) => {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (isExpanded) {
      loadFilePreview();
    }
  }, [isExpanded, filePath]);

  const loadFilePreview = async () => {
    try {
      setLoading(true);
      const preview = await window.electronAPI.getFilePreview(filePath);
      setContent(preview);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isExpanded) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader className="w-6 h-6 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-400 p-4">
        <XCircle className="w-5 h-5" />
        <span>Failed to load preview: {error}</span>
      </div>
    );
  }

  const toggleFullscreen = () => {
    setFullscreen(!fullscreen);
  };

  return (
    <div className={`preview-container ${fullscreen ? 'fixed inset-0 z-50 bg-gray-900/95' : 'relative'}`}>
      <div className={`preview-content ${fullscreen ? 'p-8' : 'p-4'}`}>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            <span className="text-sm font-medium">File Preview</span>
          </div>
          <button
            onClick={toggleFullscreen}
            className="p-1 hover:bg-gray-700 rounded-lg transition-colors"
          >
            {fullscreen ? (
              <Minimize className="w-5 h-5 text-gray-400" />
            ) : (
              <Maximize className="w-5 h-5 text-gray-400" />
            )}
          </button>
        </div>
        
        <div className={`preview-scroll overflow-auto ${fullscreen ? 'h-[calc(100vh-8rem)]' : 'max-h-96'}`}>
          <pre className="text-sm font-mono whitespace-pre-wrap break-words text-gray-300">
            {content}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default FilePreview;