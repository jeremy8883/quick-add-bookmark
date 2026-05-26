import { removeFrecencyEntries } from "./frecency";

/**
 * Walk a bookmark subtree and collect every leaf bookmark id.
 * When a folder is removed, Chrome fires onRemoved once for the folder
 * and provides the full subtree in removeInfo.node — we need to prune
 * frecency entries for every descendant.
 */
const collectBookmarkIds = (
  node: chrome.bookmarks.BookmarkTreeNode,
): string[] => {
  if (!node.children) return node.url ? [node.id] : [];
  const ids: string[] = [];
  for (const child of node.children) {
    ids.push(...collectBookmarkIds(child));
  }
  return ids;
};

chrome.bookmarks.onRemoved.addListener(async (_id, removeInfo) => {
  const ids = collectBookmarkIds(removeInfo.node);
  await removeFrecencyEntries(ids);
});
