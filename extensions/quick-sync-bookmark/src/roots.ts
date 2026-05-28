export const LOGICAL_ROOT_BAR =
  "00000000-0000-0000-0000-000000000001";
export const LOGICAL_ROOT_OTHER =
  "00000000-0000-0000-0000-000000000002";
export const LOGICAL_ROOT_MOBILE =
  "00000000-0000-0000-0000-000000000003";

export type LogicalRoot = {
  uuid: string;
  label: string;
};

export const LOGICAL_ROOTS: LogicalRoot[] = [
  { uuid: LOGICAL_ROOT_BAR, label: "Bookmarks Bar" },
  { uuid: LOGICAL_ROOT_OTHER, label: "Other Bookmarks" },
  { uuid: LOGICAL_ROOT_MOBILE, label: "Mobile Bookmarks" },
];

const LOGICAL_ROOT_UUID_SET = new Set(LOGICAL_ROOTS.map((r) => r.uuid));

export const isLogicalRootUuid = (uuid: string): boolean =>
  LOGICAL_ROOT_UUID_SET.has(uuid);

const CHROMIUM_PLATFORM_TO_LOGICAL: Record<string, string> = {
  "1": LOGICAL_ROOT_BAR,
  "2": LOGICAL_ROOT_OTHER,
  "3": LOGICAL_ROOT_MOBILE,
};

const CHROMIUM_LOGICAL_TO_PLATFORM: Record<string, string> = {
  [LOGICAL_ROOT_BAR]: "1",
  [LOGICAL_ROOT_OTHER]: "2",
  [LOGICAL_ROOT_MOBILE]: "3",
};

export const platformIdToLogicalUuid = (platformId: string): string | null =>
  CHROMIUM_PLATFORM_TO_LOGICAL[platformId] ?? null;

export const logicalUuidToPlatformId = (uuid: string): string | null =>
  CHROMIUM_LOGICAL_TO_PLATFORM[uuid] ?? null;

export const isPlatformRootId = (platformId: string): boolean =>
  platformId === "0" || platformId in CHROMIUM_PLATFORM_TO_LOGICAL;
