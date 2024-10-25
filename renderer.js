const { ipcRenderer } = require('electron');

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

let currentChatId = null;

function adjustTextareaHeight() {
    searchInput.style.height = 'auto';
    searchInput.style.height = Math.min(searchInput.scrollHeight, 200) + 'px';
}

searchInput.addEventListener('input', adjustTextareaHeight);

function submitText() {
  const text = searchInput.value;
  const mode = modeSelect.value;
  if (text.trim() !== '') {
    processText(text, mode);
    searchInput.value = '';
    adjustTextareaHeight();
  }
}

searchInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submitText();
    }
});

submitButton.addEventListener('click', submitText);

closeButton.addEventListener('click', () => {
    ipcRenderer.send('hide-main-window');
});

function processText(text, mode) {
  console.log('process-text in renderer')
  // addMessageToConversation(text, 'user', mode);
  
  ipcRenderer.send('process-text', { text, mode, chatId: currentChatId });
}

ipcRenderer.on('add-user-message', (event, { text, mode }) => {
  console.log('add-user-message')
    addMessageToConversation(text, 'user', mode);
    showLoadingIndicator();
});

ipcRenderer.on('update-conversation', (event, { originalText, renderedText, mode, chatId }) => {
  hideLoadingIndicator();
  console.log('update-conversation')
  addMessageToConversation(renderedText, 'ai', mode);
  updateChatList();
});

function addMessageToConversation(text, sender, mode) {
  console.log('addMessageToConversation was called with', text)
  const messageElement = document.createElement('div');
  messageElement.classList.add('message', sender === 'user' ? 'user-message' : 'ai-message');
  
  const iconElement = document.createElement('div');
  iconElement.classList.add('message-icon');
  iconElement.innerHTML = `<svg><use xlink:href="#${sender === 'user' ? 'user-icon' : 'robot-icon'}"></use></svg>`;
  
  const contentElement = document.createElement('div');
  contentElement.classList.add('message-content');
  
  if (sender === 'ai') {
      let modeText;
      switch (mode) {
          case 'email':
              modeText = 'Rewritten Email';
              break;
          case 'summarize':
              modeText = 'Summary';
              break;
          case 'qa':
              modeText = 'Response';
              break;
          default:
              modeText = 'Response';
      }
      contentElement.innerHTML = text;
  } else {
      contentElement.textContent = text;
  }
  
  messageElement.appendChild(iconElement);
  messageElement.appendChild(contentElement);
  
  conversationArea.appendChild(messageElement);
  conversationArea.scrollTop = conversationArea.scrollHeight;
}

function showLoadingIndicator() {
  const loadingElement = document.createElement('div');
  loadingElement.classList.add('loading-indicator');
  
  const iconElement = document.createElement('div');
  iconElement.classList.add('message-icon');
  iconElement.innerHTML = `<svg><use xlink:href="#robot-icon"></use></svg>`;
  
  const dotsElement = document.createElement('div');
  dotsElement.classList.add('loading-dots');
  dotsElement.innerHTML = '<span></span><span></span><span></span>';
  
  loadingElement.appendChild(iconElement);
  loadingElement.appendChild(dotsElement);
  
  conversationArea.appendChild(loadingElement);
  conversationArea.scrollTop = conversationArea.scrollHeight;
}

function hideLoadingIndicator() {
  const loadingIndicator = conversationArea.querySelector('.loading-indicator');
  if (loadingIndicator) {
      loadingIndicator.remove();
  }
}

ipcRenderer.on('show-loading', () => {
  const loadingIndicator = conversationArea.querySelector('.loading-indicator');
    loadingIndicator.style.display = 'block';
});

newChatBtn.addEventListener('click', () => {
  ipcRenderer.send('new-chat');
  // Optionally, you can clear the conversation area here
  conversationArea.innerHTML = '';
});

function updateChatList() {
    ipcRenderer.send('get-chat-list');
}

ipcRenderer.on('chat-list', (event, chats) => {
  chatList.innerHTML = '';
  chats.forEach((chat, index) => {
      const chatItem = document.createElement('div');
      chatItem.classList.add('chat-item');
      
      const chatTitle = document.createElement('span');
      chatTitle.textContent = chat.title || `Chat ${chats.length - index}`; // Update numbering
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

function loadChat(chatId) {
  currentChatId = chatId;
  ipcRenderer.send('load-chat', chatId);
}

ipcRenderer.on('chat-loaded', (event, { id, messages, title }) => {
  currentChatId = id;
  conversationArea.innerHTML = '';
  messages.forEach(msg => addMessageToConversation(msg.text, msg.sender, msg.mode));
  updateChatList();
  // Optionally, update the window title or a header with the chat title
  document.title = `Chat: ${title}`;
});

function deleteChat(chatId) {
  if (confirm('Are you sure you want to delete this chat?')) {
      ipcRenderer.send('delete-chat', chatId);
  }
}

ipcRenderer.on('chat-deleted', (event, deletedChatId) => {
  if (currentChatId === deletedChatId) {
      // Clear the conversation area if the current chat was deleted
      conversationArea.innerHTML = '';
      currentChatId = null;
  }
  updateChatList();
});

toggleSidebarBtn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    mainContent.classList.toggle('sidebar-open');
});

ipcRenderer.on('processing-error', (event, errorMessage) => {
    loadingIndicator.style.display = 'none';
    addMessageToConversation(`Error: ${errorMessage}`, 'ai', 'error');
});

ipcRenderer.on('chat-load-error', (event, errorMessage) => {
  console.error('Error loading chat:', errorMessage);
  // Optionally, display an error message to the user
  addMessageToConversation(`Error: ${errorMessage}`, 'ai', 'error');
});

ipcRenderer.on('chat-created', (event, newChat) => {
  currentChatId = newChat.id;
  conversationArea.innerHTML = '';
  updateChatList();
});

// Initial setup
updateChatList();
searchInput.focus();