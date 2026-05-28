import type { BookmarkNode, TreeState } from "./materialize";
import type { OpInput } from "./log";

const urlsEqual = (a: string | undefined, b: string | undefined): boolean =>
  (a ?? null) === (b ?? null);

const positionEqual = (a: BookmarkNode, b: BookmarkNode): boolean =>
  a.parentUuid === b.parentUuid && a.index === b.index;

export const diff = (before: TreeState, after: TreeState): OpInput[] => {
  const ops: OpInput[] = [];

  for (const uuid of Object.keys(after.nodes)) {
    if (!(uuid in before.nodes)) {
      const n = after.nodes[uuid];
      if (n.parentUuid === null) continue;
      ops.push({
        op: "add",
        data: {
          uuid,
          parentUuid: n.parentUuid,
          title: n.title,
          url: n.url,
          index: n.index,
        },
      });
    }
  }

  for (const uuid of Object.keys(before.nodes)) {
    if (!(uuid in after.nodes)) {
      ops.push({ op: "remove", data: { uuid } });
    }
  }

  for (const uuid of Object.keys(after.nodes)) {
    const a = before.nodes[uuid];
    const b = after.nodes[uuid];
    if (!a) continue;

    if (a.title !== b.title) {
      ops.push({ op: "rename", data: { uuid, title: b.title } });
    }
    if (!urlsEqual(a.url, b.url)) {
      ops.push({ op: "urlChange", data: { uuid, url: b.url ?? "" } });
    }
    if (!positionEqual(a, b)) {
      if (b.parentUuid === null) continue;
      ops.push({
        op: "move",
        data: { uuid, parentUuid: b.parentUuid, index: b.index },
      });
    }
  }

  return ops;
};
