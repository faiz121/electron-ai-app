import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { SearchResults } from './components/search';

document.addEventListener('DOMContentLoaded', () => {
  let processingText = false
  // DOM Elements
  const searchInput = document.getElementById('search-input');
  const submitButton = document.getElementById('submit-button');
  const modeSelect = document.getElementById('mode-select');
  const conversationArea = document.getElementById('conversation-area');
  const loadingIndicator = document.querySelector('.loading-dots');
  const closeButton = document.getElementById('close-button');
  const newChatBtn = document.getElementById('new-chat-btn');
  const chatList = document.getElementById('chat-list');
  const toggleSidebarBtn = document.getElementById('toggle-sidebar');
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('main-content');

  // State
  let currentChatId = null;

  const sidebarOpen = localStorage.getItem('sidebarOpen') === 'true';

  // Set initial state
  if (sidebarOpen) {
    sidebar.classList.add('open');
    mainContent.classList.add('sidebar-open');
  }

  // Close sidebar when clicking outside on mobile
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768) {  // Mobile breakpoint
      if (!sidebar.contains(e.target) && 
          !toggleSidebarBtn.contains(e.target) && 
          sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        mainContent.classList.remove('sidebar-open');
        localStorage.setItem('sidebarOpen', 'false');
      }
    }
  });

  // Create and add Index Documents button
  const indexDocsButton = document.createElement('button');
  indexDocsButton.textContent = 'Index Documents';
  indexDocsButton.classList.add('action-button');
  document.querySelector('#sidebar').insertBefore(indexDocsButton, chatList);

  // Add search option to mode select
  const searchOption = document.createElement('option');
  searchOption.value = 'search';
  searchOption.textContent = '🔍';
  modeSelect.appendChild(searchOption);

  // Functions
  function adjustTextareaHeight() {
    searchInput.style.height = 'auto';
    searchInput.style.height = Math.min(searchInput.scrollHeight, 200) + 'px';
  }

  function processText(text, mode) {
    if (processingText) return;

    try {
      processingText = true;
      console.log('Processing text:', { text, mode });
      window.electronAPI.processText(text, mode, currentChatId);
    } finally {
      processingText = false;
    }
  }


  function submitText() {
    const text = searchInput.value.trim();
    const mode = modeSelect.value;
    if (text !== '') {
      processText(text, mode);
      searchInput.value = '';
      adjustTextareaHeight();
    }
  }

  function addMessageToConversation(text, sender, mode) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', sender === 'user' ? 'user-message' : 'ai-message');
    
    const iconElement = document.createElement('div');
    iconElement.classList.add('message-icon');
    iconElement.innerHTML = `<svg><use xlink:href="#${sender === 'user' ? 'user-icon' : 'robot-icon'}"></use></svg>`;
    
    const contentElement = document.createElement('div');
    contentElement.classList.add('message-content');
    
    if (sender === 'ai') {
      if (mode === 'search') {
        const searchResultsContainer = document.createElement('div');
        contentElement.appendChild(searchResultsContainer);
        
        try {
          let searchData = typeof text === 'string' ? JSON.parse(text) : text;
          const results = searchData.results || [];
          const root = createRoot(searchResultsContainer);
          root.render(<SearchResults results={results} />);
        } catch (error) {
          console.error('Error rendering search results:', error);
          contentElement.textContent = text;
        }
      } else {
        contentElement.innerHTML = typeof text === 'string' ? text : JSON.stringify(text);
      }
    } else {
      contentElement.textContent = text;
    }
  
    // Add elements in the correct order based on sender
    if (sender === 'user') {
      messageElement.appendChild(contentElement);
      messageElement.appendChild(iconElement);
    } else {
      messageElement.appendChild(iconElement);
      messageElement.appendChild(contentElement);
    }
    
    conversationArea.appendChild(messageElement);
    conversationArea.scrollTop = conversationArea.scrollHeight;
  }

  function showLoadingIndicator() {
    // Remove any existing loading indicators first
    hideLoadingIndicator();

    const loadingElement = document.createElement('div');
    loadingElement.classList.add('loading-indicator');

    const iconElement = document.createElement('div');
    iconElement.classList.add('message-icon');
    iconElement.innerHTML = '<svg><use xlink:href="#robot-icon"></use></svg>';

    const dotsElement = document.createElement('div');
    dotsElement.classList.add('loading-dots');
    dotsElement.innerHTML = '<span></span><span></span><span></span>';

    loadingElement.appendChild(iconElement);
    loadingElement.appendChild(dotsElement);

    conversationArea.appendChild(loadingElement);
    conversationArea.scrollTop = conversationArea.scrollHeight;
  }

  function hideLoadingIndicator() {
    // Remove all loading indicators
    const loadingIndicators = conversationArea.querySelectorAll('.loading-indicator');
    loadingIndicators.forEach(indicator => indicator.remove());
  }

  function updateChatList() {
    window.electronAPI.getChatList();
  }

  function loadChat(chatId) {
    currentChatId = chatId;
    window.electronAPI.loadChat(chatId);
  }

  function deleteChat(chatId) {
    if (confirm('Are you sure you want to delete this chat?')) {
      window.electronAPI.deleteChat(chatId);
    }
  }

  // Event Listeners
  searchInput.addEventListener('input', adjustTextareaHeight);

  searchInput.addEventListener('keypress', (event) => {
    console.log('key pressed --->', event.key)
    if (event.key === 'Enter' && !event.shiftKey) {
      console.log('key pressed --->', event.key)
      event.preventDefault();
      if (!processingText) {
        console.log('processingText---->')
        submitText();
      }
    }
  });

  submitButton.addEventListener('click', submitText);

  closeButton.addEventListener('click', () => {
    window.electronAPI.hideMainWindow();
  });

  newChatBtn.addEventListener('click', () => {
    window.electronAPI.newChat();
    conversationArea.innerHTML = '';
  });

  toggleSidebarBtn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    mainContent.classList.toggle('sidebar-open');

    // Save state to localStorage
    localStorage.setItem('sidebarOpen', sidebar.classList.contains('open'));
  });

  indexDocsButton.addEventListener('click', async () => {
    try {
      indexDocsButton.disabled = true;
      indexDocsButton.textContent = 'Indexing...';

      const result = await window.electronAPI.indexDocumentsDirectory();

      if (result.success) {
        addMessageToConversation(
          `Successfully indexed ${result.results.success.length} documents.\n` +
          `Failed to index ${result.results.failed.length} documents.`,
          'ai',
          'system'
        );
      } else {
        addMessageToConversation(`Failed to index documents: ${result.error}`, 'ai', 'error');
      }
    } catch (error) {
      addMessageToConversation(`Error indexing documents: ${error.message}`, 'ai', 'error');
    } finally {
      indexDocsButton.disabled = false;
      indexDocsButton.textContent = 'Index Documents';
    }
  });

  // IPC Event Handlers
  window.electronAPI.onChatList((chats) => {
    chatList.innerHTML = '';
    chats.forEach((chat, index) => {
      const chatItem = document.createElement('div');
      chatItem.classList.add('chat-item');

      const chatTitle = document.createElement('span');
      chatTitle.textContent = chat.title || `Chat ${chats.length - index}`;
      chatTitle.style.flexGrow = '1';
      chatTitle.style.cursor = 'pointer';

      const deleteButton = document.createElement('button');
      deleteButton.textContent = '🗑️';
      deleteButton.classList.add('delete-chat');

      chatItem.appendChild(chatTitle);
      chatItem.appendChild(deleteButton);

      if (chat.id === currentChatId) {
        chatItem.classList.add('active');
      }

      chatItem.onclick = (e) => {
        if (e.target !== deleteButton) {
          loadChat(chat.id);
        }
      };

      deleteButton.onclick = (e) => {
        e.stopPropagation();
        deleteChat(chat.id);
      };

      chatList.appendChild(chatItem);
    });
  });

  // Handle window resize
  window.addEventListener('resize', () => {
    if (window.innerWidth <= 768) {  // Mobile breakpoint
      sidebar.classList.remove('open');
      mainContent.classList.remove('sidebar-open');
    }
  });

  // Update the event handlers
  window.electronAPI.onAddUserMessage((data) => {
    console.log('add-user-message');
    addMessageToConversation(data.text, 'user', data.mode);
    showLoadingIndicator();
  });

  window.electronAPI.onUpdateConversation((data) => {
    console.log('update-conversation', data);
    hideLoadingIndicator();
    addMessageToConversation(data.renderedText, 'ai', data.mode);
    updateChatList();
  });

  window.electronAPI.onChatCreated((newChat) => {
    currentChatId = newChat.id;
    conversationArea.innerHTML = '';
    updateChatList();
  });

  window.electronAPI.onChatDeleted((deletedChatId) => {
    if (currentChatId === deletedChatId) {
      conversationArea.innerHTML = '';
      currentChatId = null;
    }
    updateChatList();
  });

  window.electronAPI.onChatLoaded((chat) => {
    currentChatId = chat.id;
    conversationArea.innerHTML = '';
    chat.messages.forEach(msg => addMessageToConversation(msg.text, msg.sender, msg.mode));
    updateChatList();
    document.title = `Chat: ${chat.title}`;
  });

  window.electronAPI.onProcessingError((error) => {
    console.error('Processing error:', error);
    hideLoadingIndicator();
    addMessageToConversation(`Error: ${error}`, 'ai', 'error');
  });

  window.electronAPI.onShowLoading(() => {
    showLoadingIndicator();
  });

  window.electronAPI.onIndexingStatus((status) => {
    const statusElement = document.getElementById('indexingStatus') ||
      (() => {
        const el = document.createElement('div');
        el.id = 'indexingStatus';
        el.classList.add('status-message');
        document.body.appendChild(el);
        return el;
      })();

    statusElement.textContent = status;
    statusElement.style.display = status ? 'block' : 'none';
  });

  // Initial setup
  updateChatList();
  searchInput.focus();
});