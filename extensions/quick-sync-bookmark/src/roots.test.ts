import { describe, it, expect } from "vitest";
import {
  LOGICAL_ROOT_BAR,
  LOGICAL_ROOT_MOBILE,
  LOGICAL_ROOT_OTHER,
  isLogicalRootUuid,
  isPlatformRootId,
  logicalUuidToPlatformId,
  platformIdToLogicalUuid,
} from "./roots";

describe("platform → logical", () => {
  it("maps Chromium root '1' to bookmarks bar UUID", () => {
    expect(platformIdToLogicalUuid("1")).toBe(LOGICAL_ROOT_BAR);
  });
  it("maps '2' to other bookmarks UUID", () => {
    expect(platformIdToLogicalUuid("2")).toBe(LOGICAL_ROOT_OTHER);
  });
  it("maps '3' to mobile UUID", () => {
    expect(platformIdToLogicalUuid("3")).toBe(LOGICAL_ROOT_MOBILE);
  });
  it("returns null for non-root IDs", () => {
    expect(platformIdToLogicalUuid("abc123")).toBeNull();
    expect(platformIdToLogicalUuid("0")).toBeNull();
  });
});

describe("logical → platform", () => {
  it("maps bookmarks bar UUID to '1'", () => {
    expect(logicalUuidToPlatformId(LOGICAL_ROOT_BAR)).toBe("1");
  });
  it("maps other UUID to '2'", () => {
    expect(logicalUuidToPlatformId(LOGICAL_ROOT_OTHER)).toBe("2");
  });
  it("maps mobile UUID to '3'", () => {
    expect(logicalUuidToPlatformId(LOGICAL_ROOT_MOBILE)).toBe("3");
  });
  it("returns null for any other UUID", () => {
    expect(logicalUuidToPlatformId("not-a-root-uuid")).toBeNull();
  });
});

describe("isLogicalRootUuid", () => {
  it("true for logical root UUIDs", () => {
    expect(isLogicalRootUuid(LOGICAL_ROOT_BAR)).toBe(true);
    expect(isLogicalRootUuid(LOGICAL_ROOT_OTHER)).toBe(true);
    expect(isLogicalRootUuid(LOGICAL_ROOT_MOBILE)).toBe(true);
  });
  it("false for any other UUID", () => {
    expect(isLogicalRootUuid("random-uuid")).toBe(false);
  });
});

describe("isPlatformRootId", () => {
  it("true for Chromium roots and the implicit '0'", () => {
    expect(isPlatformRootId("0")).toBe(true);
    expect(isPlatformRootId("1")).toBe(true);
    expect(isPlatformRootId("2")).toBe(true);
    expect(isPlatformRootId("3")).toBe(true);
  });
  it("false for any other ID", () => {
    expect(isPlatformRootId("12345")).toBe(false);
  });
});
