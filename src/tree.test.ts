import { describe, it, expect } from "vitest";
import { findPathToTarget } from "./tree";

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
            { id: "100", title: "Frontend", children: [] },
            { id: "101", title: "Backend", children: [] },
          ],
        },
        { id: "11", title: "News", children: [] },
      ],
    },
    {
      id: "2",
      title: "Other Bookmarks",
      children: [{ id: "20", title: "Misc", children: [] }],
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
