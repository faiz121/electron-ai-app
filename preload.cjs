const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script starting...');

// Create the API object
const api = {
    // Debug method
    ping: () => 'pong',
    
    // Chat related
    sendMessage: (message) => ipcRenderer.send('send-message', message),
    newChat: () => ipcRenderer.send('new-chat'),
    deleteChat: (chatId) => ipcRenderer.send('delete-chat', chatId),
    getChatList: () => ipcRenderer.send('get-chat-list'),
    loadChat: (chatId) => ipcRenderer.send('load-chat', chatId),
    
    // Text processing
    processText: (text, mode, chatId) => {
        console.log('processText called:', { text, mode, chatId });
        return ipcRenderer.send('process-text', { text, mode, chatId });
    },
    
    // Window controls
    closeApp: () => ipcRenderer.send('close-app'),
    minimizeApp: () => ipcRenderer.send('minimize-app'),
    hideMainWindow: () => ipcRenderer.send('hide-main-window'),
    showMainWindow: () => ipcRenderer.send('show-main-window'),
    
    // Popup specific
    resizePopup: (width, height) => {
        console.log('resizePopup called with:', width, height); // Debug log
        if (typeof width !== 'number' || typeof height !== 'number') {
            console.error('Invalid dimensions:', { width, height });
            return;
        }
        ipcRenderer.send('resize-popup', width, height);
    },
    
    // Document indexing and search
    indexDocumentsDirectory: () => ipcRenderer.invoke('index-documents-directory'),
    getLastIndexedDirectory: () => ipcRenderer.invoke('get-last-indexed-directory'),

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
    onIndexingStatus: (callback) => ipcRenderer.on('indexing-status', (_, status) => callback(status)),
    onAddUserMessage: (callback) => {
        ipcRenderer.on('add-user-message', (event, ...args) => callback(...args));
    },
    onShowLoading: (callback) => {
        ipcRenderer.on('show-loading', (event, ...args) => callback(...args));
    },
    onShowMainWindow: (callback) => {
        const wrappedCallback = (_, ...args) => callback(...args);
        ipcRenderer.on('show-main-window', wrappedCallback);
        return () => {
            ipcRenderer.removeListener('show-main-window', wrappedCallback);
        };
    },
    
    // Cleanup
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    },
    
    getFilePreview: (filePath) => ipcRenderer.invoke('get-file-preview', filePath),
    getCollectionStatus: () => ipcRenderer.invoke('get-collection-status'),

};

// Expose the API
try {
    contextBridge.exposeInMainWorld('electronAPI', api);
    console.log('electronAPI exposed successfully');
} catch (error) {
    console.error('Failed to expose electronAPI:', error);
}