const LAST_FOLDER_KEY = "lastBookmarkFolderId";
const TREE_HEIGHT_KEY = "treeHeight";

export async function getLastFolderId(): Promise<string | null> {
  const result = await chrome.storage.local.get(LAST_FOLDER_KEY);
  return (result[LAST_FOLDER_KEY] as string) ?? null;
}

export async function setLastFolderId(folderId: string): Promise<void> {
  await chrome.storage.local.set({ [LAST_FOLDER_KEY]: folderId });
}

export async function getTreeHeight(): Promise<number | null> {
  const result = await chrome.storage.local.get(TREE_HEIGHT_KEY);
  return (result[TREE_HEIGHT_KEY] as number) ?? null;
}

export async function setTreeHeight(height: number): Promise<void> {
  await chrome.storage.local.set({ [TREE_HEIGHT_KEY]: height });
}
