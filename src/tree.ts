/**
 * Core tree rendering — builds the folder tree DOM and handles
 * expand/collapse toggling.
 */

import { FOLDER_SVG } from "./constants";
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
 * Returns null for non-folder nodes (leaf bookmarks).
 */
export const buildTreeNode = (
  node: chrome.bookmarks.BookmarkTreeNode,
  depth: number,
  pathToTarget: Set<string>,
  targetId: string,
  treeContainer: HTMLElement,
  state: TreeState,
): HTMLElement | null => {
  if (!node.children) return null;

  const wrapper = document.createElement("div");
  wrapper.setAttribute("role", "none");

  const item = document.createElement("div");
  item.className = "tree-item";
  item.setAttribute("role", "treeitem");
  item.style.paddingLeft = 8 + depth * 16 + "px";
  item.dataset.id = node.id;

  const hasSubfolders = node.children.some((c) => c.children);

  // Toggle arrow — clickable expand/collapse control
  const toggle = document.createElement("span");
  toggle.className = "tree-toggle" + (hasSubfolders ? "" : " empty");
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
  if (hasSubfolders) {
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
    if (hasSubfolders) {
      toggleExpand(childContainer, toggle, item);
    }
  });

  // Single click on row: select folder
  item.addEventListener("click", (e) => {
    e.stopPropagation();
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
    if (hasSubfolders) {
      toggleExpand(childContainer, toggle, item);
    }
  });

  // Right-click context menu
  item.addEventListener("contextmenu", (e) => {
    e.stopPropagation();
    showContextMenu(e, node.id, treeContainer, state);
  });

  return wrapper;
};
