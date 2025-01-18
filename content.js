class TimeTrackerUI {
    constructor() {
      this.element = null;
      this.port = null;
      
      // Check if extension is enabled before creating UI
      chrome.storage.local.get('isEnabled', (data) => {
        if (data.isEnabled !== false) {
          this.createUI();
          this.initializeDrag();
          this.loadPosition();
          this.connectToBackground();
        }
      });
    }
  
    connectToBackground() {
      // Establish connection with background script
      this.port = chrome.runtime.connect({ name: 'timeTracker' });
      
      // Handle disconnection
      this.port.onDisconnect.addListener(() => {
        setTimeout(() => this.connectToBackground(), 1000); // Try to reconnect after 1 second
      });
    }
  
    createUI() {
      this.element = document.createElement('div');
      this.element.className = 'time-tracker-ui';
      this.element.innerHTML = `
        <div>Tab Time: 00:00:00</div>
        <div>Total Time: 00:00:00</div>
      `;
      document.body.appendChild(this.element);
    }
  
    initializeDrag() {
      if (!this.element) return;
  
      let isDragging = false;
      let currentX;
      let currentY;
      let initialX;
      let initialY;
  
      this.element.addEventListener('mousedown', (e) => {
        isDragging = true;
        initialX = e.clientX - this.element.offsetLeft;
        initialY = e.clientY - this.element.offsetTop;
      });
  
      document.addEventListener('mousemove', (e) => {
        if (isDragging) {
          e.preventDefault();
          currentX = e.clientX - initialX;
          currentY = e.clientY - initialY;
          
          // Keep within viewport bounds
          currentX = Math.max(0, Math.min(currentX, window.innerWidth - this.element.offsetWidth));
          currentY = Math.max(0, Math.min(currentY, window.innerHeight - this.element.offsetHeight));
          
          this.element.style.left = `${currentX}px`;
          this.element.style.top = `${currentY}px`;
          this.element.style.right = 'auto';
          
          // Save position
          chrome.storage.local.set({
            uiPosition: { x: currentX, y: currentY }
          });
        }
      });
  
      document.addEventListener('mouseup', () => {
        isDragging = false;
      });
  
      // Handle window resize
      window.addEventListener('resize', () => {
        if (this.element) {
          const rect = this.element.getBoundingClientRect();
          if (rect.right > window.innerWidth) {
            this.element.style.left = `${window.innerWidth - this.element.offsetWidth - 20}px`;
          }
          if (rect.bottom > window.innerHeight) {
            this.element.style.top = `${window.innerHeight - this.element.offsetHeight - 20}px`;
          }
        }
      });
    }
  
    loadPosition() {
      if (!this.element) return;
  
      chrome.storage.local.get('uiPosition', (data) => {
        if (data.uiPosition) {
          this.element.style.left = `${data.uiPosition.x}px`;
          this.element.style.top = `${data.uiPosition.y}px`;
          this.element.style.right = 'auto';
        }
      });
    }
  
    formatTime(ms) {
      const seconds = Math.floor(ms / 1000);
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
  
    updateTimes(tabTime, totalTime) {
      if (!this.element) return;
  
      const [tabTimeDiv, totalTimeDiv] = this.element.children;
      tabTimeDiv.textContent = `Tab Time: ${this.formatTime(tabTime)}`;
      totalTimeDiv.textContent = `Total Time: ${this.formatTime(totalTime)}`;
    }
  
    remove() {
      if (this.element) {
        this.element.remove();
        this.element = null;
      }
      if (this.port) {
        this.port.disconnect();
        this.port = null;
      }
    }
    
  }
  
  let tracker = null;
  
  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'removeUI' && tracker) {
      tracker.remove();
      tracker = null;
    } else if (message.type === 'timeUpdate' && tracker) {
      tracker.updateTimes(message.tabTime, message.totalTime);
    }
  });
  
  // Initialize on load if enabled
  chrome.storage.local.get('isEnabled', (data) => {
    if (data.isEnabled !== false) {
      tracker = new TimeTrackerUI();
    }
  });