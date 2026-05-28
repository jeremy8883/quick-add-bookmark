import {
  DropboxRevConflict,
  downloadFile,
  uploadFile,
} from "./dropbox";
import { getOrInitDeviceId } from "./identity";
import {
  buildNextEntry,
  hashEntry,
  parseEntries,
  serializeEntries,
  verifyChain,
  type Entry,
  type OpInput,
  type TimestampedOp,
} from "./log";
import { materialize } from "./materialize";
import { diff } from "./diff";
import { merge, type Conflict } from "./merge";
import { applyOpsToChrome, readChromeTree } from "./chrome-tree";
import { get, set } from "./storage";

const LOG_PATH = "/bookmarks.log.jsonl";

export type SyncSummary = {
  result: "ok" | "rev-conflict" | "chain-broken";
  pulledEntries: number;
  remoteOpsConsumed: number;
  localOpsPushed: number;
  conflicts: Conflict[];
  message?: string;
};

const timestampOps = (
  ops: OpInput[],
  ts: string,
  deviceId: string,
): TimestampedOp[] =>
  ops.map((op) => ({ ...op, ts, deviceId }) as TimestampedOp);

const buildTail = async (
  prev: Entry | undefined,
  newOps: TimestampedOp[],
): Promise<Entry[]> => {
  const entries: Entry[] = [];
  let cursor = prev;
  for (const op of newOps) {
    const next = await buildNextEntry(cursor, op);
    entries.push(next);
    cursor = next;
  }
  return entries;
};

export const syncNow = async (): Promise<SyncSummary> => {
  const deviceId = await getOrInitDeviceId();
  const lastConsumedSeq = (await get<number>("lastConsumedSeq")) ?? 0;
  const lastConsumedHash = await get<string | null>("lastConsumedHash");

  const download = await downloadFile(LOG_PATH);
  const remoteFresh = download === null;
  const pulledEntries: Entry[] = remoteFresh
    ? []
    : parseEntries(download.content);
  const pulledRev = download?.rev;

  const chainCheck = await verifyChain(pulledEntries);
  if (chainCheck.ok === false) {
    return {
      result: "chain-broken",
      pulledEntries: pulledEntries.length,
      remoteOpsConsumed: 0,
      localOpsPushed: 0,
      conflicts: [],
      message: chainCheck.reason,
    };
  }

  if (lastConsumedSeq > 0 && lastConsumedHash !== undefined) {
    const idx = pulledEntries.findIndex((e) => e.seq === lastConsumedSeq);
    if (idx === -1) {
      return {
        result: "chain-broken",
        pulledEntries: pulledEntries.length,
        remoteOpsConsumed: 0,
        localOpsPushed: 0,
        conflicts: [],
        message: `Last consumed seq ${lastConsumedSeq} not found in remote log`,
      };
    }
    const actualHash = await hashEntry(pulledEntries[idx]);
    if (actualHash !== lastConsumedHash) {
      return {
        result: "chain-broken",
        pulledEntries: pulledEntries.length,
        remoteOpsConsumed: 0,
        localOpsPushed: 0,
        conflicts: [],
        message: `Hash mismatch at lastConsumedSeq ${lastConsumedSeq}`,
      };
    }
  }

  const ancestorEntries = pulledEntries.filter(
    (e) => e.seq <= lastConsumedSeq,
  );
  const remoteEntries = pulledEntries.filter(
    (e) => e.seq > lastConsumedSeq,
  );
  const ancestorState = materialize(ancestorEntries);

  const { state: currentState, uuidMap } = await readChromeTree();
  const localOpInputs = diff(ancestorState, currentState);

  const now = new Date().toISOString();
  const localTimestamped = timestampOps(localOpInputs, now, deviceId);

  const mergeResult = merge(localTimestamped, remoteEntries);

  await applyOpsToChrome(mergeResult.applyToLocal, uuidMap);

  const lastPulled = pulledEntries[pulledEntries.length - 1];
  const newTail = await buildTail(lastPulled, mergeResult.appendToLog);
  const finalLog = [...pulledEntries, ...newTail];

  let newRev: string;
  try {
    if (newTail.length === 0 && !remoteFresh) {
      newRev = pulledRev!;
    } else {
      const upload = await uploadFile(
        LOG_PATH,
        serializeEntries(finalLog),
        remoteFresh ? { tag: "add" } : { tag: "update", rev: pulledRev! },
      );
      newRev = upload.rev;
    }
  } catch (err) {
    if (err instanceof DropboxRevConflict) {
      return {
        result: "rev-conflict",
        pulledEntries: pulledEntries.length,
        remoteOpsConsumed: remoteEntries.length,
        localOpsPushed: 0,
        conflicts: mergeResult.conflicts,
        message: "Remote log changed during sync; retry",
      };
    }
    throw err;
  }

  const lastFinal = finalLog[finalLog.length - 1];
  if (lastFinal) {
    await set("lastConsumedSeq", lastFinal.seq);
    await set("lastConsumedHash", await hashEntry(lastFinal));
    await set("lastRemoteRev", newRev);
  }
  await set("lastSyncedAt", now);

  return {
    result: "ok",
    pulledEntries: pulledEntries.length,
    remoteOpsConsumed: remoteEntries.length,
    localOpsPushed: newTail.length,
    conflicts: mergeResult.conflicts,
  };
};
