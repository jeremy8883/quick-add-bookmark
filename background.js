chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-quick-find') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'toggle-quick-find' });
  } catch {
    // Content script not present (chrome://, web store, etc.) — silently ignore.
  }
});
