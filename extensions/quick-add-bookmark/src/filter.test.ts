import { describe, it, expect } from "vitest";
import { flattenFolders } from "./filter";

type Node = {
  id: string;
  title: string;
  children?: Node[];
  url?: string;
};

const nodes: Node[] = [
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
      { id: "12", title: "leaf-bookmark", url: "https://example.com" },
    ],
  },
  {
    id: "2",
    title: "Other Bookmarks",
    children: [],
  },
];

describe("flattenFolders", () => {
  it("flattens all folders with correct paths", () => {
    const result = flattenFolders(nodes as any);
    expect(result).toEqual([
      { id: "1", title: "Bookmarks Bar", path: [] },
      { id: "10", title: "Dev", path: ["Bookmarks Bar"] },
      { id: "100", title: "Frontend", path: ["Bookmarks Bar", "Dev"] },
      { id: "101", title: "Backend", path: ["Bookmarks Bar", "Dev"] },
      { id: "11", title: "News", path: ["Bookmarks Bar"] },
      { id: "2", title: "Other Bookmarks", path: [] },
    ]);
  });

  it("skips non-folder nodes (bookmarks without children)", () => {
    const result = flattenFolders(nodes as any);
    const ids = result.map((f) => f.id);
    expect(ids).not.toContain("12");
  });

  it("returns empty array for empty input", () => {
    expect(flattenFolders([])).toEqual([]);
  });

  it("handles single folder with no children", () => {
    const single: Node[] = [{ id: "1", title: "Solo", children: [] }];
    expect(flattenFolders(single as any)).toEqual([
      { id: "1", title: "Solo", path: [] },
    ]);
  });

  it("uses 'Bookmarks' as fallback for empty title", () => {
    const noTitle: Node[] = [{ id: "1", title: "", children: [] }];
    const result = flattenFolders(noTitle as any);
    expect(result[0].title).toBe("Bookmarks");
  });
});
