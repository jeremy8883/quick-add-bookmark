import { DEFAULT_FOLDER_ID } from "./constants";

export const findExistingBookmark = async (
  url: string,
): Promise<chrome.bookmarks.BookmarkTreeNode | null> => {
  const results = await chrome.bookmarks.search({ url });
  return results.length > 0 ? results[0] : null;
};

export const createBookmark = async (
  title: string,
  url: string,
  parentId: string | null,
): Promise<chrome.bookmarks.BookmarkTreeNode> => {
  return chrome.bookmarks.create({
    parentId: parentId || DEFAULT_FOLDER_ID,
    title,
    url,
  });
};

export const updateBookmark = async (
  id: string,
  title: string,
  url: string,
  parentId: string | null,
  currentParentId: string,
): Promise<void> => {
  await chrome.bookmarks.update(id, { title, url });
  if (parentId && parentId !== currentParentId) {
    await chrome.bookmarks.move(id, { parentId });
  }
};

export const removeBookmark = async (id: string): Promise<void> => {
  await chrome.bookmarks.remove(id);
};
