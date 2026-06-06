/**
 * Core tree rendering — builds the folder tree DOM and handles
 * expand/collapse toggling.
 */

import { FOLDER_SVG, BOOKMARK_LEAF_SVG } from "./constants";
import { showContextMenu } from "./tree-actions";
import { countBookmarksDeep } from "./tree-counts";

export interface TreeState {
  selectedFolderId: string | null;
  onFolderSelected: ((folderId: string) => void) | null;
  onTreeChanged?: (() => void) | null;
  /** ID of the bookmark being edited in the popup */
  editingBookmarkId?: string | null;
  /** Called when deleteFolder moves the edited bookmark to a safe parent */
  onBookmarkRescued?: ((newParentId: string) => void) | null;
  /** Called when a bookmark leaf is activated (click or Enter) */
  onBookmarkSelected?:
    | ((node: chrome.bookmarks.BookmarkTreeNode, event: MouseEvent) => void)
    | null;
}

export interface BuildTreeOptions {
  /** When true, leaf bookmarks render as tree items (default: false, folders only). */
  renderBookmarks?: boolean;
  /**
   * When true, clicking a folder row toggles its expand state instead of
   * selecting it. Use for navigate-style trees where folder selection
   * has no meaning (e.g. the go-to popup).
   */
  clickFolderTogglesExpand?: boolean;
  /** When true, right-click does not show the folder context menu. */
  disableContextMenu?: boolean;
}

/**
 * Walk the bookmark tree to find the path from root to targetId.
 * Populates pathSet with every node ID on that path.
 */
export const findPathToTarget = (
  node: chrome.bookmarks.BookmarkTreeNode,
  targetId: string,
  pathSet: Set<string>,
): boolean => {
  if (node.id === targetId) {
    pathSet.add(node.id);
    return true;
  }
  if (node.children) {
    for (const child of node.children) {
      if (findPathToTarget(child, targetId, pathSet)) {
        pathSet.add(node.id);
        return true;
      }
    }
  }
  return false;
};

/**
 * After expanding a folder, scroll to reveal children without losing
 * sight of the parent.  Strategy: scroll the last child into view first
 * (pulls the viewport down), then scroll the parent back into view
 * (pulls up just enough so the parent stays visible).  When the children
 * fit on screen both calls are effectively no-ops thanks to "nearest".
 */
export const scrollExpandedIntoView = (
  parentItem: HTMLElement,
  childContainer: HTMLElement,
): void => {
  requestAnimationFrame(() => {
    const lastChild = childContainer.querySelector(
      ":scope > :last-child > .tree-item",
    ) as HTMLElement | null;
    if (lastChild) {
      lastChild.scrollIntoView({ block: "nearest" });
    }
    parentItem.scrollIntoView({ block: "nearest" });
  });
};

const toggleExpand = (
  childContainer: HTMLElement,
  toggle: HTMLElement,
  item: HTMLElement,
): boolean => {
  const isOpen = childContainer.classList.toggle("open");
  toggle.classList.toggle("expanded", isOpen);
  item.setAttribute("aria-expanded", String(isOpen));
  return isOpen;
};

/**
 * Recursively build a DOM subtree for a bookmark folder node.
 * Returns null for leaf bookmarks unless options.renderBookmarks is true.
 */
