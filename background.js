let tabTimes = {};
let startTime = Date.now();
let isEnabled = true;
let connectedTabs = new Set();

// Initialize extension state
chrome.storage.local.get('isEnabled', (data) => {
  isEnabled = data.isEnabled !== undefined ? data.isEnabled : true;
  updateIcon(isEnabled);
});

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  isEnabled = !isEnabled;
  await chrome.storage.local.set({ isEnabled });
  updateIcon(isEnabled);
  
  if (isEnabled) {
    injectContentScript(tab.id);
  } else {
    // Send message to content script to remove UI
    chrome.tabs.sendMessage(tab.id, { type: 'removeUI' }).catch(() => {
      // Ignore errors if content script is not loaded
    });
  }
});

function updateIcon(enabled) {
  const path = enabled ? 'icons/icon48.png' : 'icons/icon48_disabled.png';
  chrome.action.setIcon({ path });
}

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['styles.css']
    });
  } catch (err) {
    console.error('Failed to inject content script:', err);
  }
}

// Handle tab connections
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'timeTracker') {
    const tabId = port.sender.tab.id;
    connectedTabs.add(tabId);
    
    port.onDisconnect.addListener(() => {
      connectedTabs.delete(tabId);
    });
  }
});

// Handle tab activation
chrome.tabs.onActivated.addListener((activeInfo) => {
  const tabId = activeInfo.tabId;
  if (!tabTimes[tabId]) {
    tabTimes[tabId] = {
      totalTime: 0,
      lastActive: Date.now()
    };
  } else {
    tabTimes[tabId].lastActive = Date.now();
  }
});

// Handle tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabTimes[tabId]) {
    const currentTime = Date.now();
    tabTimes[tabId].totalTime += currentTime - tabTimes[tabId].lastActive;
    chrome.storage.local.set({ 
      [`tab_${tabId}`]: tabTimes[tabId].totalTime 
    });
    delete tabTimes[tabId];
  }
  connectedTabs.delete(tabId);
});

// Handle new tab creation
chrome.tabs.onCreated.addListener(async (tab) => {
  if (isEnabled && tab.id) {
    await injectContentScript(tab.id);
  }
});

// Safely send message to tab
function safelySendMessage(tabId, message) {
  if (connectedTabs.has(tabId)) {
    chrome.tabs.sendMessage(tabId, message).catch(() => {
      connectedTabs.delete(tabId);
    });
  }
}

// Update times every second
setInterval(() => {
  if (!isEnabled) return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      const tabId = tabs[0].id;
      if (tabTimes[tabId]) {
        const currentTime = Date.now();
        tabTimes[tabId].totalTime += currentTime - tabTimes[tabId].lastActive;
        tabTimes[tabId].lastActive = currentTime;
        
        safelySendMessage(tabId, {
          type: 'timeUpdate',
          tabTime: tabTimes[tabId].totalTime,
          totalTime: Date.now() - startTime
        });
      }
    }
  });
}, 1000);