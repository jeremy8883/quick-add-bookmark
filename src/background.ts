/**
 * Background service worker that updates the toolbar icon based on
 * whether the current page is bookmarked (filled) or not (outline).
 */

function drawBookmarkIcon(
  size: number,
  filled: boolean,
): ImageData {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d")!;

  // Scale the 128-unit viewBox path to the target size
  const s = size / 128;
  ctx.scale(s, s);

  // Bookmark shape path (matches icons/bookmark.svg)
  ctx.beginPath();
  ctx.moveTo(32, 12);
  ctx.bezierCurveTo(32, 8, 35, 4, 40, 4);
  ctx.lineTo(88, 4);
  ctx.bezierCurveTo(93, 4, 96, 8, 96, 12);
  ctx.lineTo(96, 120);
  ctx.lineTo(64, 96);
  ctx.lineTo(32, 120);
  ctx.closePath();

  if (filled) {
    ctx.fillStyle = "#4285F4";
    ctx.fill();
    ctx.strokeStyle = "#1a56c4";
  } else {
    ctx.strokeStyle = "#9aa0a6";
  }
  ctx.lineWidth = 3 / s; // Keep stroke visually consistent across sizes
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

function getIconData(filled: boolean) {
  return {
    16: drawBookmarkIcon(16, filled),
    32: drawBookmarkIcon(32, filled),
  };
}

async function updateIconForTab(tabId: number, url: string) {
  // Skip non-bookmarkable URLs
  if (!url || url.startsWith("chrome://") || url.startsWith("chrome-extension://")) {
    await chrome.action.setIcon({ tabId, imageData: getIconData(false) });
    return;
  }

  const results = await chrome.bookmarks.search({ url });
  const isBookmarked = results.length > 0;
  await chrome.action.setIcon({ tabId, imageData: getIconData(isBookmarked) });
}

async function updateActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id && tab.url) {
    await updateIconForTab(tab.id, tab.url);
  }
}

// Tab switched
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url) {
      await updateIconForTab(tabId, tab.url);
    }
  } catch {
    // Tab may have been closed
  }
});

// URL changed within a tab
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    if (tab.url) {
      await updateIconForTab(tabId, tab.url);
    }
  }
});

// Bookmark created or removed from any source
chrome.bookmarks.onCreated.addListener(() => updateActiveTab());
chrome.bookmarks.onRemoved.addListener(() => updateActiveTab());
chrome.bookmarks.onChanged.addListener(() => updateActiveTab());
chrome.bookmarks.onMoved.addListener(() => updateActiveTab());
