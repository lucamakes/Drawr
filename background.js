// Track injection state per tab
const injectedTabs = new Set();

chrome.action.onClicked.addListener(async (tab) => {
  await toggleDrawMode(tab.id);
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  if (command === 'toggle-draw') {
    await toggleDrawMode(tab.id);
  } else if (injectedTabs.has(tab.id)) {
    chrome.tabs.sendMessage(tab.id, { action: command });
  }
});

async function toggleDrawMode(tabId) {
  try {
    if (injectedTabs.has(tabId)) {
      chrome.tabs.sendMessage(tabId, { action: 'toggle' });
    } else {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ['styles.css'] });
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      injectedTabs.add(tabId);
    }
  } catch (err) {
    console.error('Screen Draw error:', err);
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  injectedTabs.delete(tabId);
});

// Handle screenshot capture request
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'capture-screenshot') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      sendResponse({ dataUrl });
    });
    return true; // Keep channel open for async response
  }
});
