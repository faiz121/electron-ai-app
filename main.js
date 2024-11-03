import 'dotenv/config';
import { app, screen, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage, shell, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { marked } from 'marked';
import qdrantService from './qdrantService.js';
import { promises as fsPromise } from 'fs';
import pdf from 'pdf-parse';
import Store from 'electron-store';

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('__dirname', __dirname)

const store = new Store({
  defaults: {
    lastIndexedDirectory: null
  }
});

let mainWindow;
let tray;
let popupWindow;
let chats = [];
let currentChatId = null;

// const openai = new OpenAI();

function createWindow() {
  mainWindow = new BrowserWindow({
      width: 800,
      height: 600,
      frame: false,
      titleBarStyle: 'hidden', // This hides the title bar but keeps the window controls on macOS
      webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, 'preload.cjs'), // Note the .cjs extension
          sandbox: false
      },
      backgroundColor: '#202123',
      show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('close', (event) => {
      if (!app.isQuitting) {
          event.preventDefault();
          mainWindow.hide();
      }
  });
}

// In main.js, update createPopupWindow
function createPopupWindow() {
  if (popupWindow) {
    return;
  }

  // Log the paths to debug
  console.log('Current directory:', __dirname);
  const preloadPath = path.join(__dirname, 'preload.cjs'); // Note the .cjs extension
  console.log('Preload path:', preloadPath);
  
  popupWindow = new BrowserWindow({
    width: 600,
    height: 60,
    frame: false,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      sandbox: false
    },
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    vibrancy: 'ultra-dark',
    visualEffectState: 'active',
    roundedCorners: true
  });

  // Add error handling for window loading
  popupWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load window:', errorCode, errorDescription);
  });

  popupWindow.loadFile(path.join(__dirname, 'popup.html'));

  // Add class to body when window loads
  popupWindow.webContents.on('did-finish-load', () => {
    console.log('Window loaded successfully');
    popupWindow.webContents.executeJavaScript(`
      document.body.classList.add('popup');
    `);
  });

  popupWindow.on('blur', () => {
    popupWindow.hide();
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  if (!fs.existsSync(iconPath)) {
    console.error('Tray icon not found:', iconPath);
    return;
  }
  
  const trayIcon = nativeImage.createFromPath(iconPath);
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Text Processor');
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show App', click: () => mainWindow.show() },
    { label: 'Quit', click: () => {
      app.isQuitting = true;
      app.quit();
    }}
  ]);
  
  tray.setContextMenu(contextMenu);
}

function togglePopup() {
  if (mainWindow && mainWindow.isVisible()) {
      mainWindow.focus();
  } else if (popupWindow) {
      if (popupWindow.isVisible()) {
          popupWindow.hide();
      } else {
          const position = getPopupPosition();
          popupWindow.setPosition(position.x, position.y, false);
          popupWindow.show();
          popupWindow.focus();
      }
  }
}

function getPopupPosition() {
  const screenBounds = screen.getPrimaryDisplay().workAreaSize;
  const windowBounds = popupWindow.getBounds();
  const x = Math.round(screenBounds.width / 2 - windowBounds.width / 2);
  const y = Math.round(screenBounds.height / 2 - windowBounds.height / 2);
  return { x, y };
}


async function askQuestion_llm_helper(content, prompt) {
  try {
  const url = "http://localhost:11434/api/generate"; // Updated endpoint URL

  const data = {
        "model": "llama3.2", // Specify the model
        "prompt": prompt, 
        "format": "json", // Request JSON output
        "stream": false,
      };
    
      const headers = {
        'Content-Type': 'application/json',
        mode: 'no-cors',  // Disables CORS checks
      };
    
        const response = await fetch(url, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(data)
        });
    
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
    
        const result = await response.json();
        console.log(result)
    
        // Extract the answer from the response JSON
        return result?.response ?? 'No answer received'; 
      
  } catch(e) {
    console.log('askQuestion_llm_helper error', e)
  }
}



