const FOLDER_SVG = `<svg class="tree-icon" viewBox="0 0 20 20" fill="#5f6368"><path d="M2 4.5A1.5 1.5 0 013.5 3h4.586a1 1 0 01.707.293L10.5 5H16.5A1.5 1.5 0 0118 6.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 012 15.5v-11z"/></svg>`;

export interface TreeState {
  selectedFolderId: string | null;
  onFolderSelected: ((folderId: string) => void) | null;
}

/**
 * Walk the bookmark tree to find the path from root to targetId.
 * Populates pathSet with every node ID on that path.
 */
export function findPathToTarget(
  node: chrome.bookmarks.BookmarkTreeNode,
  targetId: string,
  pathSet: Set<string>,
): boolean {
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
}

function toggleExpand(
  childContainer: HTMLElement,
  toggle: HTMLElement,
): boolean {
  const isOpen = childContainer.classList.toggle("open");
  toggle.classList.toggle("expanded", isOpen);
  return isOpen;
}

/**
 * Recursively build a DOM subtree for a bookmark folder node.
 * Returns null for non-folder nodes (leaf bookmarks).
 */
export function buildTreeNode(
  node: chrome.bookmarks.BookmarkTreeNode,
  depth: number,
  pathToTarget: Set<string>,
  targetId: string,
  treeContainer: HTMLElement,
  state: TreeState,
): HTMLElement | null {
  if (!node.children) return null;

  const wrapper = document.createElement("div");

  const item = document.createElement("div");
  item.className = "tree-item";
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

  wrapper.appendChild(item);

  // Children container
  const childContainer = document.createElement("div");
  childContainer.className = "tree-children";

  if (pathToTarget.has(node.id)) {
    childContainer.classList.add("open");
    toggle.classList.add("expanded");
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
  if (node.id === targetId) {
    item.classList.add("selected");
    state.selectedFolderId = node.id;
  }

  // Click the toggle icon to expand/collapse
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    if (hasSubfolders) {
      toggleExpand(childContainer, toggle);
    }
  });

  // Single click on row: select folder
  item.addEventListener("click", (e) => {
    e.stopPropagation();
    const prev = treeContainer.querySelector(".selected");
    if (prev) prev.classList.remove("selected");
    item.classList.add("selected");
    state.selectedFolderId = node.id;
    state.onFolderSelected?.(node.id);
  });

  // Double click on row: expand/collapse
  item.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    if (hasSubfolders) {
      toggleExpand(childContainer, toggle);
    }
  });

  return wrapper;
}
