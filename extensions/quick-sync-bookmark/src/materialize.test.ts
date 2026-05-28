import { describe, it, expect } from "vitest";
import {
  applyOp,
  childrenOf,
  emptyState,
  materialize,
  toSnapshotNodes,
  type TreeState,
} from "./materialize";
import type { Entry, OpInput } from "./log";

const op = <T extends OpInput>(o: T): T => o;

const addOp = (
  uuid: string,
  parentUuid: string,
  title: string,
  url: string | undefined = undefined,
  index = 0,
): OpInput =>
  op({
    op: "add",
    data: { uuid, parentUuid, title, url, index },
  });

const wrap = (input: OpInput, seq: number, ts = "2026-01-01T00:00:00Z"): Entry =>
  ({
    ...input,
    seq,
    prevHash: seq === 1 ? "GENESIS" : "x",
    ts,
    deviceId: "device-A",
  }) as Entry;

const seedFolder: TreeState = {
  nodes: {
    "root-bar": {
      uuid: "root-bar",
      parentUuid: null,
      title: "Bookmarks Bar",
      index: 0,
    },
  },
};

describe("applyOp - add", () => {
  it("inserts a new node", () => {
    const next = applyOp(seedFolder, addOp("b1", "root-bar", "A", "https://a", 0));
    expect(next.nodes["b1"]).toEqual({
      uuid: "b1",
      parentUuid: "root-bar",
      title: "A",
      url: "https://a",
      index: 0,
    });
  });

  it("does not mutate the input state", () => {
    applyOp(seedFolder, addOp("b1", "root-bar", "A", "https://a", 0));
    expect(seedFolder.nodes["b1"]).toBeUndefined();
  });

  it("overwrites a node with the same uuid (idempotent re-add)", () => {
    const a = applyOp(seedFolder, addOp("b1", "root-bar", "A", "https://a", 0));
    const b = applyOp(a, addOp("b1", "root-bar", "B", "https://b", 1));
    expect(b.nodes["b1"].title).toBe("B");
    expect(b.nodes["b1"].url).toBe("https://b");
    expect(b.nodes["b1"].index).toBe(1);
  });
});

describe("applyOp - remove", () => {
  it("removes a known node", () => {
    const a = applyOp(seedFolder, addOp("b1", "root-bar", "A", "https://a", 0));
    const b = applyOp(a, { op: "remove", data: { uuid: "b1" } });
    expect(b.nodes["b1"]).toBeUndefined();
    expect(b.nodes["root-bar"]).toBeDefined();
  });

  it("is a no-op for an unknown uuid", () => {
    const next = applyOp(seedFolder, { op: "remove", data: { uuid: "missing" } });
    expect(next).toBe(seedFolder);
  });
});

describe("applyOp - move", () => {
  it("updates parentUuid and index", () => {
    const a = applyOp(seedFolder, addOp("b1", "root-bar", "A", "https://a", 0));
    const b = applyOp(a, {
      op: "move",
      data: { uuid: "b1", parentUuid: "folder-x", index: 5 },
    });
    expect(b.nodes["b1"].parentUuid).toBe("folder-x");
    expect(b.nodes["b1"].index).toBe(5);
    expect(b.nodes["b1"].title).toBe("A");
  });

  it("is a no-op for an unknown uuid", () => {
    const next = applyOp(seedFolder, {
      op: "move",
      data: { uuid: "missing", parentUuid: "x", index: 0 },
    });
    expect(next).toBe(seedFolder);
  });
});

describe("applyOp - rename", () => {
  it("updates the title only", () => {
    const a = applyOp(seedFolder, addOp("b1", "root-bar", "A", "https://a", 0));
    const b = applyOp(a, { op: "rename", data: { uuid: "b1", title: "AA" } });
    expect(b.nodes["b1"].title).toBe("AA");
    expect(b.nodes["b1"].url).toBe("https://a");
  });

  it("is a no-op for an unknown uuid", () => {
    const next = applyOp(seedFolder, {
      op: "rename",
      data: { uuid: "missing", title: "x" },
    });
    expect(next).toBe(seedFolder);
  });
});

describe("applyOp - urlChange", () => {
  it("updates the url only", () => {
    const a = applyOp(seedFolder, addOp("b1", "root-bar", "A", "https://a", 0));
    const b = applyOp(a, {
      op: "urlChange",
      data: { uuid: "b1", url: "https://aa" },
    });
    expect(b.nodes["b1"].url).toBe("https://aa");
    expect(b.nodes["b1"].title).toBe("A");
  });

  it("is a no-op for an unknown uuid", () => {
    const next = applyOp(seedFolder, {
      op: "urlChange",
      data: { uuid: "missing", url: "https://x" },
    });
    expect(next).toBe(seedFolder);
  });
});

