import { FOLDER_SVG } from "./constants";

/**
 * Find the wrapper element and children container for a given folder ID in the tree DOM.
 */
function findFolderElements(
  treeContainer: HTMLElement,
  folderId: string,
): { item: HTMLElement; wrapper: HTMLElement; children: HTMLElement } | null {
  const item = treeContainer.querySelector(
    `.tree-item[data-id="${folderId}"]`,
  ) as HTMLElement | null;
  if (!item) return null;
  const wrapper = item.parentElement!;
  const children = wrapper.querySelector(
    ":scope > .tree-children",
  ) as HTMLElement;
  return { item, wrapper, children };
}

/**
 * Create a new folder inside the selected folder, with an inline name input.
 */
export async function createNewFolder(
  treeContainer: HTMLElement,
  state: TreeState,
): Promise<void> {
  const parentId = state.selectedFolderId;
  if (!parentId) return;

  const parent = findFolderElements(treeContainer, parentId);
  if (!parent) return;

  // Determine a unique default name
  const siblings = await chrome.bookmarks.getChildren(parentId);
  const existingNames = new Set(siblings.map((s) => s.title));
  let defaultName = "New Folder";
  if (existingNames.has(defaultName)) {
    let n = 2;
    while (existingNames.has(`New Folder (${n})`)) n++;
    defaultName = `New Folder (${n})`;
  }

  // Create the bookmark folder
  const folder = await chrome.bookmarks.create({
    parentId,
    title: defaultName,
  });

  // Ensure parent is expanded and toggle is visible
  parent.children.classList.add("open");
  const toggle = parent.item.querySelector(".tree-toggle")!;
  toggle.classList.remove("empty");
  toggle.classList.add("expanded");

  // Compute depth from parent item's padding
  const parentPadding = parseInt(parent.item.style.paddingLeft, 10) || 8;
  const depth = (parentPadding - 8) / 16 + 1;

  // Build the new folder row
  const wrapper = document.createElement("div");

  const item = document.createElement("div");
  item.className = "tree-item";
  item.style.paddingLeft = 8 + depth * 16 + "px";
  item.dataset.id = folder.id;

  const newToggle = document.createElement("span");
  newToggle.className = "tree-toggle empty";
  item.appendChild(newToggle);

  const iconSpan = document.createElement("span");
  iconSpan.innerHTML = FOLDER_SVG;
  item.appendChild(iconSpan.firstElementChild!);

  // Inline editable input instead of a label
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "tree-name-input";
  nameInput.value = defaultName;
  item.appendChild(nameInput);

  wrapper.appendChild(item);

  const childContainer = document.createElement("div");
  childContainer.className = "tree-children";
  wrapper.appendChild(childContainer);

  parent.children.appendChild(wrapper);

  // Select the new folder
  const prev = treeContainer.querySelector(".selected");
  if (prev) prev.classList.remove("selected");
  item.classList.add("selected");
  state.selectedFolderId = folder.id;

  // Focus and select the input text
  nameInput.focus();
  nameInput.select();

  // Finalize: replace input with label, update bookmark title
  const finalize = async () => {
    const name = nameInput.value.trim() || defaultName;
    await chrome.bookmarks.update(folder.id, { title: name });

    const label = document.createElement("span");
    label.className = "tree-label";
    label.textContent = name;
    nameInput.replaceWith(label);

    // Wire up standard click/dblclick handlers
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const prev = treeContainer.querySelector(".selected");
      if (prev) prev.classList.remove("selected");
      item.classList.add("selected");
      state.selectedFolderId = folder.id;
      state.onFolderSelected?.(folder.id);
    });

    item.addEventListener("dblclick", (e) => {
      e.stopPropagation();
    });

    item.addEventListener("contextmenu", (e) => {
      e.stopPropagation();
      showContextMenu(e, folder.id, treeContainer, state);
    });

    // Fire selection callback so bookmark gets moved to new folder
    state.onFolderSelected?.(folder.id);
  };

  nameInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      nameInput.blur();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      nameInput.value = defaultName;
      nameInput.blur();
    }
  });

  nameInput.addEventListener("blur", finalize, { once: true });

  // Scroll new folder into view
  item.scrollIntoView({ block: "nearest" });
}

export interface TreeState {
  selectedFolderId: string | null;
  onFolderSelected: ((folderId: string) => void) | null;
  onTreeChanged?: (() => void) | null;
}

let activeMenu: HTMLElement | null = null;
let activeBackdrop: HTMLElement | null = null;

export function isContextMenuOpen(): boolean {
  return activeMenu !== null;
}

function closeContextMenu() {
  if (activeMenu) {
    activeMenu.remove();
    activeMenu = null;
  }
  if (activeBackdrop) {
    activeBackdrop.remove();
    activeBackdrop = null;
  }
}

