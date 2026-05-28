import type { Entry, OpInput, SnapshotNode } from "./log";

export type BookmarkNode = {
  uuid: string;
  parentUuid: string | null;
  title: string;
  url?: string;
  index: number;
};

export type TreeState = {
  nodes: Record<string, BookmarkNode>;
};

export const emptyState = (): TreeState => ({ nodes: {} });

const cloneState = (state: TreeState): TreeState => ({
  nodes: { ...state.nodes },
});

const fromSnapshotNode = (n: SnapshotNode): BookmarkNode => ({
  uuid: n.uuid,
  parentUuid: n.parentUuid,
  title: n.title,
  url: n.url,
  index: n.index,
});

export const applyOp = (state: TreeState, op: OpInput): TreeState => {
  switch (op.op) {
    case "add": {
      const next = cloneState(state);
      const { uuid, parentUuid, title, url, index } = op.data;
      next.nodes[uuid] = { uuid, parentUuid, title, url, index };
      return next;
    }
    case "remove": {
      if (!(op.data.uuid in state.nodes)) return state;
      const next = cloneState(state);
      delete next.nodes[op.data.uuid];
      return next;
    }
    case "move": {
      const node = state.nodes[op.data.uuid];
      if (!node) return state;
      const next = cloneState(state);
      next.nodes[op.data.uuid] = {
        ...node,
        parentUuid: op.data.parentUuid,
        index: op.data.index,
      };
      return next;
    }
    case "rename": {
      const node = state.nodes[op.data.uuid];
      if (!node) return state;
      const next = cloneState(state);
      next.nodes[op.data.uuid] = { ...node, title: op.data.title };
      return next;
    }
    case "urlChange": {
      const node = state.nodes[op.data.uuid];
      if (!node) return state;
      const next = cloneState(state);
      next.nodes[op.data.uuid] = { ...node, url: op.data.url };
      return next;
    }
    case "snapshot": {
      const nodes: Record<string, BookmarkNode> = {};
      for (const n of op.data.nodes) {
        nodes[n.uuid] = fromSnapshotNode(n);
      }
      return { nodes };
    }
    case "restore": {
      return state;
    }
  }
};

export const materialize = (entries: Entry[]): TreeState => {
  let state = emptyState();
  for (const entry of entries) {
    state = applyOp(state, entry);
  }
  return state;
};

export const childrenOf = (
  state: TreeState,
  parentUuid: string | null,
): BookmarkNode[] => {
  const result: BookmarkNode[] = [];
  for (const node of Object.values(state.nodes)) {
    if (node.parentUuid === parentUuid) result.push(node);
  }
  result.sort((a, b) => a.index - b.index);
  return result;
};

export const toSnapshotNodes = (state: TreeState): SnapshotNode[] => {
  return Object.values(state.nodes).map((n) => ({
    uuid: n.uuid,
    parentUuid: n.parentUuid,
    title: n.title,
    url: n.url,
    index: n.index,
  }));
};