// Replace the existing textProcessors object with this updated version
const textProcessors = {
  summarize: async (text) => {
    return processWithOpenAI(text, "Please summarize the following text:");
  },
  email: async (text) => {
    return processWithOpenAI(text, "Please rewrite the following email to improve its clarity and professionalism:");
  },
  qa: async (text) => {
    return processWithOpenAI(text, "Please answer the following question or respond to the statement:");
  },
  search: async (text) => {
    await qdrantService.initialize();
    const results = await qdrantService.searchSimilarDocuments(text);
    
    if (results.length === 0) {
      return JSON.stringify({ results: [] });
    }

    // The results already contain properly formatted content from qdrantService
    return JSON.stringify({
      results: results.map(result => ({
        filename: result.filename,
        directory: result.directory,
        path: result.path,
        relevantContent: result.relevantContent, // This now contains the properly extracted context
        score: result.score
      }))
    });
  }
};

async function processWithOpenAI(text, systemPrompt) {
  try {
      console.log('Attempting to process text with OpenAI...');
      const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini', // Change this to a model you have access to
          messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: text },
          ],
          max_tokens: 1000, // Adjust as needed
      });
      console.log('OpenAI response received successfully');
      return response.choices[0].message.content.trim();
  } catch (error) {
      console.error('Error processing text with OpenAI:', error);
      if (error.response) {
          console.error(error.response.status, error.response.data);
      }
      throw new Error(`Failed to process text with AI: ${error.message}`);
  }
}

async function customProcessor(text, mode) {
  console.log('text-------', text)
  console.log('mode-------', mode)
  let prompt = '';

  switch (mode) {
    case 'summarize':
      prompt = `Please summarize the following in clear, professional, and concise English. Avoid providing explanations about what was changed. For example, instead of saying, "I made these changes to improve clarity," simply provide the updated version.\n\n${text}`;
      break;
    case 'email':
      prompt = `Please rewrite the following in clear, professional, and concise English. Avoid providing explanations about what was changed. For example, instead of saying, "I made these changes to improve clarity," simply provide the updated version.\n\n${text}`;
      break;
    case 'qa':
      prompt = `Please answer the following question in clear, professional, and concise English. Avoid providing long and unnecessary explanations. Keep it to the point. Return the response like this {"response": "answer" }\n\n${text}`;
      break;
      case 'search':
      try {
        await qdrantService.initialize();
        const results = await qdrantService.searchSimilarDocuments(text);
        
        // Always return a valid JSON string
        return JSON.stringify({
          results: Array.isArray(results) ? results : []
        });
      } catch (error) {
        console.error('Error in search mode:', error);
        return JSON.stringify({ 
          results: [],
          error: error.message 
        });
      }
      
    default:
      prompt = text; // Use the text as is if mode is not recognized
  }

  try {
    const response = await askQuestion_llm_helper(text, prompt); // Assuming you want to use the same context
    console.log('response------->', response)
    const parsedResponse = (typeof(response) === 'string') ? JSON.parse(response) : response
    if(mode === 'qa') return parsedResponse.response
    return parsedResponse;
  } catch (error) {
    console.error('Error processing text with custom processor:', error);
    throw new Error(`Failed to process text: ${error.message}`);
  }
}
async function getChatTitle(text) {
  const prompt = `Please provide a concise title for this text in no more than 5 words, answer exactly with what is asked and do not add any additional details to the response:\n\n${text}`;

  try {
    const title = await askQuestion_llm_helper(text, prompt);
    return title.trim(); // Trim any extra spaces
  } catch (error) {
    console.error('Error getting chat title:', error);
    return 'New Chat'; // Default title if error occurs
  }
}

function createNewChat() {
  const newChat = {
      id: Date.now().toString(),
      title: `Chat ${chats.length + 1}`,
      messages: []
  };
  chats.unshift(newChat);
  currentChatId = newChat.id;
  saveChats();
  return newChat;
}

function saveChats() {
  const userDataPath = app.getPath('userData');
  const chatsPath = path.join(userDataPath, 'chats.json');
  fs.writeFileSync(chatsPath, JSON.stringify(chats));
}

