export const GENESIS_PREV_HASH = "GENESIS";

export type AddData = {
  uuid: string;
  parentUuid: string;
  title: string;
  url?: string;
  index: number;
};

export type RemoveData = { uuid: string };

export type MoveData = { uuid: string; parentUuid: string; index: number };

export type RenameData = { uuid: string; title: string };

export type UrlChangeData = { uuid: string; url: string };

export type SnapshotNode = {
  uuid: string;
  parentUuid: string | null;
  title: string;
  url?: string;
  index: number;
};

export type SnapshotData = { nodes: SnapshotNode[] };

export type RestoreData = { toSeq: number };

export type OpInput =
  | { op: "add"; data: AddData }
  | { op: "remove"; data: RemoveData }
  | { op: "move"; data: MoveData }
  | { op: "rename"; data: RenameData }
  | { op: "urlChange"; data: UrlChangeData }
  | { op: "snapshot"; data: SnapshotData }
  | { op: "restore"; data: RestoreData };

export type TimestampedOp = OpInput & { ts: string; deviceId: string };

export type Entry = TimestampedOp & { seq: number; prevHash: string };

export type OpType = OpInput["op"];

const canonicalStringify = (value: unknown): string => {
  if (value === null || value === undefined) return JSON.stringify(value ?? null);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`)
    .join(",")}}`;
};

const toHex = (bytes: Uint8Array): string => {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
};

export const hashEntry = async (entry: Entry): Promise<string> => {
  const text = canonicalStringify(entry);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return toHex(new Uint8Array(digest));
};

export type NewEntryInput = OpInput & {
  deviceId: string;
  ts?: string;
};

export const buildNextEntry = async (
  prev: Entry | undefined,
  input: NewEntryInput,
): Promise<Entry> => {
  const seq = prev ? prev.seq + 1 : 1;
  const prevHash = prev ? await hashEntry(prev) : GENESIS_PREV_HASH;
  const ts = input.ts ?? new Date().toISOString();
  return {
    seq,
    prevHash,
    ts,
    deviceId: input.deviceId,
    op: input.op,
    data: input.data,
  } as Entry;
};

export const serializeEntries = (entries: Entry[]): string =>
  entries.map((e) => canonicalStringify(e)).join("\n");

export const parseEntries = (text: string): Entry[] => {
  if (text.length === 0) return [];
  const lines = text.split("\n");
  const entries: Entry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0) continue;
    try {
      entries.push(JSON.parse(line) as Entry);
    } catch (e) {
      throw new Error(
        `Failed to parse log line ${i + 1}: ${(e as Error).message}`,
      );
    }
  }
  return entries;
};

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string; atSeq: number };

export const verifyChain = async (entries: Entry[]): Promise<VerifyResult> => {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const expectedSeq = i === 0 ? 1 : entries[i - 1].seq + 1;
    if (entry.seq !== expectedSeq) {
      return {
        ok: false,
        reason: `Expected seq ${expectedSeq}, got ${entry.seq}`,
        atSeq: entry.seq,
      };
    }
    if (i === 0) {
      if (entry.prevHash !== GENESIS_PREV_HASH) {
        return {
          ok: false,
          reason: `Genesis entry must have prevHash "${GENESIS_PREV_HASH}"`,
          atSeq: entry.seq,
        };
      }
    } else {
      const expected = await hashEntry(entries[i - 1]);
      if (entry.prevHash !== expected) {
        return {
          ok: false,
          reason: `prevHash mismatch at seq ${entry.seq}`,
          atSeq: entry.seq,
        };
      }
    }
  }
  return { ok: true };
};