function showContextMenu(
  e: MouseEvent,
  folderId: string,
  treeContainer: HTMLElement,
  state: TreeState,
) {
  e.preventDefault();
  closeContextMenu();

  // Transparent backdrop to block clicks behind the menu
  const backdrop = document.createElement("div");
  backdrop.className = "context-menu-backdrop";
  backdrop.addEventListener("click", (ev) => {
    ev.stopPropagation();
    closeContextMenu();
  });
  backdrop.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    closeContextMenu();
  });
  document.body.appendChild(backdrop);
  activeBackdrop = backdrop;

  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.left = e.clientX + "px";
  menu.style.top = e.clientY + "px";

  const editBtn = document.createElement("button");
  editBtn.className = "context-menu-item";
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    closeContextMenu();
    startRename(folderId, treeContainer, state);
  });

  const newFolderBtn = document.createElement("button");
  newFolderBtn.className = "context-menu-item";
  newFolderBtn.textContent = "New folder";
  newFolderBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    closeContextMenu();
    // Select the folder first, then create subfolder
    const prev = treeContainer.querySelector(".selected");
    if (prev) prev.classList.remove("selected");
    const item = treeContainer.querySelector(
      `.tree-item[data-id="${folderId}"]`,
    );
    if (item) item.classList.add("selected");
    state.selectedFolderId = folderId;
    createNewFolder(treeContainer, state);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "context-menu-item danger";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    closeContextMenu();
    await deleteFolder(folderId, treeContainer, state);
  });

  menu.appendChild(editBtn);
  menu.appendChild(newFolderBtn);
  menu.appendChild(deleteBtn);
  menu.setAttribute("tabindex", "-1");
  document.body.appendChild(menu);
  activeMenu = menu;

  // Keep menu within viewport
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = window.innerWidth - rect.width + "px";
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = window.innerHeight - rect.height + "px";
  }

  // Focus menu for keyboard navigation
  menu.focus();
  const items = Array.from(
    menu.querySelectorAll(".context-menu-item"),
  ) as HTMLElement[];
  if (items.length > 0) items[0].classList.add("focused");

  menu.addEventListener("keydown", (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    const focused = menu.querySelector(".context-menu-item.focused") as HTMLElement | null;
    const idx = focused ? items.indexOf(focused) : -1;

    if (ev.key === "ArrowDown") {
      if (focused) focused.classList.remove("focused");
      items[(idx + 1) % items.length].classList.add("focused");
    } else if (ev.key === "ArrowUp") {
      if (focused) focused.classList.remove("focused");
      items[(idx - 1 + items.length) % items.length].classList.add("focused");
    } else if (ev.key === "Enter") {
      if (focused) focused.click();
    } else if (ev.key === "Escape") {
      closeContextMenu();
      treeContainer.focus();
    }
  });
}

function startRename(
  folderId: string,
  treeContainer: HTMLElement,
  state: TreeState,
) {
  const els = findFolderElements(treeContainer, folderId);
  if (!els) return;

  const label = els.item.querySelector(".tree-label") as HTMLElement;
  if (!label) return;

  const currentName = label.textContent || "";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "tree-name-input";
  nameInput.value = currentName;
  label.replaceWith(nameInput);
  nameInput.focus();
  nameInput.select();

  const finalize = async () => {
    const name = nameInput.value.trim() || currentName;
    await chrome.bookmarks.update(folderId, { title: name });
    const newLabel = document.createElement("span");
    newLabel.className = "tree-label";
    newLabel.textContent = name;
    nameInput.replaceWith(newLabel);
    state.onTreeChanged?.();
  };

  nameInput.addEventListener("keydown", (ev) => {
    ev.stopPropagation();
    if (ev.key === "Enter") {
      ev.preventDefault();
      nameInput.blur();
    }
    if (ev.key === "Escape") {
      ev.preventDefault();
      nameInput.value = currentName;
      nameInput.blur();
    }
  });

  nameInput.addEventListener("blur", finalize, { once: true });
}

function countBookmarksDeep(
  node: chrome.bookmarks.BookmarkTreeNode,
): number {
  if (!node.children) return 1; // leaf = bookmark
  let count = 0;
  for (const child of node.children) {
    count += countBookmarksDeep(child);
  }
  return count;
}

async function deleteFolder(
  folderId: string,
  treeContainer: HTMLElement,
  state: TreeState,
) {
  const els = findFolderElements(treeContainer, folderId);
  if (!els) return;

  // Check if folder has bookmarks — confirm before deleting
  const [folder] = await chrome.bookmarks.getSubTree(folderId);
  const leafCount = countBookmarksDeep(folder);

  if (leafCount > 0) {
    const confirmed = await showDeleteConfirmation(
      folder.title || "Untitled",
      leafCount,
    );
    if (!confirmed) return;
  }

  await chrome.bookmarks.removeTree(folderId);
  els.wrapper.remove();

  if (state.selectedFolderId === folderId) {
    state.selectedFolderId = null;
    const first = treeContainer.querySelector(".tree-item") as HTMLElement;
    if (first) {
      first.classList.add("selected");
      state.selectedFolderId = first.dataset.id!;
      state.onFolderSelected?.(first.dataset.id!);
    }
  }

  state.onTreeChanged?.();
}

function showDeleteConfirmation(
  folderName: string,
  bookmarkCount: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "confirm-backdrop";

    const dialog = document.createElement("div");
    dialog.className = "confirm-dialog";

    const msg = document.createElement("p");
    msg.className = "confirm-message";
    msg.textContent = `Folder "${folderName}" contains ${bookmarkCount} bookmark${bookmarkCount !== 1 ? "s" : ""}. Confirm deletion?`;
    dialog.appendChild(msg);

    const actions = document.createElement("div");
    actions.className = "confirm-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => {
      backdrop.remove();
      resolve(false);
    });

    const confirmBtn = document.createElement("button");
    confirmBtn.className = "btn btn-danger";
    confirmBtn.textContent = "Delete";
    confirmBtn.addEventListener("click", () => {
      backdrop.remove();
      resolve(true);
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    dialog.appendChild(actions);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    cancelBtn.focus();
  });
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

  // Bookmark count (non-folder children)
  const bookmarkCount = node.children.filter((c) => !c.children).length;
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

  // Right-click context menu
  item.addEventListener("contextmenu", (e) => {
    e.stopPropagation();
    showContextMenu(e, node.id, treeContainer, state);
  });

  return wrapper;
}
