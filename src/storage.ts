const LAST_FOLDER_KEY = "lastBookmarkFolderId";
const POPUP_SIZE_KEY = "popupSize";

export interface PopupSize {
  width: number;
  height: number;
}

export async function getLastFolderId(): Promise<string | null> {
  const result = await chrome.storage.local.get(LAST_FOLDER_KEY);
  return (result[LAST_FOLDER_KEY] as string) ?? null;
}

export async function setLastFolderId(folderId: string): Promise<void> {
  await chrome.storage.local.set({ [LAST_FOLDER_KEY]: folderId });
}

export async function getPopupSize(): Promise<PopupSize | null> {
  const result = await chrome.storage.local.get(POPUP_SIZE_KEY);
  return (result[POPUP_SIZE_KEY] as PopupSize) ?? null;
}

export async function setPopupSize(size: PopupSize): Promise<void> {
  await chrome.storage.local.set({ [POPUP_SIZE_KEY]: size });
}
