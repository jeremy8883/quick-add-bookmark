import { describe, it, expect } from "vitest";
import {
  assignUuid,
  lookupChromeId,
  lookupUuid,
  removeMapping,
  renameChromeId,
  type UuidMap,
} from "./identity";

describe("lookupUuid", () => {
  it("returns the uuid for a known chromeId", () => {
    const map: UuidMap = { "c1": "u-1", "c2": "u-2" };
    expect(lookupUuid(map, "c1")).toBe("u-1");
  });

  it("returns undefined for an unknown chromeId", () => {
    expect(lookupUuid({}, "c1")).toBeUndefined();
  });
});

describe("lookupChromeId", () => {
  it("returns the chromeId for a known uuid", () => {
    const map: UuidMap = { "c1": "u-1", "c2": "u-2" };
    expect(lookupChromeId(map, "u-2")).toBe("c2");
  });

  it("returns undefined for an unknown uuid", () => {
    expect(lookupChromeId({ "c1": "u-1" }, "u-missing")).toBeUndefined();
  });
});

describe("assignUuid", () => {
  it("returns existing uuid when chromeId already mapped", () => {
    const map: UuidMap = { "c1": "u-1" };
    const result = assignUuid(map, "c1", () => "u-new");
    expect(result.uuid).toBe("u-1");
    expect(result.created).toBe(false);
    expect(result.map).toBe(map);
  });

  it("generates a new uuid for an unmapped chromeId", () => {
    const map: UuidMap = { "c1": "u-1" };
    const result = assignUuid(map, "c2", () => "u-fresh");
    expect(result.uuid).toBe("u-fresh");
    expect(result.created).toBe(true);
    expect(result.map).toEqual({ "c1": "u-1", "c2": "u-fresh" });
  });

  it("does not mutate the original map", () => {
    const map: UuidMap = { "c1": "u-1" };
    assignUuid(map, "c2", () => "u-fresh");
    expect(map).toEqual({ "c1": "u-1" });
  });

  it("uses crypto.randomUUID() by default", () => {
    const result = assignUuid({}, "c1");
    expect(result.uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});

describe("removeMapping", () => {
  it("removes a known chromeId", () => {
    const map: UuidMap = { "c1": "u-1", "c2": "u-2" };
    expect(removeMapping(map, "c1")).toEqual({ "c2": "u-2" });
  });

  it("returns the same reference when chromeId is not present", () => {
    const map: UuidMap = { "c1": "u-1" };
    expect(removeMapping(map, "c-missing")).toBe(map);
  });
});

describe("renameChromeId", () => {
  it("moves a uuid from old to new chromeId", () => {
    const map: UuidMap = { "c1": "u-1", "c2": "u-2" };
    expect(renameChromeId(map, "c1", "c1-renamed")).toEqual({
      "c1-renamed": "u-1",
      "c2": "u-2",
    });
  });

  it("returns the same reference when the old chromeId is unknown", () => {
    const map: UuidMap = { "c1": "u-1" };
    expect(renameChromeId(map, "c-missing", "c-new")).toBe(map);
  });
});
