import React, { useState, useEffect, useRef } from 'react';
import { Command } from 'lucide-react';

const commands = [
  { key: 'ask', label: 'Ask', description: 'Ask a question' },
  { key: 'search', label: 'Search', description: 'Search through documents' },
  { key: 'summarize', label: 'Summarize', description: 'Summarize text' },
  { key: 'rewrite', label: 'Rewrite', description: 'Rewrite text' }
];

export default function CommandSearchBar({ onSubmit }) {
  const [inputValue, setInputValue] = useState('');
  const [showCommands, setShowCommands] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeCommand, setActiveCommand] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (showCommands) {
      window.electronAPI?.resizePopup(600, 320);
    } else {
      window.electronAPI?.resizePopup(600, 60);
    }
  }, [showCommands]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e) => {
    if (showCommands) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % commands.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + commands.length) % commands.length);
          break;
        case 'Enter':
          e.preventDefault();
          if (commands[selectedIndex]) {
            setActiveCommand(commands[selectedIndex]);
            setInputValue('');
            setShowCommands(false);
          }
          break;
        case 'Escape':
          setShowCommands(false);
          break;
      }
    } else if (e.key === 'Backspace' && inputValue === '' && activeCommand) {
      e.preventDefault();
      setActiveCommand(null);
    } else if (e.key === 'Enter' && inputValue.trim() !== '') {
      e.preventDefault();
      if (activeCommand) {
        onSubmit(inputValue.trim(), activeCommand.key);
      } else {
        onSubmit(inputValue.trim(), 'ask');
      }
      setInputValue('');
      setActiveCommand(null);
    }
  };

  const handleInput = (e) => {
    const value = e.target.value;
    console.log('Input value:', value); // Debug log
    setInputValue(value);
    
    if (value.startsWith('/')) {
      console.log('Showing commands'); // Debug log
      setShowCommands(true);
      setSelectedIndex(0);
    } else {
      setShowCommands(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Input container */}
      <div className="p-2">
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg border border-gray-700">
          {activeCommand && (
            <span className="flex items-center gap-1 bg-blue-500/20 text-blue-400 px-2 py-1 rounded text-sm">
              <Command className="w-3 h-3" />
              {activeCommand.label}
            </span>
          )}
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-none outline-none text-white text-sm placeholder-gray-400"
            placeholder="Type / for commands or start typing..."
            autoFocus
            autoComplete="off"
          />
        </div>
      </div>

      {/* Commands dropdown */}
      {showCommands && (
        <div className="flex-1 overflow-auto bg-gray-800 border-t border-gray-700">
          {commands.map((command, index) => (
            <div
              key={command.key}
              className={`flex items-center gap-2 px-4 py-3 hover:bg-gray-700 cursor-pointer transition-colors ${
                selectedIndex === index ? 'bg-gray-700' : ''
              }`}
              onClick={() => {
                setActiveCommand(command);
                setInputValue('');
                setShowCommands(false);
              }}
            >
              <Command className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <div className="flex flex-col min-w-0">
                <div className="text-sm text-white font-medium">{command.label}</div>
                <div className="text-xs text-gray-400">{command.description}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}