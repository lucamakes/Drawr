var addedFabric = {};
chrome.action.onClicked.addListener((tab) => {
    if (addedFabric[tab.id] == null || !addedFabric[tab.id]) {
      addedFabric[tab.id] = true;
      chrome.scripting.executeScript({
        target: {tabId: tab.id},
        files: ['fabric.min.js']
      }, function() {
        addMarker(tab);
      });
    } else {
      addMarker(tab);
    }
});

function addMarker(tab) {
  chrome.scripting.executeScript({
    target: {tabId: tab.id},
    files: ['drawr.js']
  }).catch(error => {});
  chrome.scripting.insertCSS({
    target: {tabId: tab.id},
    files: ['main.css']
  });
}

chrome.tabs.onUpdated.addListener(function(tabId) {
  addedFabric[tabId] = false;
});

chrome.tabs.onRemoved.addListener(function(tabId) {
  delete addedFabric[tabId];
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.from == 'content_script') {
    chrome.tabs.captureVisibleTab(null, {}, function (image) {
      sendResponse({screenshot: image});
    });
  }
  return true;
});

chrome.runtime.onInstalled.addListener(function (details) {
});
