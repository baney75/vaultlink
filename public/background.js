chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
});
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-workspace') chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});