export const buildTreeNode = (
  node: chrome.bookmarks.BookmarkTreeNode,
  depth: number,
  pathToTarget: Set<string>,
  targetId: string,
  treeContainer: HTMLElement,
  state: TreeState,
  options: BuildTreeOptions = {},
): HTMLElement | null => {
  if (!node.children) {
    if (!options.renderBookmarks || !node.url) return null;
    return buildBookmarkLeaf(node, depth, state);
  }

  const wrapper = document.createElement("div");
  wrapper.setAttribute("role", "none");

  const item = document.createElement("div");
  item.className = "tree-item";
  item.setAttribute("role", "treeitem");
  item.style.paddingLeft = 8 + depth * 16 + "px";
  item.dataset.id = node.id;

  const isExpandable = options.renderBookmarks
    ? node.children.length > 0
    : node.children.some((c) => c.children);

  // Toggle arrow — clickable expand/collapse control
  const toggle = document.createElement("span");
  toggle.className = "tree-toggle" + (isExpandable ? "" : " empty");
  item.appendChild(toggle);

  // Folder icon
  const iconSpan = document.createElement("span");
  iconSpan.innerHTML = FOLDER_SVG;
  item.appendChild(iconSpan.firstElementChild!);

  // Label
  const label = document.createElement("span");
  label.className = "tree-label";
  label.textContent = node.title || "Bookmarks";
  item.appendChild(label);

  // Bookmark count (recursive — all non-folder descendants)
  const bookmarkCount = countBookmarksDeep(node);
  if (bookmarkCount > 0) {
    const count = document.createElement("span");
    count.className = "tree-count";
    count.textContent = String(bookmarkCount);
    item.appendChild(count);
  }

  wrapper.appendChild(item);

  // Children container
  const childContainer = document.createElement("div");
  childContainer.className = "tree-children";
  childContainer.setAttribute("role", "group");

  if (pathToTarget.has(node.id)) {
    childContainer.classList.add("open");
    toggle.classList.add("expanded");
  }

  // ARIA expanded state
  if (isExpandable) {
    item.setAttribute("aria-expanded", pathToTarget.has(node.id) ? "true" : "false");
  }

  for (const child of node.children) {
    const childEl = buildTreeNode(
      child,
      depth + 1,
      pathToTarget,
      targetId,
      treeContainer,
      state,
      options,
    );
    if (childEl) childContainer.appendChild(childEl);
  }

  wrapper.appendChild(childContainer);

  // Pre-select target
  item.setAttribute("aria-selected", node.id === targetId ? "true" : "false");
  if (node.id === targetId) {
    item.classList.add("selected");
    state.selectedFolderId = node.id;
  }

  // Click the toggle icon to expand/collapse
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isExpandable) {
      const opened = toggleExpand(childContainer, toggle, item);
      if (opened) scrollExpandedIntoView(item, childContainer);
    }
  });

  // Single click on row: select folder (or toggle expand in navigate mode)
  item.addEventListener("click", (e) => {
    e.stopPropagation();
    if (options.clickFolderTogglesExpand) {
      if (isExpandable) {
        const opened = toggleExpand(childContainer, toggle, item);
        if (opened) scrollExpandedIntoView(item, childContainer);
      }
      return;
    }
    const prev = treeContainer.querySelector(".selected");
    if (prev) {
      prev.classList.remove("selected");
      prev.setAttribute("aria-selected", "false");
    }
    item.classList.add("selected");
    item.setAttribute("aria-selected", "true");
    state.selectedFolderId = node.id;
    state.onFolderSelected?.(node.id);
  });

  // Double click on row: expand/collapse
  item.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    if (isExpandable) {
      const opened = toggleExpand(childContainer, toggle, item);
      if (opened) scrollExpandedIntoView(item, childContainer);
    }
  });

  // Right-click context menu
  if (!options.disableContextMenu) {
    item.addEventListener("contextmenu", (e) => {
      e.stopPropagation();
      showContextMenu(e, node.id, treeContainer, state);
    });
  }

  return wrapper;
};

/**
 * Build a 16px favicon image element for a page URL. Uses Chrome's
 * built-in `_favicon` endpoint (requires the "favicon" permission in
 * the host extension's manifest). Chrome returns its cached favicon
 * when known, or a generic placeholder otherwise — no network fetch.
 */
export const buildFaviconIcon = (pageUrl: string): HTMLImageElement => {
  const img = document.createElement("img");
  img.className = "tree-icon tree-favicon";
  img.width = 16;
  img.height = 16;
  img.loading = "lazy";
  img.alt = "";
  img.src = chrome.runtime.getURL(
    `/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`,
  );
  return img;
};

const buildBookmarkLeaf = (
  node: chrome.bookmarks.BookmarkTreeNode,
  depth: number,
  state: TreeState,
): HTMLElement => {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("role", "none");

  const item = document.createElement("div");
  item.className = "tree-item tree-bookmark";
  item.setAttribute("role", "treeitem");
  item.style.paddingLeft = 8 + depth * 16 + "px";
  item.dataset.id = node.id;
  if (node.url) item.dataset.url = node.url;

  // Empty toggle spacer for alignment with sibling folders
  const toggle = document.createElement("span");
  toggle.className = "tree-toggle empty";
  item.appendChild(toggle);

  if (node.url) {
    item.appendChild(buildFaviconIcon(node.url));
  } else {
    const iconSpan = document.createElement("span");
    iconSpan.innerHTML = BOOKMARK_LEAF_SVG;
    item.appendChild(iconSpan.firstElementChild!);
  }

  const label = document.createElement("span");
  label.className = "tree-label";
  label.textContent = node.title || node.url || "";
  item.appendChild(label);

  wrapper.appendChild(item);

  item.addEventListener("click", (e) => {
    e.stopPropagation();
    state.onBookmarkSelected?.(node, e);
  });

  return wrapper;
};

/**
 * Flatten the bookmark tree into a list of all leaf bookmarks with
 * their ancestor folder titles (for breadcrumbing).
 */
export interface BookmarkEntry {
  id: string;
  title: string;
  url: string;
  path: string[];
}

export const flattenBookmarks = (
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  path: string[] = [],
): BookmarkEntry[] => {
  const result: BookmarkEntry[] = [];
  for (const node of nodes) {
    if (node.children) {
      const title = node.title || "Bookmarks";
      result.push(...flattenBookmarks(node.children, [...path, title]));
    } else if (node.url) {
      result.push({
        id: node.id,
        title: node.title || node.url,
        url: node.url,
        path,
      });
    }
  }
  return result;
};
