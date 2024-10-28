document.addEventListener('DOMContentLoaded', () => {
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
      window.electronAPI.resizePopup(600, newWindowHeight);
    }
  
    function submitText() {
      const text = searchInput.value.trim();
      const mode = modeSelect.value;
      if (text !== '') {
        window.electronAPI.processText(text, mode, null);
        searchInput.value = '';
        adjustTextareaHeight();
      }
    }
  
    // Event Listeners
    searchInput.addEventListener('input', adjustTextareaHeight);
  
    searchInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submitText();
      }
    });
  
    submitButton.addEventListener('click', submitText);
  
    modeSelect.addEventListener('change', (e) => {
      if (e.target.value === 'search') {
        searchContainer.classList.add('search-mode');
      } else {
        searchContainer.classList.remove('search-mode');
      }
      searchInput.focus();
    });
  
    // Show main window handler
    window.electronAPI.onShowMainWindow(() => {
      searchInput.value = '';
      adjustTextareaHeight();
    });
  
    // Initial setup
    window.addEventListener('load', () => {
      adjustTextareaHeight();
      searchInput.focus();
    });
  });