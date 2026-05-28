import type { OpInput } from "./log";
import { assignUuid, loadMap, saveMap, type UuidMap } from "./identity";
import type { BookmarkNode, TreeState } from "./materialize";
import {
  isPlatformRootId,
  logicalUuidToPlatformId,
  platformIdToLogicalUuid,
} from "./roots";

type ChromeNode = chrome.bookmarks.BookmarkTreeNode;

export type ChromeTreeResult = {
  state: TreeState;
  uuidMap: UuidMap;
};

const collectNonRootNodes = (
  roots: ChromeNode[],
  out: ChromeNode[] = [],
): ChromeNode[] => {
  for (const node of roots) {
    if (!isPlatformRootId(node.id)) out.push(node);
    if (node.children) collectNonRootNodes(node.children, out);
  }
  return out;
};

const resolveParentUuid = (
  parentId: string | undefined,
  uuidMap: UuidMap,
): string | null => {
  if (!parentId) return null;
  const logical = platformIdToLogicalUuid(parentId);
  if (logical) return logical;
  return uuidMap[parentId] ?? null;
};

export const treeStateFromChromeNodes = (
  rootNodes: ChromeNode[],
  initialMap: UuidMap,
  generate: () => string = () => crypto.randomUUID(),
): ChromeTreeResult => {
  const nonRoots = collectNonRootNodes(rootNodes);
  let map = initialMap;
  for (const node of nonRoots) {
    const result = assignUuid(map, node.id, generate);
    map = result.map;
  }

  const nodes: Record<string, BookmarkNode> = {};
  for (const node of nonRoots) {
    const uuid = map[node.id];
    const parentUuid = resolveParentUuid(node.parentId, map);
    if (!parentUuid) continue;
    nodes[uuid] = {
      uuid,
      parentUuid,
      title: node.title,
      url: node.url,
      index: node.index ?? 0,
    };
  }

  return { state: { nodes }, uuidMap: map };
};

export const readChromeTree = async (): Promise<ChromeTreeResult> => {
  const initialMap = await loadMap();
  const tree = await chrome.bookmarks.getTree();
  const result = treeStateFromChromeNodes(tree, initialMap);
  if (result.uuidMap !== initialMap) {
    await saveMap(result.uuidMap);
  }
  return result;
};

const resolveParentChromeId = (
  parentUuid: string,
  uuidMap: UuidMap,
): string | null => {
  const platform = logicalUuidToPlatformId(parentUuid);
  if (platform) return platform;
  for (const [chromeId, uuid] of Object.entries(uuidMap)) {
    if (uuid === parentUuid) return chromeId;
  }
  return null;
};

const chromeIdForUuid = (
  uuid: string,
  uuidMap: UuidMap,
): string | null => {
  const platform = logicalUuidToPlatformId(uuid);
  if (platform) return platform;
  for (const [chromeId, mapped] of Object.entries(uuidMap)) {
    if (mapped === uuid) return chromeId;
  }
  return null;
};

type AddOp = Extract<OpInput, { op: "add" }>;

const topoSortAdds = (adds: AddOp[], uuidMap: UuidMap): AddOp[] => {
  const batchUuids = new Set(adds.map((a) => a.data.uuid));
  const isParentResolvable = (parentUuid: string): boolean => {
    if (logicalUuidToPlatformId(parentUuid)) return true;
    if (chromeIdForUuid(parentUuid, uuidMap)) return true;
    return false;
  };

  const sorted: AddOp[] = [];
  const emitted = new Set<string>();
  const remaining = [...adds];
  while (remaining.length > 0) {
    let progressed = false;
    for (let i = 0; i < remaining.length; ) {
      const op = remaining[i];
      const parentUuid = op.data.parentUuid;
      const parentReady =
        isParentResolvable(parentUuid) ||
        (batchUuids.has(parentUuid) && emitted.has(parentUuid));
      if (parentReady) {
        sorted.push(op);
        emitted.add(op.data.uuid);
        remaining.splice(i, 1);
        progressed = true;
      } else {
        i++;
      }
    }
    if (!progressed) {
      sorted.push(...remaining);
      break;
    }
  }
  return sorted;
};

type ApplyOptions = {
  suppress?: (chromeId: string) => void;
};

export const applyOpsToChrome = async (
  ops: OpInput[],
  initialMap: UuidMap,
  opts: ApplyOptions = {},
): Promise<UuidMap> => {
  const map = { ...initialMap };

  const adds = ops.filter((o): o is AddOp => o.op === "add");
  const modifies = ops.filter(
    (o) => o.op === "move" || o.op === "rename" || o.op === "urlChange",
  );
  const removes = ops.filter((o) => o.op === "remove");

  const sortedAdds = topoSortAdds(adds, map);

  for (const op of sortedAdds) {
    const { uuid, parentUuid, title, url, index } = op.data;
    const parentId = resolveParentChromeId(parentUuid, map);
    if (!parentId) continue;
    const created = await chrome.bookmarks.create({
      parentId,
      title,
      url,
      index,
    });
    map[created.id] = uuid;
    opts.suppress?.(created.id);
  }

  for (const op of modifies) {
    if (op.op === "move") {
      const chromeId = chromeIdForUuid(op.data.uuid, map);
      if (!chromeId) continue;
      const parentId = resolveParentChromeId(op.data.parentUuid, map);
      if (!parentId) continue;
      await chrome.bookmarks.move(chromeId, {
        parentId,
        index: op.data.index,
      });
      opts.suppress?.(chromeId);
    } else if (op.op === "rename") {
      const chromeId = chromeIdForUuid(op.data.uuid, map);
      if (!chromeId) continue;
      await chrome.bookmarks.update(chromeId, { title: op.data.title });
      opts.suppress?.(chromeId);
    } else if (op.op === "urlChange") {
      const chromeId = chromeIdForUuid(op.data.uuid, map);
      if (!chromeId) continue;
      await chrome.bookmarks.update(chromeId, { url: op.data.url });
      opts.suppress?.(chromeId);
    }
  }

  for (const op of removes) {
    if (op.op !== "remove") continue;
    const chromeId = chromeIdForUuid(op.data.uuid, map);
    if (!chromeId) continue;
    try {
      await chrome.bookmarks.removeTree(chromeId);
    } catch {
      // Already gone (likely cascade-removed by a parent's removeTree).
    }
    opts.suppress?.(chromeId);
    delete map[chromeId];
  }

  await saveMap(map);
  return map;
};
