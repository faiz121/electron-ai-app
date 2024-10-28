const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
    'electronAPI',
    {
        // Chat related
        sendMessage: (message) => ipcRenderer.send('send-message', message),
        newChat: () => ipcRenderer.send('new-chat'),
        deleteChat: (chatId) => ipcRenderer.send('delete-chat', chatId),
        getChatList: () => ipcRenderer.send('get-chat-list'),
        loadChat: (chatId) => ipcRenderer.send('load-chat', chatId),
        processText: (text, mode, chatId) => 
          ipcRenderer.send('process-text', { text, mode, chatId }),        
        // Window controls
        closeApp: () => ipcRenderer.send('close-app'),
        minimizeApp: () => ipcRenderer.send('minimize-app'),
        hideMainWindow: () => ipcRenderer.send('hide-main-window'),
        showMainWindow: () => ipcRenderer.send('show-main-window'),
        
        // Document indexing and search
        indexDocumentsDirectory: () => ipcRenderer.invoke('index-documents-directory'),
        semanticSearch: (query) => ipcRenderer.invoke('semantic-search', query),
        showItemInFolder: (path) => ipcRenderer.invoke('show-item-in-folder', path),
        
        // Listeners
        onChatCreated: (callback) => {
            ipcRenderer.on('chat-created', (event, ...args) => callback(...args));
        },
        onChatDeleted: (callback) => {
            ipcRenderer.on('chat-deleted', (event, ...args) => callback(...args));
        },
        onChatList: (callback) => {
            ipcRenderer.on('chat-list', (event, ...args) => callback(...args));
        },
        onChatLoaded: (callback) => {
            ipcRenderer.on('chat-loaded', (event, ...args) => callback(...args));
        },
        onUpdateConversation: (callback) => {
            ipcRenderer.on('update-conversation', (event, ...args) => callback(...args));
        },
        onProcessingError: (callback) => {
            ipcRenderer.on('processing-error', (event, ...args) => callback(...args));
        },
        onIndexingStatus: (callback) => {
            ipcRenderer.on('indexing-status', (event, ...args) => callback(...args));
        },
        onAddUserMessage: (callback) => {
            ipcRenderer.on('add-user-message', (event, ...args) => callback(...args));
        },
        onShowLoading: (callback) => {
            ipcRenderer.on('show-loading', (event, ...args) => callback(...args));
        },
        
         // Popup specific methods
         resizePopup: (width, height) => 
          ipcRenderer.send('resize-popup', { width, height }),
      
      onShowMainWindow: (callback) => {
          ipcRenderer.on('show-main-window', (event, ...args) => callback(...args));
      },
        // Remove listeners (important for cleanup)
        removeAllListeners: (channel) => {
            ipcRenderer.removeAllListeners(channel);
        },
        getFilePreview: (filePath) => ipcRenderer.invoke('get-file-preview', filePath),

    }
);