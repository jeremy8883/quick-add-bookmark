import { describe, it, expect } from "vitest";
import { findPathToTarget } from "./tree";
import { countBookmarksDeep, isBookmarkInsideFolder } from "./tree-counts";

type Node = {
  id: string;
  title: string;
  children?: Node[];
  url?: string;
};

// Minimal bookmark tree fixture
const tree: Node = {
  id: "0",
  title: "",
  children: [
    {
      id: "1",
      title: "Bookmarks Bar",
      children: [
        {
          id: "10",
          title: "Dev",
          children: [
            {
              id: "100",
              title: "Frontend",
              children: [
                { id: "b1", title: "React Docs", url: "https://react.dev" },
                { id: "b2", title: "Vue Docs", url: "https://vuejs.org" },
              ],
            },
            { id: "101", title: "Backend", children: [] },
          ],
        },
        { id: "11", title: "News", children: [] },
        { id: "b3", title: "Example", url: "https://example.com" },
      ],
    },
    {
      id: "2",
      title: "Other Bookmarks",
      children: [
        {
          id: "20",
          title: "Misc",
          children: [
            { id: "b4", title: "Misc Link", url: "https://misc.com" },
          ],
        },
      ],
    },
  ],
};

describe("findPathToTarget", () => {
  it("finds a root-level folder", () => {
    const path = new Set<string>();
    const found = findPathToTarget(tree as any, "1", path);
    expect(found).toBe(true);
    expect(path).toEqual(new Set(["0", "1"]));
  });

  it("finds a deeply nested folder", () => {
    const path = new Set<string>();
    const found = findPathToTarget(tree as any, "101", path);
    expect(found).toBe(true);
    expect(path).toEqual(new Set(["0", "1", "10", "101"]));
  });

  it("finds a folder in a different subtree", () => {
    const path = new Set<string>();
    const found = findPathToTarget(tree as any, "20", path);
    expect(found).toBe(true);
    expect(path).toEqual(new Set(["0", "2", "20"]));
  });

  it("returns false for nonexistent id", () => {
    const path = new Set<string>();
    const found = findPathToTarget(tree as any, "999", path);
    expect(found).toBe(false);
    expect(path.size).toBe(0);
  });

  it("handles a leaf folder (empty children)", () => {
    const path = new Set<string>();
    const found = findPathToTarget(tree as any, "11", path);
    expect(found).toBe(true);
    expect(path).toEqual(new Set(["0", "1", "11"]));
  });
});

describe("countBookmarksDeep", () => {
  it("returns 0 for an empty folder", () => {
    expect(countBookmarksDeep({ id: "101", title: "Backend", children: [] } as any)).toBe(0);
  });

  it("counts direct bookmark children", () => {
    const folder = tree.children![0].children![0].children![0]; // Frontend: 2 bookmarks
    expect(countBookmarksDeep(folder as any)).toBe(2);
  });

  it("counts bookmarks recursively across nested folders", () => {
    const dev = tree.children![0].children![0]; // Dev → Frontend(2) + Backend(0)
    expect(countBookmarksDeep(dev as any)).toBe(2);
  });

  it("counts all bookmarks from root", () => {
    // b1, b2 in Frontend; b3 in Bookmarks Bar; b4 in Misc = 4
    expect(countBookmarksDeep(tree as any)).toBe(4);
  });

  it("returns 1 for a leaf bookmark node (no children)", () => {
    const leaf = { id: "b1", title: "React Docs", url: "https://react.dev" };
    expect(countBookmarksDeep(leaf as any)).toBe(1);
  });
});

describe("isBookmarkInsideFolder", () => {
  it("finds a direct child bookmark", () => {
    const frontend = tree.children![0].children![0].children![0]; // Frontend
    expect(isBookmarkInsideFolder(frontend as any, "b1")).toBe(true);
    expect(isBookmarkInsideFolder(frontend as any, "b2")).toBe(true);
  });

  it("finds a deeply nested bookmark", () => {
    const dev = tree.children![0].children![0]; // Dev
    expect(isBookmarkInsideFolder(dev as any, "b1")).toBe(true);
  });

  it("returns true when the node itself matches", () => {
    expect(isBookmarkInsideFolder(tree as any, "0")).toBe(true);
  });

  it("returns false for a bookmark in a different subtree", () => {
    const otherBookmarks = tree.children![1]; // Other Bookmarks
    expect(isBookmarkInsideFolder(otherBookmarks as any, "b1")).toBe(false);
  });

  it("returns false for a nonexistent id", () => {
    expect(isBookmarkInsideFolder(tree as any, "nope")).toBe(false);
  });

  it("returns false for an empty folder", () => {
    const empty = { id: "101", title: "Backend", children: [] };
    expect(isBookmarkInsideFolder(empty as any, "b1")).toBe(false);
  });
});
