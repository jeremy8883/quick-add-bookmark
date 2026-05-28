import { describe, it, expect } from "vitest";
import { diff } from "./diff";
import { applyOp, emptyState, type TreeState } from "./materialize";
import type { OpInput } from "./log";

const addOp = (
  uuid: string,
  parentUuid: string,
  title: string,
  url: string | undefined,
  index: number,
): OpInput => ({
  op: "add",
  data: { uuid, parentUuid, title, url, index },
});

const buildState = (...ops: OpInput[]): TreeState => {
  let state = emptyState();
  for (const op of ops) state = applyOp(state, op);
  return state;
};

describe("diff - no changes", () => {
  it("returns no ops when before and after are equal", () => {
    const state = buildState(addOp("b1", "root", "A", "https://a", 0));
    expect(diff(state, state)).toEqual([]);
  });
});

describe("diff - additions", () => {
  it("emits an add op for a new node", () => {
    const before = emptyState();
    const after = buildState(addOp("b1", "root", "A", "https://a", 0));
    expect(diff(before, after)).toEqual([
      {
        op: "add",
        data: { uuid: "b1", parentUuid: "root", title: "A", url: "https://a", index: 0 },
      },
    ]);
  });

  it("skips root-level nodes (parentUuid null)", () => {
    const before = emptyState();
    const after: TreeState = {
      nodes: {
        "root-bar": { uuid: "root-bar", parentUuid: null, title: "Bookmarks Bar", index: 0 },
      },
    };
    expect(diff(before, after)).toEqual([]);
  });
});

describe("diff - removals", () => {
  it("emits a remove op for a missing node", () => {
    const before = buildState(addOp("b1", "root", "A", "https://a", 0));
    const after = emptyState();
    expect(diff(before, after)).toEqual([{ op: "remove", data: { uuid: "b1" } }]);
  });
});

describe("diff - modifications", () => {
  it("emits rename when title changes", () => {
    const before = buildState(addOp("b1", "root", "A", "https://a", 0));
    const after = applyOp(before, { op: "rename", data: { uuid: "b1", title: "AA" } });
    expect(diff(before, after)).toEqual([
      { op: "rename", data: { uuid: "b1", title: "AA" } },
    ]);
  });

  it("emits urlChange when url changes", () => {
    const before = buildState(addOp("b1", "root", "A", "https://a", 0));
    const after = applyOp(before, {
      op: "urlChange",
      data: { uuid: "b1", url: "https://aa" },
    });
    expect(diff(before, after)).toEqual([
      { op: "urlChange", data: { uuid: "b1", url: "https://aa" } },
    ]);
  });

  it("emits move when parent changes", () => {
    const before = buildState(addOp("b1", "root", "A", "https://a", 0));
    const after = applyOp(before, {
      op: "move",
      data: { uuid: "b1", parentUuid: "folder-x", index: 0 },
    });
    expect(diff(before, after)).toEqual([
      { op: "move", data: { uuid: "b1", parentUuid: "folder-x", index: 0 } },
    ]);
  });

  it("emits move when only index changes within same parent", () => {
    const before = buildState(addOp("b1", "root", "A", "https://a", 0));
    const after = applyOp(before, {
      op: "move",
      data: { uuid: "b1", parentUuid: "root", index: 3 },
    });
    expect(diff(before, after)).toEqual([
      { op: "move", data: { uuid: "b1", parentUuid: "root", index: 3 } },
    ]);
  });

  it("emits rename + urlChange + move when all three change", () => {
    const before = buildState(addOp("b1", "root", "A", "https://a", 0));
    const after: TreeState = {
      nodes: {
        b1: { uuid: "b1", parentUuid: "folder-x", title: "AA", url: "https://aa", index: 5 },
      },
    };
    const ops = diff(before, after);
    const kinds = ops.map((o) => o.op).sort();
    expect(kinds).toEqual(["move", "rename", "urlChange"]);
  });
});

describe("diff - mixed", () => {
  it("emits adds, removes, and modifications together", () => {
    const before = buildState(
      addOp("b1", "root", "A", "https://a", 0),
      addOp("b2", "root", "B", "https://b", 1),
    );
    const after = buildState(
      addOp("b2", "root", "BB", "https://b", 1),
      addOp("b3", "root", "C", "https://c", 2),
    );
    const ops = diff(before, after);
    const kinds = ops.map((o) => o.op).sort();
    expect(kinds).toEqual(["add", "remove", "rename"]);
  });
});
