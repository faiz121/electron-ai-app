const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
require('dotenv').config();

let mainWindow;
let tray;
let popupWindow;
let chats = [];
let currentChatId = null;

const openai = new OpenAI();

function createNewChat() {
  const newChat = {
      id: Date.now().toString(),
      title: `New Chat`,
      messages: []
  };
  chats.unshift(newChat); // Add new chat to the beginning of the array
  currentChatId = newChat.id;
  saveChats();
  return newChat;
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            preload: path.join(__dirname, 'preload.js')
        },
        backgroundColor: '#202123',
        show: false
    });

    mainWindow.loadFile('index.html');

    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

function createPopupWindow() {
  if (popupWindow) {
      return;
  }
  popupWindow = new BrowserWindow({
      width: 600,
      height: 60,
      frame: false,
      show: false,
      alwaysOnTop: true,
      webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          preload: path.join(__dirname, 'preload.js')
      },
      transparent: true,
      backgroundColor: '#00000000'
  });

  popupWindow.loadFile('popup.html');

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
  const screenBounds = require('electron').screen.getPrimaryDisplay().workAreaSize;
  const windowBounds = popupWindow.getBounds();
  const x = Math.round(screenBounds.width / 2 - windowBounds.width / 2);
  const y = Math.round(screenBounds.height / 2 - windowBounds.height / 2);
  return { x, y };
}


const textProcessors = {
  summarize: async (text) => {
      return processWithOpenAI(text, "Please summarize the following text:");
  },
  email: async (text) => {
      return processWithOpenAI(text, "Please rewrite the following email to improve its clarity and professionalism:");
  },
  qa: async (text) => {
      return processWithOpenAI(text, "Please answer the following question or respond to the statement:");
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

// Example of a custom processor (not used, just for demonstration)
async function customProcessor(text, mode) {
  // Implement your custom logic here
  return `Custom processed (${mode}): ${text}`;
}

function createNewChat() {
  const newChat = {
      id: Date.now().toString(),
      title: `Chat ${chats.length + 1}`,
      messages: []
  };
  chats.push(newChat);
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


app.whenReady().then(() => {
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
}).catch(error => {
  console.error('Failed to initialize app:', error);
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
    mainWindow.webContents.send('show-loading');
    
    if (!chatId || !chats.find(c => c.id === chatId)) {
        const newChat = createNewChat();
        chatId = newChat.id;
        mainWindow.webContents.send('chat-loaded', newChat);
    }

    const chat = chats.find(c => c.id === chatId);
    chat.messages.push({ text, sender: 'user', mode });
    mainWindow.webContents.send('add-user-message', { text, mode });

    try {
      const processor = textProcessors[mode] || textProcessors.qa;
      const processedText = await processor(text);
      
      chat.messages.push({ text: processedText, sender: 'ai', mode });
      saveChats();
      mainWindow.webContents.send('update-conversation', { originalText: text, processedText, mode, chatId });
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

ipcMain.on('resize-popup', (event, { width, height }) => {
  if (popupWindow) {
      popupWindow.setSize(width, height);
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