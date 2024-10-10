const { ipcRenderer } = require('electron');

const searchInput = document.getElementById('search-input');
const submitButton = document.getElementById('submit-button');
const modeSelect = document.getElementById('mode-select');
const searchContainer = document.getElementById('search-container');

function adjustTextareaHeight() {
    searchInput.style.height = 'auto';
    const newHeight = Math.min(searchInput.scrollHeight, 130); // Max height of textarea
    searchInput.style.height = newHeight + 'px';
    
    // Adjust window height
    const newWindowHeight = Math.min(newHeight + 40, 150); // Max height of window
    ipcRenderer.send('resize-popup', { width: 600, height: newWindowHeight });
}

searchInput.addEventListener('input', adjustTextareaHeight);

function submitText() {
    const text = searchInput.value;
    const mode = modeSelect.value;
    if (text.trim() !== '') {
        ipcRenderer.send('process-text', { text, mode });
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

modeSelect.addEventListener('change', () => {
    searchInput.focus();
});

ipcRenderer.on('show-main-window', () => {
    searchInput.value = '';
    adjustTextareaHeight();
});

// Initial adjustment
window.addEventListener('load', () => {
    adjustTextareaHeight();
    searchInput.focus();
});