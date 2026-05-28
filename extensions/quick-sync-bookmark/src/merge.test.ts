import { describe, it, expect } from "vitest";
import { merge } from "./merge";
import type { TimestampedOp } from "./log";

const T = (ts: number): string =>
  new Date(2026, 0, 1, 0, 0, ts).toISOString();

const addOp = (
  uuid: string,
  parentUuid: string,
  title: string,
  url: string | undefined,
  index: number,
  ts: string,
  deviceId = "device-A",
): TimestampedOp => ({
  op: "add",
  data: { uuid, parentUuid, title, url, index },
  ts,
  deviceId,
});

const renameOp = (
  uuid: string,
  title: string,
  ts: string,
  deviceId = "device-A",
): TimestampedOp => ({
  op: "rename",
  data: { uuid, title },
  ts,
  deviceId,
});

const urlChangeOp = (
  uuid: string,
  url: string,
  ts: string,
  deviceId = "device-A",
): TimestampedOp => ({
  op: "urlChange",
  data: { uuid, url },
  ts,
  deviceId,
});

const moveOp = (
  uuid: string,
  parentUuid: string,
  index: number,
  ts: string,
  deviceId = "device-A",
): TimestampedOp => ({
  op: "move",
  data: { uuid, parentUuid, index },
  ts,
  deviceId,
});

const removeOp = (
  uuid: string,
  ts: string,
  deviceId = "device-A",
): TimestampedOp => ({
  op: "remove",
  data: { uuid },
  ts,
  deviceId,
});

