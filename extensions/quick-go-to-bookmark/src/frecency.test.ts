import { describe, it, expect } from "vitest";
import { scoreEntry, sortByFrecency } from "./frecency";

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe("scoreEntry", () => {
  it("returns 0 for undefined entry", () => {
    expect(scoreEntry(undefined, NOW)).toBe(0);
  });

  it("returns 0 for rank 0", () => {
    expect(scoreEntry({ rank: 0, lastAccessed: NOW }, NOW)).toBe(0);
  });

  it("returns the full rank for a freshly accessed entry", () => {
    expect(scoreEntry({ rank: 5, lastAccessed: NOW }, NOW)).toBeCloseTo(5);
  });

  it("halves the score after one half-life (14 days)", () => {
    expect(
      scoreEntry({ rank: 10, lastAccessed: NOW - 14 * DAY }, NOW),
    ).toBeCloseTo(5);
  });

  it("quarters the score after two half-lives (28 days)", () => {
    expect(
      scoreEntry({ rank: 10, lastAccessed: NOW - 28 * DAY }, NOW),
    ).toBeCloseTo(2.5);
  });

  it("clamps negative ages to 0 (clock skew)", () => {
    expect(
      scoreEntry({ rank: 5, lastAccessed: NOW + 1000 }, NOW),
    ).toBeCloseTo(5);
  });

  it("is monotonically decreasing with age", () => {
    const fresh = scoreEntry({ rank: 5, lastAccessed: NOW }, NOW);
    const day = scoreEntry({ rank: 5, lastAccessed: NOW - DAY }, NOW);
    const week = scoreEntry({ rank: 5, lastAccessed: NOW - 7 * DAY }, NOW);
    expect(fresh).toBeGreaterThan(day);
    expect(day).toBeGreaterThan(week);
  });

  it("is monotonically increasing with rank", () => {
    const r1 = scoreEntry({ rank: 1, lastAccessed: NOW }, NOW);
    const r5 = scoreEntry({ rank: 5, lastAccessed: NOW }, NOW);
    const r20 = scoreEntry({ rank: 20, lastAccessed: NOW }, NOW);
    expect(r5).toBeGreaterThan(r1);
    expect(r20).toBeGreaterThan(r5);
  });
});

describe("sortByFrecency", () => {
  const bookmarks = [
    { id: "a", title: "Alpha" },
    { id: "b", title: "Beta" },
    { id: "c", title: "Gamma" },
    { id: "d", title: "Delta" },
  ];

  it("sorts by descending frecency score", () => {
    const map = {
      a: { rank: 1, lastAccessed: NOW - 7 * DAY },
      b: { rank: 10, lastAccessed: NOW },
      c: { rank: 5, lastAccessed: NOW - 14 * DAY },
    };
    const result = sortByFrecency(bookmarks, map, NOW);
    expect(result.map((x) => x.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("places unvisited bookmarks at the end, alphabetical by title", () => {
    const result = sortByFrecency(bookmarks, {}, NOW);
    expect(result.map((x) => x.id)).toEqual(["a", "b", "d", "c"]);
  });

  it("treats rank-0 entries as unvisited", () => {
    const map = { a: { rank: 0, lastAccessed: NOW } };
    const result = sortByFrecency(bookmarks, map, NOW);
    expect(result.map((x) => x.id)).toEqual(["a", "b", "d", "c"]);
  });

  it("does not mutate the input array", () => {
    const original = [...bookmarks];
    sortByFrecency(bookmarks, {}, NOW);
    expect(bookmarks).toEqual(original);
  });
});
