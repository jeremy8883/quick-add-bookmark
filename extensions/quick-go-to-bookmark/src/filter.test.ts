import { describe, it, expect } from "vitest";
import { filterBookmarks, highlightSegments, tokenize } from "./filter";

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

describe("tokenize", () => {
  it("lowercases and splits on whitespace", () => {
    expect(tokenize("React Docs")).toEqual(["react", "docs"]);
  });

  it("drops empty tokens from extra whitespace", () => {
    expect(tokenize("   foo   bar  ")).toEqual(["foo", "bar"]);
  });

  it("returns an empty array for an empty query", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("highlightSegments", () => {
  it("returns a single non-match segment when no terms", () => {
    expect(highlightSegments("hello world", [])).toEqual([
      { text: "hello world", match: false },
    ]);
  });

  it("returns a single non-match segment when nothing matches", () => {
    expect(highlightSegments("hello", ["xyz"])).toEqual([
      { text: "hello", match: false },
    ]);
  });

  it("marks a case-insensitive substring match", () => {
    expect(highlightSegments("React Docs", ["react"])).toEqual([
      { text: "React", match: true },
      { text: " Docs", match: false },
    ]);
  });

  it("preserves original casing in match segments", () => {
    expect(highlightSegments("REACT Docs", ["react"])).toEqual([
      { text: "REACT", match: true },
      { text: " Docs", match: false },
    ]);
  });

  it("highlights every occurrence of a term", () => {
    expect(highlightSegments("aba", ["a"])).toEqual([
      { text: "a", match: true },
      { text: "b", match: false },
      { text: "a", match: true },
    ]);
  });

  it("merges overlapping match ranges from multiple terms", () => {
    // "foobar" with terms ["foo", "oob"] — ranges [0,3] and [1,4] merge to [0,4]
    expect(highlightSegments("foobar", ["foo", "oob"])).toEqual([
      { text: "foob", match: true },
      { text: "ar", match: false },
    ]);
  });

  it("handles a match at the end of the string", () => {
    expect(highlightSegments("hello", ["llo"])).toEqual([
      { text: "he", match: false },
      { text: "llo", match: true },
    ]);
  });

  it("handles full-string match", () => {
    expect(highlightSegments("foo", ["foo"])).toEqual([
      { text: "foo", match: true },
    ]);
  });

  it("returns a single non-match segment for empty text", () => {
    expect(highlightSegments("", ["foo"])).toEqual([{ text: "", match: false }]);
  });
});
