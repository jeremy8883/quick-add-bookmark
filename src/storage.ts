const LAST_FOLDER_KEY = "lastBookmarkFolderId";

export async function getLastFolderId(): Promise<string | null> {
  const result = await chrome.storage.local.get(LAST_FOLDER_KEY);
  return (result[LAST_FOLDER_KEY] as string) ?? null;
}

export async function setLastFolderId(folderId: string): Promise<void> {
  await chrome.storage.local.set({ [LAST_FOLDER_KEY]: folderId });
}
