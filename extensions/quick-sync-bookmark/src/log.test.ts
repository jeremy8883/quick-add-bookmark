import { describe, it, expect } from "vitest";
import {
  buildNextEntry,
  hashEntry,
  parseEntries,
  serializeEntries,
  verifyChain,
  type Entry,
} from "./log";

const addInput = (uuid: string, title: string, url: string) => ({
  op: "add" as const,
  data: {
    uuid,
    parentUuid: "root",
    title,
    url,
    index: 0,
  },
  deviceId: "device-A",
  ts: "2026-01-01T00:00:00.000Z",
});

const buildChain = async (count: number): Promise<Entry[]> => {
  const entries: Entry[] = [];
  let prev: Entry | undefined;
  for (let i = 0; i < count; i++) {
    const next = await buildNextEntry(prev, {
      ...addInput(`uuid-${i}`, `bm-${i}`, `https://example.com/${i}`),
      ts: `2026-01-01T00:00:0${i}.000Z`,
    });
    entries.push(next);
    prev = next;
  }
  return entries;
};

describe("buildNextEntry", () => {
  it("first entry has seq 1 and null prevHash", async () => {
    const e = await buildNextEntry(undefined, addInput("u1", "A", "https://a"));
    expect(e.seq).toBe(1);
    expect(e.prevHash).toBeNull();
    expect(e.op).toBe("add");
    expect(e.deviceId).toBe("device-A");
  });

  it("subsequent entry increments seq and links to prevHash", async () => {
    const first = await buildNextEntry(undefined, addInput("u1", "A", "https://a"));
    const second = await buildNextEntry(first, addInput("u2", "B", "https://b"));
    expect(second.seq).toBe(2);
    expect(second.prevHash).toBe(await hashEntry(first));
  });

  it("defaults ts to ISO string when not provided", async () => {
    const e = await buildNextEntry(undefined, {
      op: "add",
      data: { uuid: "u1", parentUuid: "root", title: "A", url: "https://a", index: 0 },
      deviceId: "d",
    });
    expect(e.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe("hashEntry", () => {
  it("returns a 64-char hex SHA-256 digest", async () => {
    const e = await buildNextEntry(undefined, addInput("u1", "A", "https://a"));
    const h = await hashEntry(e);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for identical entries", async () => {
    const e1 = await buildNextEntry(undefined, addInput("u1", "A", "https://a"));
    const e2 = await buildNextEntry(undefined, addInput("u1", "A", "https://a"));
    expect(await hashEntry(e1)).toBe(await hashEntry(e2));
  });

  it("changes when any field changes", async () => {
    const e1 = await buildNextEntry(undefined, addInput("u1", "A", "https://a"));
    const e2 = await buildNextEntry(undefined, addInput("u1", "B", "https://a"));
    expect(await hashEntry(e1)).not.toBe(await hashEntry(e2));
  });
});

describe("serializeEntries / parseEntries", () => {
  it("round-trips a chain", async () => {
    const entries = await buildChain(3);
    const text = serializeEntries(entries);
    const parsed = parseEntries(text);
    expect(parsed).toEqual(entries);
  });

  it("serializes one entry per line", async () => {
    const entries = await buildChain(3);
    const text = serializeEntries(entries);
    expect(text.split("\n")).toHaveLength(3);
  });

  it("parses an empty string as an empty array", () => {
    expect(parseEntries("")).toEqual([]);
  });

  it("tolerates trailing newline", async () => {
    const entries = await buildChain(2);
    const text = serializeEntries(entries) + "\n";
    expect(parseEntries(text)).toEqual(entries);
  });

  it("throws with line number on malformed JSON", () => {
    expect(() => parseEntries('{"seq":1}\nnot json')).toThrow(/line 2/);
  });
});

describe("verifyChain", () => {
  it("accepts an empty log", async () => {
    const result = await verifyChain([]);
    expect(result.ok).toBe(true);
  });

  it("accepts a well-formed single-entry log", async () => {
    const entries = await buildChain(1);
    expect(await verifyChain(entries)).toEqual({ ok: true });
  });

  it("accepts a well-formed multi-entry log", async () => {
    const entries = await buildChain(5);
    expect(await verifyChain(entries)).toEqual({ ok: true });
  });

  it("rejects genesis entry with wrong prevHash", async () => {
    const entries = await buildChain(2);
    entries[0].prevHash = "not-genesis";
    expect(await verifyChain(entries)).toMatchObject({
      ok: false,
      atSeq: 1,
      reason: expect.stringMatching(/Genesis/i),
    });
  });

  it("detects a tampered middle entry (downstream prevHash mismatch)", async () => {
    const entries = await buildChain(4);
    if (entries[1].op === "add") {
      entries[1].data.title = "TAMPERED";
    }
    expect(await verifyChain(entries)).toMatchObject({
      ok: false,
      atSeq: 3,
      reason: expect.stringMatching(/prevHash/),
    });
  });

  it("detects a non-monotonic seq", async () => {
    const entries = await buildChain(3);
    entries[2].seq = 99;
    expect(await verifyChain(entries)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/seq/),
    });
  });

  it("detects truncation: cannot detect from log alone, but parses cleanly", async () => {
    const entries = await buildChain(5);
    const truncated = entries.slice(0, 3);
    expect(await verifyChain(truncated)).toEqual({ ok: true });
  });
});