function loadChats() {
  const userDataPath = app.getPath('userData');
  const chatsPath = path.join(userDataPath, 'chats.json');
  if (fs.existsSync(chatsPath)) {
      const data = fs.readFileSync(chatsPath, 'utf-8');
      chats = JSON.parse(data);
  }
  if (chats.length === 0) {
      createNewChat();
  }
}

function deleteChat(chatId) {
  const index = chats.findIndex(chat => chat.id === chatId);
  if (index !== -1) {
      chats.splice(index, 1);
      saveChats();
  }
}


app.whenReady().then(async () => {
  try {
    await handleStartup();
    loadChats();
    if (chats.length === 0) {
      createNewChat();
    }
    currentChatId = chats[0].id;
    createWindow();
    createPopupWindow();
    createTray();

    globalShortcut.register('CommandOrControl+Shift+A', togglePopup);

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (error) {
    console.error('Failed to initialize app:', error);
    app.quit();
  }
}).catch(error => {
  console.error('Failed to start app:', error);
  app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('new-chat', (event) => {
  const newChat = createNewChat();
  event.reply('chat-created', newChat);
  event.reply('chat-list', chats);
});

ipcMain.on('delete-chat', (event, chatId) => {
  deleteChat(chatId);
  event.reply('chat-deleted', chatId);
});

ipcMain.on('get-chat-list', (event) => {
  event.reply('chat-list', chats); // chats are already in the correct order
});

ipcMain.on('load-chat', (event, chatId) => {
  const chat = chats.find(c => c.id === chatId);
  if (chat) {
      currentChatId = chatId;
      event.reply('chat-loaded', chat);
  } else {
      console.error(`Chat with id ${chatId} not found`);
      event.reply('chat-load-error', `Chat not found`);
  }
});


ipcMain.on('process-text', async (event, { text, mode, chatId }) => {
  if (popupWindow) {
    popupWindow.hide();
  }
  mainWindow.show();
  mainWindow.focus();
  
  try {
    if (!chatId || !chats.find(c => c.id === chatId)) {
      const newChat = createNewChat();
      chatId = newChat.id;
      mainWindow.webContents.send('chat-loaded', newChat);
    }

    const chat = chats.find(c => c.id === chatId);
    chat.messages.push({ text, sender: 'user', mode });
    mainWindow.webContents.send('add-user-message', { text, mode });

    // Use the appropriate text processor
    // const processor = textProcessors[mode] || textProcessors.qa;
    const processedText = await customProcessor(text, mode)
    console.log('processedText------', processedText)
    // const processedText = await processor(text);

    // Log the results for debugging
    if (mode === 'search') {
      console.log('Search results:', JSON.parse(processedText));
    }

    if (chat) {
      const chatTitle = await getChatTitle(text);
      chat.title = chatTitle;
      saveChats();
      mainWindow.webContents.send('chat-title-updated', { chatId, title: chatTitle });
    }

    chat.messages.push({ 
      text: processedText, 
      sender: 'ai', 
      mode 
    });
    saveChats();
    
    mainWindow.webContents.send('update-conversation', { 
      originalText: text, 
      renderedText: processedText, 
      mode, 
      chatId 
    });
  } catch (error) {
    console.error('Error processing text:', error);
    mainWindow.webContents.send('processing-error', error.message || 'An error occurred while processing the text');
  }
});

ipcMain.on('get-history', (event) => {
  event.reply('history', history);
});

ipcMain.on('close-app', () => {
  mainWindow.hide();
});

ipcMain.on('minimize-app', () => {
  mainWindow.minimize();
});

ipcMain.on('expand-popup', () => {
  popupWindow.hide();
  mainWindow.show();
});

ipcMain.on('resize-popup', (event, width, height) => {
  console.log('Resize event received:', { width, height }); // Debug log
  if (popupWindow && typeof width === 'number' && typeof height === 'number') {
    try {
      popupWindow.setSize(Math.round(width), Math.round(height));
      console.log('Window resized successfully');
    } catch (error) {
      console.error('Error resizing window:', error);
    }
  } else {
    console.error('Invalid resize parameters:', { width, height });
  }
});

ipcMain.on('hide-main-window', () => {
  mainWindow.hide();
  if (popupWindow) {
      popupWindow.hide();
  }
});

ipcMain.on('show-main-window', () => {
  mainWindow.show();
  mainWindow.focus();
});

ipcMain.handle('index-documents-directory', async (event) => {
  try {
    await qdrantService.initialize();
    
    // Show directory selection dialog
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Directory to Index',
      buttonLabel: 'Index This Folder',
      message: 'Choose a folder containing the documents you want to index'
    });

    if (result.canceled) {
      return {
        success: false,
        canceled: true
      };
    }

    const documentsPath = result.filePaths[0];
    console.log('Selected directory:', documentsPath);

    const updateStatus = (status) => {
      mainWindow.webContents.send('indexing-status', status);
    };
    
    const results = await qdrantService.indexDocumentsDirectory(documentsPath, updateStatus);
    
    // Store the last indexed directory
    store.set('lastIndexedDirectory', documentsPath);
    
    return {
      success: true,
      results,
      path: documentsPath
    };
  } catch (error) {
    console.error('Error indexing documents:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Add handler to get last indexed directory
ipcMain.handle('get-last-indexed-directory', () => {
  return store.get('lastIndexedDirectory');
});

ipcMain.handle('show-item-in-folder', async (event, filePath) => {
  try {
    // Show the file in file explorer/finder
    await shell.showItemInFolder(filePath);
    return true;
  } catch (error) {
    console.error('Error showing file:', error);
    throw error;
  }
});

async function reindexFile(filePath) {
  try {
      console.log(`Reindexing file: ${filePath}`);
      await qdrantService.processFile(filePath, (status) => console.log(status));
      console.log('Reindexing complete');
      return true;
  } catch (error) {
      console.error('Reindexing failed:', error);
      return false;
  }
}

// Add IPC handler for reindexing
ipcMain.handle('reindex-file', async (event, filePath) => {
  return await reindexFile(filePath);
});


// Add this IPC handler
ipcMain.handle('get-file-preview', async (event, filePath) => {
  try {
    const extension = path.extname(filePath).toLowerCase();
    
    // Handle different file types
    switch (extension) {
      case '.pdf':
        const buffer = await fsPromise.readFile(filePath);
        const pdfData = await pdf(buffer);
        return pdfData.text;
        
      case '.txt':
      case '.md':
      case '.json':
      case '.js':
      case '.jsx':
      case '.ts':
      case '.tsx':
      case '.css':
      case '.html':
        const content = await fsPromise.readFile(filePath, 'utf-8');
        return content;
        
      default:
        throw new Error('File type not supported for preview');
    }
  } catch (error) {
    console.error('Error getting file preview:', error);
    throw error;
  }
});

ipcMain.handle('get-collection-status', async () => {
  try {
    const needsIndexing = await qdrantService.needsIndexing();
    const collectionInfo = await qdrantService.client.getCollection(qdrantService.collectionName);
    return {
      needsIndexing,
      pointsCount: collectionInfo.points_count,
      indexedVectorsCount: collectionInfo.indexed_vectors_count
    };
  } catch (error) {
    console.error('Error getting collection status:', error);
    return { error: error.message };
  }
});

// Add this method to the main.js file to handle startup
async function handleStartup() {
  try {
    await qdrantService.initialize();
    
    // Check if documents need to be indexed
    const needsIndexing = await qdrantService.needsIndexing();
    if (needsIndexing) {
      console.log('Documents need to be indexed on startup');
      // You could optionally auto-index here:
      // const documentsPath = '/Users/mohammedfaizulislam/Documents/vectordocs';
      // await qdrantService.indexDocumentsDirectory(documentsPath);
    }
  } catch (error) {
    console.error('Error during startup:', error);
  }
}