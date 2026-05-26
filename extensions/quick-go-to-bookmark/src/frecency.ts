/**
 * Frecency store and ranking for bookmarks: a bookmark's score grows
 * with every visit (rank) and decays exponentially with the time since
 * the last visit (half-life of 14 days). Visits are only recorded when
 * a bookmark is opened via the extension.
 */

const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;
const DECAY_RATE = Math.LN2 / HALF_LIFE_MS;
const STORAGE_KEY = "frecency";

export interface FrecencyEntry {
  rank: number;
  lastAccessed: number;
}

export type FrecencyMap = Record<string, FrecencyEntry>;

/**
 * Compute a bookmark's current score. Recent + frequent = high.
 * Returns 0 for unknown bookmarks or rank <= 0.
 */
export const scoreEntry = (
  entry: FrecencyEntry | undefined,
  now: number,
): number => {
  if (!entry || entry.rank <= 0) return 0;
  const age = Math.max(0, now - entry.lastAccessed);
  return entry.rank * Math.exp(-DECAY_RATE * age);
};

/**
 * Sort bookmarks by descending frecency score. Bookmarks with no
 * frecency data fall to the end, sorted alphabetically by title.
 * Does not mutate the input array.
 */
export const sortByFrecency = <T extends { id: string; title: string }>(
  bookmarks: T[],
  map: FrecencyMap,
  now: number,
): T[] => {
  return [...bookmarks].sort((a, b) => {
    const sa = scoreEntry(map[a.id], now);
    const sb = scoreEntry(map[b.id], now);
    if (sa !== sb) return sb - sa;
    return a.title.localeCompare(b.title);
  });
};

export const getFrecencyMap = async (): Promise<FrecencyMap> => {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as FrecencyMap) ?? {};
};

const saveFrecencyMap = async (map: FrecencyMap): Promise<void> => {
  await chrome.storage.local.set({ [STORAGE_KEY]: map });
};

export const recordVisit = async (bookmarkId: string): Promise<void> => {
  const map = await getFrecencyMap();
  const existing = map[bookmarkId];
  map[bookmarkId] = {
    rank: (existing?.rank ?? 0) + 1,
    lastAccessed: Date.now(),
  };
  await saveFrecencyMap(map);
};

export const removeFrecencyEntry = async (
  bookmarkId: string,
): Promise<void> => {
  const map = await getFrecencyMap();
  if (bookmarkId in map) {
    delete map[bookmarkId];
    await saveFrecencyMap(map);
  }
};