describe("merge - empty cases", () => {
  it("returns empty result for empty inputs", () => {
    const result = merge([], []);
    expect(result.applyToLocal).toEqual([]);
    expect(result.appendToLog).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it("only local ops → pushed; no conflicts", () => {
    const local = [renameOp("b1", "A", T(0))];
    const result = merge(local, []);
    expect(result.appendToLog).toEqual(local);
    expect(result.applyToLocal).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it("only remote ops → applied locally; no conflicts", () => {
    const remote = [renameOp("b1", "A", T(0), "device-B")];
    const result = merge([], remote);
    expect(result.applyToLocal).toEqual(remote);
    expect(result.appendToLog).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });
});

describe("merge - non-overlapping (different uuids)", () => {
  it("keeps both sides when ops target different uuids", () => {
    const local = [renameOp("b1", "A", T(0))];
    const remote = [renameOp("b2", "B", T(0), "device-B")];
    const result = merge(local, remote);
    expect(result.applyToLocal).toEqual(remote);
    expect(result.appendToLog).toEqual(local);
    expect(result.conflicts).toEqual([]);
  });
});

describe("merge - same uuid, same op, same value (dedupe)", () => {
  it("dedupes identical rename ops", () => {
    const op = renameOp("b1", "A", T(0));
    const result = merge([op], [{ ...op, deviceId: "device-B" }]);
    expect(result.applyToLocal).toEqual([]);
    expect(result.appendToLog).toHaveLength(1);
    expect(result.conflicts).toEqual([]);
  });
});

describe("merge - modify vs modify (later ts wins)", () => {
  it("local wins when its ts is later", () => {
    const local = [renameOp("b1", "LOCAL", T(10))];
    const remote = [renameOp("b1", "REMOTE", T(5), "device-B")];
    const result = merge(local, remote);
    expect(result.appendToLog).toEqual(local);
    expect(result.applyToLocal).toEqual([]);
    expect(result.conflicts).toMatchObject([
      { kind: "modify-vs-modify", uuid: "b1", op: "rename", winner: "local" },
    ]);
  });

  it("remote wins when its ts is later", () => {
    const local = [renameOp("b1", "LOCAL", T(5))];
    const remote = [renameOp("b1", "REMOTE", T(10), "device-B")];
    const result = merge(local, remote);
    expect(result.applyToLocal).toEqual(remote);
    expect(result.appendToLog).toEqual([]);
    expect(result.conflicts).toMatchObject([
      { kind: "modify-vs-modify", uuid: "b1", op: "rename", winner: "remote" },
    ]);
  });

  it("resolves move-vs-move with later ts", () => {
    const local = [moveOp("b1", "p1", 0, T(20))];
    const remote = [moveOp("b1", "p2", 1, T(5), "device-B")];
    const result = merge(local, remote);
    expect(result.appendToLog).toEqual(local);
    expect(result.conflicts).toMatchObject([
      { kind: "modify-vs-modify", op: "move", winner: "local" },
    ]);
  });

  it("resolves urlChange-vs-urlChange with later ts", () => {
    const local = [urlChangeOp("b1", "https://local", T(5))];
    const remote = [urlChangeOp("b1", "https://remote", T(10), "device-B")];
    const result = merge(local, remote);
    expect(result.applyToLocal).toEqual(remote);
    expect(result.conflicts).toMatchObject([
      { kind: "modify-vs-modify", op: "urlChange", winner: "remote" },
    ]);
  });
});

describe("merge - modify on different fields (no conflict)", () => {
  it("local rename + remote urlChange on same uuid → both apply", () => {
    const local = [renameOp("b1", "AA", T(0))];
    const remote = [urlChangeOp("b1", "https://aa", T(0), "device-B")];
    const result = merge(local, remote);
    expect(result.appendToLog).toEqual(local);
    expect(result.applyToLocal).toEqual(remote);
    expect(result.conflicts).toEqual([]);
  });
});

describe("merge - remove vs modify (modify wins)", () => {
  it("local removed, remote modified → remote wins, conflict recorded", () => {
    const local = [removeOp("b1", T(0))];
    const remote = [renameOp("b1", "AA", T(0), "device-B")];
    const result = merge(local, remote);
    expect(result.applyToLocal).toEqual(remote);
    expect(result.appendToLog).toEqual([]);
    expect(result.conflicts).toMatchObject([
      { kind: "delete-vs-modify", uuid: "b1", winner: "remote" },
    ]);
  });

  it("remote removed, local modified → local wins, conflict recorded", () => {
    const local = [renameOp("b1", "AA", T(0))];
    const remote = [removeOp("b1", T(0), "device-B")];
    const result = merge(local, remote);
    expect(result.appendToLog).toEqual(local);
    expect(result.applyToLocal).toEqual([]);
    expect(result.conflicts).toMatchObject([
      { kind: "delete-vs-modify", uuid: "b1", winner: "local" },
    ]);
  });

  it("ts is ignored for delete-vs-modify (modify always wins)", () => {
    const local = [removeOp("b1", T(100))];
    const remote = [renameOp("b1", "AA", T(0), "device-B")];
    const result = merge(local, remote);
    expect(result.conflicts).toMatchObject([
      { winner: "remote" },
    ]);
  });
});

describe("merge - remove on both sides (dedupe)", () => {
  it("both removed → single remove pushed, no conflict", () => {
    const local = [removeOp("b1", T(0))];
    const remote = [removeOp("b1", T(5), "device-B")];
    const result = merge(local, remote);
    expect(result.appendToLog).toHaveLength(1);
    expect(result.applyToLocal).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });
});

describe("merge - concurrent add (auto-merge)", () => {
  it("merges when url + title + parentUuid all match", () => {
    const local = [addOp("uuid-L", "p", "Example", "https://e", 0, T(0))];
    const remote = [
      addOp("uuid-R", "p", "Example", "https://e", 0, T(0), "device-B"),
    ];
    const result = merge(local, remote);
    expect(result.conflicts).toMatchObject([
      {
        kind: "concurrent-add-merge",
        keptUuid: "uuid-L",
        droppedUuid: "uuid-R",
        droppedSide: "remote",
      },
    ]);
    expect(result.appendToLog).toContainEqual(
      expect.objectContaining({ op: "remove", data: { uuid: "uuid-R" } }),
    );
    expect(result.applyToLocal).not.toContainEqual(
      expect.objectContaining({ data: { uuid: "uuid-R", parentUuid: "p", title: "Example", url: "https://e", index: 0 } }),
    );
  });

  it("keeps the lower uuid (remote wins when remote < local)", () => {
    const local = [addOp("uuid-Z", "p", "Example", "https://e", 0, T(0))];
    const remote = [
      addOp("uuid-A", "p", "Example", "https://e", 0, T(0), "device-B"),
    ];
    const result = merge(local, remote);
    expect(result.conflicts).toMatchObject([
      {
        kind: "concurrent-add-merge",
        keptUuid: "uuid-A",
        droppedUuid: "uuid-Z",
        droppedSide: "local",
      },
    ]);
    expect(result.applyToLocal).toContainEqual(
      expect.objectContaining({ op: "remove", data: { uuid: "uuid-Z" } }),
    );
    expect(result.appendToLog).toContainEqual(
      expect.objectContaining({ op: "remove", data: { uuid: "uuid-Z" } }),
    );
  });

  it("does NOT merge when titles differ", () => {
    const local = [addOp("uuid-L", "p", "Local Title", "https://e", 0, T(0))];
    const remote = [
      addOp("uuid-R", "p", "Remote Title", "https://e", 0, T(0), "device-B"),
    ];
    const result = merge(local, remote);
    expect(result.conflicts).toEqual([]);
    expect(result.appendToLog).toContainEqual(local[0]);
    expect(result.applyToLocal).toContainEqual(remote[0]);
  });

  it("does NOT merge when urls differ", () => {
    const local = [addOp("uuid-L", "p", "Example", "https://a", 0, T(0))];
    const remote = [
      addOp("uuid-R", "p", "Example", "https://b", 0, T(0), "device-B"),
    ];
    const result = merge(local, remote);
    expect(result.conflicts).toEqual([]);
  });

  it("does NOT merge when parentUuid differs", () => {
    const local = [addOp("uuid-L", "p1", "Example", "https://e", 0, T(0))];
    const remote = [
      addOp("uuid-R", "p2", "Example", "https://e", 0, T(0), "device-B"),
    ];
    const result = merge(local, remote);
    expect(result.conflicts).toEqual([]);
  });
});
