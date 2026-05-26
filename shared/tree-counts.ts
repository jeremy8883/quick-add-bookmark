/**
 * Bookmark counting utilities — pure tree-walking functions and
 * DOM helpers for updating .tree-count displays.
 */

export const countBookmarksDeep = (
  node: chrome.bookmarks.BookmarkTreeNode,
): number => {
  if (!node.children) return 1; // leaf = bookmark
  let count = 0;
  for (const child of node.children) {
    count += countBookmarksDeep(child);
  }
  return count;
};

/**
 * Check whether a bookmark ID exists somewhere inside a folder subtree.
 */
export const isBookmarkInsideFolder = (
  node: chrome.bookmarks.BookmarkTreeNode,
  bookmarkId: string,
): boolean => {
  if (node.id === bookmarkId) return true;
  if (node.children) {
    for (const child of node.children) {
      if (isBookmarkInsideFolder(child, bookmarkId)) return true;
    }
  }
  return false;
};

const adjustCount = (item: HTMLElement, delta: number) => {
  let countEl = item.querySelector(".tree-count") as HTMLElement | null;
  const current = countEl ? parseInt(countEl.textContent || "0", 10) : 0;
  const newCount = Math.max(0, current + delta);
  if (newCount > 0) {
    if (!countEl) {
      countEl = document.createElement("span");
      countEl.className = "tree-count";
      item.appendChild(countEl);
    }
    countEl.textContent = String(newCount);
  } else if (countEl) {
    countEl.remove();
  }
};

/**
 * Walk up from a folder's tree-item and adjust every ancestor's .tree-count by delta.
 * Does NOT update the folder itself — only its ancestors.
 */
export const updateAncestorCounts = (
  treeContainer: HTMLElement,
  folderId: string,
  delta: number,
) => {
  const item = treeContainer.querySelector(
    `.tree-item[data-id="${folderId}"]`,
  ) as HTMLElement | null;
  if (!item) return;

  let el: HTMLElement | null = item.parentElement;
  while (el && el !== treeContainer) {
    if (el.classList.contains("tree-children")) {
      const parentItem = el.parentElement?.querySelector(
        ":scope > .tree-item",
      ) as HTMLElement | null;
      if (parentItem) {
        adjustCount(parentItem, delta);
      }
    }
    el = el.parentElement as HTMLElement | null;
  }
};

/**
 * Update .tree-count displays when a bookmark moves from one folder to another.
 * Decrements the old folder + ancestors, increments the new folder + ancestors.
 */
export const updateCountsOnMove = (
  treeContainer: HTMLElement,
  oldFolderId: string,
  newFolderId: string,
) => {
  if (oldFolderId === newFolderId) return;

  // Update the folders themselves
  const oldItem = treeContainer.querySelector(
    `.tree-item[data-id="${oldFolderId}"]`,
  ) as HTMLElement | null;
  if (oldItem) adjustCount(oldItem, -1);

  const newItem = treeContainer.querySelector(
    `.tree-item[data-id="${newFolderId}"]`,
  ) as HTMLElement | null;
  if (newItem) adjustCount(newItem, 1);

  // Update ancestors
  updateAncestorCounts(treeContainer, oldFolderId, -1);
  updateAncestorCounts(treeContainer, newFolderId, 1);
};
