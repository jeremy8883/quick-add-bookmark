import type { OpType, TimestampedOp } from "./log";

export type Conflict =
  | {
      kind: "delete-vs-modify";
      uuid: string;
      winner: "local" | "remote";
      deleteOp: TimestampedOp;
      modifyOps: TimestampedOp[];
    }
  | {
      kind: "modify-vs-modify";
      uuid: string;
      op: OpType;
      winner: "local" | "remote";
      winnerOp: TimestampedOp;
      loserOp: TimestampedOp;
    }
  | {
      kind: "concurrent-add-merge";
      keptUuid: string;
      droppedUuid: string;
      droppedSide: "local" | "remote";
    };

export type MergeResult = {
  applyToLocal: TimestampedOp[];
  appendToLog: TimestampedOp[];
  conflicts: Conflict[];
};

const uuidOf = (op: TimestampedOp): string | null => {
  switch (op.op) {
    case "add":
    case "remove":
    case "move":
    case "rename":
    case "urlChange":
      return op.data.uuid;
    default:
      return null;
  }
};

const groupByUuid = (ops: TimestampedOp[]): Map<string, TimestampedOp[]> => {
  const map = new Map<string, TimestampedOp[]>();
  for (const op of ops) {
    const uuid = uuidOf(op);
    if (uuid === null) continue;
    const list = map.get(uuid);
    if (list) list.push(op);
    else map.set(uuid, [op]);
  }
  return map;
};

const opDataEqual = (a: TimestampedOp, b: TimestampedOp): boolean => {
  if (a.op !== b.op) return false;
  return JSON.stringify(a.data) === JSON.stringify(b.data);
};

const lastByOp = (
  ops: TimestampedOp[],
): Partial<Record<OpType, TimestampedOp>> => {
  const out: Partial<Record<OpType, TimestampedOp>> = {};
  for (const op of ops) {
    const existing = out[op.op];
    if (!existing || op.ts > existing.ts) out[op.op] = op;
  }
  return out;
};

const detectConcurrentAddMerges = (
  localOps: TimestampedOp[],
  remoteOps: TimestampedOp[],
): {
  droppedLocalUuids: Set<string>;
  droppedRemoteUuids: Set<string>;
  appendExtras: TimestampedOp[];
  applyExtras: TimestampedOp[];
  conflicts: Conflict[];
} => {
  const droppedLocalUuids = new Set<string>();
  const droppedRemoteUuids = new Set<string>();
  const appendExtras: TimestampedOp[] = [];
  const applyExtras: TimestampedOp[] = [];
  const conflicts: Conflict[] = [];

  const localAdds = localOps.filter(
    (o): o is TimestampedOp & { op: "add" } => o.op === "add",
  );
  const remoteAdds = remoteOps.filter(
    (o): o is TimestampedOp & { op: "add" } => o.op === "add",
  );

  for (const la of localAdds) {
    for (const ra of remoteAdds) {
      if (la.data.uuid === ra.data.uuid) continue;
      if (droppedLocalUuids.has(la.data.uuid)) continue;
      if (droppedRemoteUuids.has(ra.data.uuid)) continue;
      const sameTarget =
        la.data.parentUuid === ra.data.parentUuid &&
        la.data.title === ra.data.title &&
        (la.data.url ?? "") === (ra.data.url ?? "");
      if (!sameTarget) continue;

      const keep =
        la.data.uuid < ra.data.uuid ? la.data.uuid : ra.data.uuid;
      const drop =
        la.data.uuid < ra.data.uuid ? ra.data.uuid : la.data.uuid;
      const droppedSide: "local" | "remote" =
        drop === la.data.uuid ? "local" : "remote";

      if (droppedSide === "local") {
        droppedLocalUuids.add(drop);
        applyExtras.push({
          op: "remove",
          data: { uuid: drop },
          ts: ra.ts,
          deviceId: ra.deviceId,
        });
        appendExtras.push({
          op: "remove",
          data: { uuid: drop },
          ts: ra.ts,
          deviceId: ra.deviceId,
        });
      } else {
        droppedRemoteUuids.add(drop);
        appendExtras.push({
          op: "remove",
          data: { uuid: drop },
          ts: la.ts,
          deviceId: la.deviceId,
        });
      }

      conflicts.push({
        kind: "concurrent-add-merge",
        keptUuid: keep,
        droppedUuid: drop,
        droppedSide,
      });
    }
  }

  return {
    droppedLocalUuids,
    droppedRemoteUuids,
    appendExtras,
    applyExtras,
    conflicts,
  };
};