describe("applyOp - snapshot", () => {
  it("replaces the entire state", () => {
    const start = applyOp(seedFolder, addOp("b1", "root-bar", "A", "https://a", 0));
    const next = applyOp(start, {
      op: "snapshot",
      data: {
        nodes: [
          { uuid: "root-bar", parentUuid: null, title: "Bookmarks Bar", index: 0 },
          { uuid: "b2", parentUuid: "root-bar", title: "B", url: "https://b", index: 0 },
        ],
      },
    });
    expect(next.nodes["b1"]).toBeUndefined();
    expect(next.nodes["b2"]).toBeDefined();
    expect(next.nodes["b2"].title).toBe("B");
  });
});

describe("applyOp - restore", () => {
  it("is a no-op (restore is a marker; subsequent ops do the work)", () => {
    const next = applyOp(seedFolder, { op: "restore", data: { toSeq: 5 } });
    expect(next).toBe(seedFolder);
  });
});

describe("materialize", () => {
  it("returns empty state for no entries", () => {
    expect(materialize([])).toEqual(emptyState());
  });

  it("replays a sequence of adds", () => {
    const entries: Entry[] = [
      wrap(addOp("root-bar", "0", "Bookmarks Bar", undefined, 0), 1),
      wrap(addOp("b1", "root-bar", "A", "https://a", 0), 2),
      wrap(addOp("b2", "root-bar", "B", "https://b", 1), 3),
    ];
    const state = materialize(entries);
    expect(Object.keys(state.nodes)).toHaveLength(3);
    expect(state.nodes["b2"].title).toBe("B");
  });

  it("replays add + rename + move + remove correctly", () => {
    const entries: Entry[] = [
      wrap(addOp("b1", "root-bar", "A", "https://a", 0), 1),
      wrap({ op: "rename", data: { uuid: "b1", title: "AA" } }, 2),
      wrap({ op: "move", data: { uuid: "b1", parentUuid: "folder-x", index: 3 } }, 3),
      wrap(addOp("b2", "root-bar", "B", "https://b", 0), 4),
      wrap({ op: "remove", data: { uuid: "b1" } }, 5),
    ];
    const state = materialize(entries);
    expect(state.nodes["b1"]).toBeUndefined();
    expect(state.nodes["b2"]).toBeDefined();
  });

  it("snapshot replaces prior state", () => {
    const entries: Entry[] = [
      wrap(addOp("b1", "root-bar", "A", "https://a", 0), 1),
      wrap(
        {
          op: "snapshot",
          data: {
            nodes: [
              { uuid: "b9", parentUuid: "root-bar", title: "Z", url: "https://z", index: 0 },
            ],
          },
        },
        2,
      ),
    ];
    const state = materialize(entries);
    expect(state.nodes["b1"]).toBeUndefined();
    expect(state.nodes["b9"]).toBeDefined();
  });
});

describe("childrenOf", () => {
  it("returns children of a parent sorted by index", () => {
    let state: TreeState = { nodes: {} };
    state = applyOp(state, addOp("b1", "p", "A", "https://a", 2));
    state = applyOp(state, addOp("b2", "p", "B", "https://b", 0));
    state = applyOp(state, addOp("b3", "p", "C", "https://c", 1));
    state = applyOp(state, addOp("z", "other", "Z", "https://z", 0));
    expect(childrenOf(state, "p").map((n) => n.uuid)).toEqual([
      "b2",
      "b3",
      "b1",
    ]);
  });

  it("returns root-level children when given null parent", () => {
    const state: TreeState = {
      nodes: {
        r1: { uuid: "r1", parentUuid: null, title: "R", index: 0 },
        c1: { uuid: "c1", parentUuid: "r1", title: "C", index: 0 },
      },
    };
    expect(childrenOf(state, null).map((n) => n.uuid)).toEqual(["r1"]);
  });
});

describe("toSnapshotNodes", () => {
  it("flattens state into snapshot-node array", () => {
    let state: TreeState = { nodes: {} };
    state = applyOp(state, addOp("b1", "root", "A", "https://a", 0));
    const nodes = toSnapshotNodes(state);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ uuid: "b1", title: "A", index: 0 });
  });
});
