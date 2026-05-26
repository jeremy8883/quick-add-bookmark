import { describe, it, expect } from "vitest";
import { filterBookmarks } from "./filter";

const entries = [
  { id: "1", title: "React Docs", url: "https://react.dev", path: ["Dev", "Frontend"] },
  { id: "2", title: "Vue Docs", url: "https://vuejs.org", path: ["Dev", "Frontend"] },
  { id: "3", title: "GitHub", url: "https://github.com", path: ["Dev"] },
  { id: "4", title: "BBC News", url: "https://bbc.co.uk/news", path: ["News"] },
];

describe("filterBookmarks", () => {
  it("returns every entry for an empty query", () => {
    expect(filterBookmarks(entries, "")).toEqual(entries);
  });

  it("matches case-insensitively in title", () => {
    expect(filterBookmarks(entries, "react").map((e) => e.id)).toEqual(["1"]);
    expect(filterBookmarks(entries, "REACT").map((e) => e.id)).toEqual(["1"]);
  });

  it("matches in url", () => {
    expect(filterBookmarks(entries, "github.com").map((e) => e.id)).toEqual(["3"]);
  });

  it("matches in breadcrumb path", () => {
    expect(filterBookmarks(entries, "frontend").map((e) => e.id)).toEqual([
      "1",
      "2",
    ]);
  });

  it("requires every whitespace-separated term to match somewhere", () => {
    expect(filterBookmarks(entries, "dev react").map((e) => e.id)).toEqual(["1"]);
    expect(filterBookmarks(entries, "vue dev").map((e) => e.id)).toEqual(["2"]);
  });

  it("returns empty when a term does not match", () => {
    expect(filterBookmarks(entries, "react xyz")).toEqual([]);
  });

  it("ignores extra whitespace between terms", () => {
    expect(filterBookmarks(entries, "   react   docs   ").map((e) => e.id)).toEqual([
      "1",
    ]);
  });
});
