import { get, set } from "./storage";

export type UuidMap = Record<string, string>;

export const lookupUuid = (map: UuidMap, chromeId: string): string | undefined =>
  map[chromeId];

export const lookupChromeId = (
  map: UuidMap,
  uuid: string,
): string | undefined => {
  for (const [chromeId, u] of Object.entries(map)) {
    if (u === uuid) return chromeId;
  }
  return undefined;
};

export const assignUuid = (
  map: UuidMap,
  chromeId: string,
  generate: () => string = () => crypto.randomUUID(),
): { map: UuidMap; uuid: string; created: boolean } => {
  const existing = map[chromeId];
  if (existing) return { map, uuid: existing, created: false };
  const uuid = generate();
  return { map: { ...map, [chromeId]: uuid }, uuid, created: true };
};

export const removeMapping = (map: UuidMap, chromeId: string): UuidMap => {
  if (!(chromeId in map)) return map;
  const next = { ...map };
  delete next[chromeId];
  return next;
};

export const renameChromeId = (
  map: UuidMap,
  oldChromeId: string,
  newChromeId: string,
): UuidMap => {
  const uuid = map[oldChromeId];
  if (!uuid) return map;
  const next = { ...map };
  delete next[oldChromeId];
  next[newChromeId] = uuid;
  return next;
};

export const loadMap = async (): Promise<UuidMap> => {
  return (await get<UuidMap>("bookmarkUuidMap")) ?? {};
};

export const saveMap = async (map: UuidMap): Promise<void> => {
  await set("bookmarkUuidMap", map);
};

export const getOrAssignUuid = async (chromeId: string): Promise<string> => {
  const map = await loadMap();
  const result = assignUuid(map, chromeId);
  if (result.created) await saveMap(result.map);
  return result.uuid;
};

export const getOrInitDeviceId = async (): Promise<string> => {
  const existing = await get<string>("deviceId");
  if (existing) return existing;
  const id = crypto.randomUUID();
  await set("deviceId", id);
  return id;
};

export const getDeviceName = async (): Promise<string | undefined> =>
  get<string>("deviceName");

export const setDeviceName = async (name: string): Promise<void> => {
  await set("deviceName", name);
};
