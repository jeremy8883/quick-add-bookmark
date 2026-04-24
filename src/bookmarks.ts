const DEFAULT_FOLDER_ID = "2"; // "Other Bookmarks"

export async function findExistingBookmark(
  url: string,
): Promise<chrome.bookmarks.BookmarkTreeNode | null> {
  const results = await chrome.bookmarks.search({ url });
  return results.length > 0 ? results[0] : null;
}

export async function createBookmark(
  title: string,
  url: string,
  parentId: string | null,
): Promise<chrome.bookmarks.BookmarkTreeNode> {
  return chrome.bookmarks.create({
    parentId: parentId || DEFAULT_FOLDER_ID,
    title,
    url,
  });
}

export async function updateBookmark(
  id: string,
  title: string,
  url: string,
  parentId: string | null,
  currentParentId: string,
): Promise<void> {
  await chrome.bookmarks.update(id, { title, url });
  if (parentId && parentId !== currentParentId) {
    await chrome.bookmarks.move(id, { parentId });
  }
}

export async function removeBookmark(id: string): Promise<void> {
  await chrome.bookmarks.remove(id);
}