export const merge = (
  localOps: TimestampedOp[],
  remoteOps: TimestampedOp[],
): MergeResult => {
  const applyToLocal: TimestampedOp[] = [];
  const appendToLog: TimestampedOp[] = [];
  const conflicts: Conflict[] = [];

  const concurrentAdds = detectConcurrentAddMerges(localOps, remoteOps);
  conflicts.push(...concurrentAdds.conflicts);

  const localFiltered = localOps.filter((o) => {
    const u = uuidOf(o);
    return u === null || !concurrentAdds.droppedLocalUuids.has(u);
  });
  const remoteFiltered = remoteOps.filter((o) => {
    const u = uuidOf(o);
    return u === null || !concurrentAdds.droppedRemoteUuids.has(u);
  });

  const localByUuid = groupByUuid(localFiltered);
  const remoteByUuid = groupByUuid(remoteFiltered);
  const allUuids = new Set<string>([
    ...localByUuid.keys(),
    ...remoteByUuid.keys(),
  ]);

  for (const uuid of allUuids) {
    const local = localByUuid.get(uuid) ?? [];
    const remote = remoteByUuid.get(uuid) ?? [];

    if (local.length === 0) {
      applyToLocal.push(...remote);
      continue;
    }
    if (remote.length === 0) {
      appendToLog.push(...local);
      continue;
    }

    const lRemove = local.find((o) => o.op === "remove");
    const rRemove = remote.find((o) => o.op === "remove");
    const lModifies = local.filter(
      (o) => o.op === "move" || o.op === "rename" || o.op === "urlChange",
    );
    const rModifies = remote.filter(
      (o) => o.op === "move" || o.op === "rename" || o.op === "urlChange",
    );

    if (lRemove && rRemove) {
      appendToLog.push(lRemove);
      continue;
    }

    if (lRemove && rModifies.length > 0) {
      conflicts.push({
        kind: "delete-vs-modify",
        uuid,
        winner: "remote",
        deleteOp: lRemove,
        modifyOps: rModifies,
      });
      applyToLocal.push(...remote);
      continue;
    }

    if (rRemove && lModifies.length > 0) {
      conflicts.push({
        kind: "delete-vs-modify",
        uuid,
        winner: "local",
        deleteOp: rRemove,
        modifyOps: lModifies,
      });
      appendToLog.push(...local);
      continue;
    }

    const lByOp = lastByOp(local);
    const rByOp = lastByOp(remote);
    const opTypes: OpType[] = [
      "add",
      "move",
      "rename",
      "urlChange",
      "remove",
    ];
    for (const op of opTypes) {
      const l = lByOp[op];
      const r = rByOp[op];
      if (l && r) {
        if (opDataEqual(l, r)) {
          appendToLog.push(l);
          continue;
        }
        if (l.ts > r.ts) {
          conflicts.push({
            kind: "modify-vs-modify",
            uuid,
            op,
            winner: "local",
            winnerOp: l,
            loserOp: r,
          });
          appendToLog.push(l);
        } else {
          conflicts.push({
            kind: "modify-vs-modify",
            uuid,
            op,
            winner: "remote",
            winnerOp: r,
            loserOp: l,
          });
          applyToLocal.push(r);
        }
      } else if (l) {
        appendToLog.push(l);
      } else if (r) {
        applyToLocal.push(r);
      }
    }
  }

  applyToLocal.push(...concurrentAdds.applyExtras);
  appendToLog.push(...concurrentAdds.appendExtras);

  return { applyToLocal, appendToLog, conflicts };
};
