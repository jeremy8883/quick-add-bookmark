const KEYS = {
  dropboxAccessToken: "dropbox.accessToken",
  dropboxRefreshToken: "dropbox.refreshToken",
  dropboxAccessTokenExpiresAt: "dropbox.accessTokenExpiresAt",
  dropboxAccount: "dropbox.account",
} as const;

export type StorageKey = keyof typeof KEYS;

export const get = async <T = unknown>(
  key: StorageKey,
): Promise<T | undefined> => {
  const k = KEYS[key];
  const result = await chrome.storage.local.get(k);
  return result[k] as T | undefined;
};

export const set = async <T>(key: StorageKey, value: T): Promise<void> => {
  await chrome.storage.local.set({ [KEYS[key]]: value });
};

export const remove = async (...keys: StorageKey[]): Promise<void> => {
  await chrome.storage.local.remove(keys.map((k) => KEYS[k]));
};
