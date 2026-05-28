import { describe, it, expect } from "vitest";
import { treeStateFromChromeNodes } from "./chrome-tree";
import { LOGICAL_ROOT_BAR, LOGICAL_ROOT_OTHER } from "./roots";

type ChromeNode = chrome.bookmarks.BookmarkTreeNode;

const node = (n: Partial<ChromeNode> & { id: string }): ChromeNode =>
  n as ChromeNode;

const chromeRootTree = (): ChromeNode[] => [
  node({
    id: "0",
    title: "",
    children: [
      node({
        id: "1",
        parentId: "0",
        title: "Bookmarks Bar",
        index: 0,
        children: [
          node({
            id: "100",
            parentId: "1",
            title: "Dev",
            index: 0,
            children: [
              node({
                id: "b1",
                parentId: "100",
                title: "React",
                url: "https://react.dev",
                index: 0,
              }),
            ],
          }),
          node({
            id: "b2",
            parentId: "1",
            title: "Example",
            url: "https://example.com",
            index: 1,
          }),
        ],
      }),
      node({
        id: "2",
        parentId: "0",
        title: "Other Bookmarks",
        index: 1,
        children: [
          node({
            id: "b3",
            parentId: "2",
            title: "Misc",
            url: "https://misc.com",
            index: 0,
          }),
        ],
      }),
    ],
  }),
];

let uuidCounter = 0;
const deterministicUuid = (): string => `uuid-${++uuidCounter}`;

describe("treeStateFromChromeNodes", () => {
  it("assigns UUIDs to non-root nodes and reuses existing mappings", () => {
    uuidCounter = 0;
    const initial = { "100": "uuid-preexisting" };
    const result = treeStateFromChromeNodes(
      chromeRootTree(),
      initial,
      deterministicUuid,
    );
    expect(result.uuidMap["100"]).toBe("uuid-preexisting");
    expect(result.uuidMap["b1"]).toBeDefined();
    expect(result.uuidMap["b2"]).toBeDefined();
    expect(result.uuidMap["b3"]).toBeDefined();
    expect(result.uuidMap["0"]).toBeUndefined();
    expect(result.uuidMap["1"]).toBeUndefined();
  });

  it("maps bookmarks-bar children to LOGICAL_ROOT_BAR", () => {
    uuidCounter = 0;
    const result = treeStateFromChromeNodes(
      chromeRootTree(),
      {},
      deterministicUuid,
    );
    const folderUuid = result.uuidMap["100"];
    const b2Uuid = result.uuidMap["b2"];
    expect(result.state.nodes[folderUuid].parentUuid).toBe(LOGICAL_ROOT_BAR);
    expect(result.state.nodes[b2Uuid].parentUuid).toBe(LOGICAL_ROOT_BAR);
  });

  it("maps other-bookmarks children to LOGICAL_ROOT_OTHER", () => {
    uuidCounter = 0;
    const result = treeStateFromChromeNodes(
      chromeRootTree(),
      {},
      deterministicUuid,
    );
    const b3Uuid = result.uuidMap["b3"];
    expect(result.state.nodes[b3Uuid].parentUuid).toBe(LOGICAL_ROOT_OTHER);
  });

  it("uses inner-node UUIDs for nested bookmarks (not root logical UUIDs)", () => {
    uuidCounter = 0;
    const result = treeStateFromChromeNodes(
      chromeRootTree(),
      {},
      deterministicUuid,
    );
    const folderUuid = result.uuidMap["100"];
    const b1Uuid = result.uuidMap["b1"];
    expect(result.state.nodes[b1Uuid].parentUuid).toBe(folderUuid);
  });

  it("does not include any root nodes in TreeState", () => {
    uuidCounter = 0;
    const result = treeStateFromChromeNodes(
      chromeRootTree(),
      {},
      deterministicUuid,
    );
    for (const node of Object.values(result.state.nodes)) {
      expect(node.parentUuid).not.toBeNull();
    }
  });

  it("preserves title, url, index", () => {
    uuidCounter = 0;
    const result = treeStateFromChromeNodes(
      chromeRootTree(),
      {},
      deterministicUuid,
    );
    const b1Uuid = result.uuidMap["b1"];
    expect(result.state.nodes[b1Uuid]).toMatchObject({
      title: "React",
      url: "https://react.dev",
      index: 0,
    });
    const b2Uuid = result.uuidMap["b2"];
    expect(result.state.nodes[b2Uuid].index).toBe(1);
  });

  it("returns the same UUID map reference when no new assignments occurred", () => {
    uuidCounter = 0;
    const fullyMappedTree = treeStateFromChromeNodes(
      chromeRootTree(),
      {},
      deterministicUuid,
    );
    const repeat = treeStateFromChromeNodes(
      chromeRootTree(),
      fullyMappedTree.uuidMap,
      deterministicUuid,
    );
    expect(repeat.uuidMap).toBe(fullyMappedTree.uuidMap);
  });
});
