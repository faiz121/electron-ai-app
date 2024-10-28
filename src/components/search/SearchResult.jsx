import React, { useState } from 'react';
import { FileText, FolderOpen, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import FilePreview from './FilePreview';

const SearchResult = ({ result }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const score = Math.round(result.score * 100);

  const openInFinder = async (e) => {
    e.stopPropagation();
    try {
      await window.electronAPI.showItemInFolder(result.path);
    } catch (error) {
      console.error('Error opening file:', error);
    }
  };

  const renderContent = () => {
    if (!result.relevantContent || typeof result.relevantContent !== 'object') {
      return <p className="text-gray-400">No preview available</p>;
    }

    const { text, highlights } = result.relevantContent;
    
    if (!text || text === 'No matching content found') {
      return <p className="text-gray-400">No matching content found</p>;
    }

    let highlightedText = text;
    if (highlights && Array.isArray(highlights)) {
      highlights.forEach(term => {
        if (!term) return;
        
        const variations = [
          term,
          `Dr. ${term}`,
          `Dr ${term}`,
          `Doctor ${term}`
        ];
        
        variations.forEach(variant => {
          const regex = new RegExp(`(${variant})`, 'gi');
          highlightedText = highlightedText.replace(regex, '<span class="text-yellow-400">$1</span>');
        });
      });
    }

    return (
      <p 
        className="text-gray-300 text-sm mt-1"
        dangerouslySetInnerHTML={{ __html: highlightedText }}
      />
    );
  };

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      <div 
        className="p-4 cursor-pointer hover:bg-gray-750 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-blue-400" />
            <h3 className="text-blue-400 font-medium text-lg">
              {result.filename}
            </h3>
            <span className="text-gray-400 text-sm">
              ({score}% match)
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              onClick={openInFinder}
              className="p-1 hover:bg-gray-700 rounded transition-colors"
              title="Open in Finder"
            >
              <ExternalLink className="w-4 h-4 text-gray-400 hover:text-blue-400" />
            </button>
            {isExpanded ? 
              <ChevronDown className="w-5 h-5 text-gray-400" /> : 
              <ChevronRight className="w-5 h-5 text-gray-400" />
            }
          </div>
        </div>

        <div className="flex items-center mt-1 mb-2">
          <FolderOpen className="w-4 h-4 text-gray-400 mr-1" />
          <span className="text-gray-400 text-xs">
            {result.directory}
          </span>
        </div>

        <div className="mt-2">
          <span className="text-emerald-400 text-sm font-medium">
            Matching text:
          </span>
          {renderContent()}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-700">
          <FilePreview 
            filePath={result.path}
            isExpanded={isExpanded}
          />
        </div>
      )}
    </div>
  );
};

export default SearchResult;