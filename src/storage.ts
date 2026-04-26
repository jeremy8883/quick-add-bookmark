const LAST_FOLDER_KEY = "lastBookmarkFolderId";
const REMOVED_BOOKMARKS_KEY = "removedBookmarks";

export type RemovedBookmarksMap = Record<string, string>;

export const getLastFolderId = async (): Promise<string | null> => {
  const result = await chrome.storage.local.get(LAST_FOLDER_KEY);
  return (result[LAST_FOLDER_KEY] as string) ?? null;
};

export const setLastFolderId = async (folderId: string): Promise<void> => {
  await chrome.storage.local.set({ [LAST_FOLDER_KEY]: folderId });
};

export const getRemovedBookmarks = async (): Promise<RemovedBookmarksMap> => {
  const result = await chrome.storage.session.get(REMOVED_BOOKMARKS_KEY);
  return (result[REMOVED_BOOKMARKS_KEY] as RemovedBookmarksMap) ?? {};
};

export const saveRemovedBookmark = async (
  url: string,
  parentId: string,
): Promise<void> => {
  const map = await getRemovedBookmarks();
  map[url] = parentId;
  await chrome.storage.session.set({ [REMOVED_BOOKMARKS_KEY]: map });
};

export const clearRemovedBookmark = async (url: string): Promise<void> => {
  const map = await getRemovedBookmarks();
  if (url in map) {
    delete map[url];
    await chrome.storage.session.set({ [REMOVED_BOOKMARKS_KEY]: map });
  }
};
