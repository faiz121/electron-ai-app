document.addEventListener('DOMContentLoaded', () => {
  // Check if electronAPI is available
  if (!window.electronAPI) {
      console.error('electronAPI not available!');
      return;
  }
  
  // Test the connection
  console.log('API test:', window.electronAPI.ping());

  const searchInput = document.getElementById('search-input');
  const submitButton = document.getElementById('submit-button');
  const modeSelect = document.getElementById('mode-select');
  const searchContainer = document.getElementById('search-container');

  if (!searchInput || !submitButton || !modeSelect || !searchContainer) {
      console.error('Required elements not found!');
      return;
  }

  function adjustTextareaHeight() {
      if (!window.electronAPI) {
          console.error('electronAPI not available in adjustTextareaHeight');
          return;
      }

      searchInput.style.height = 'auto';
      const newHeight = Math.min(searchInput.scrollHeight, 130);
      searchInput.style.height = newHeight + 'px';
      
      const newWindowHeight = Math.min(newHeight + 40, 150);
      try {
          window.electronAPI.resizePopup(600, newWindowHeight);
      } catch (error) {
          console.error('Error resizing popup:', error);
      }
  }

  function submitText() {
      if (!window.electronAPI) {
          console.error('electronAPI not available in submitText');
          return;
      }

      const text = searchInput.value.trim();
      const mode = modeSelect.value;
      if (text !== '') {
          try {
              window.electronAPI.processText(text, mode, null);
              searchInput.value = '';
              adjustTextareaHeight();
          } catch (error) {
              console.error('Error processing text:', error);
          }
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
  if (window.electronAPI) {
      window.electronAPI.onShowMainWindow(() => {
          searchInput.value = '';
          adjustTextareaHeight();
      });
  }

  // Initial setup
  adjustTextareaHeight();
  searchInput.focus();
});