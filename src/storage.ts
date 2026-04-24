const LAST_FOLDER_KEY = "lastBookmarkFolderId";

export const getLastFolderId = async (): Promise<string | null> => {
  const result = await chrome.storage.local.get(LAST_FOLDER_KEY);
  return (result[LAST_FOLDER_KEY] as string) ?? null;
};

export const setLastFolderId = async (folderId: string): Promise<void> => {
  await chrome.storage.local.set({ [LAST_FOLDER_KEY]: folderId });
};
