import { TreeState } from "./tree";
import { FOLDER_SVG } from "./constants";

interface FolderEntry {
  id: string;
  title: string;
  path: string[]; // ancestor titles for breadcrumb
}

/**
 * Flatten the bookmark tree into a list of all folders with their ancestor paths.
 */
function flattenFolders(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  path: string[] = [],
): FolderEntry[] {
  const result: FolderEntry[] = [];
  for (const node of nodes) {
    if (!node.children) continue;
    const title = node.title || "Bookmarks";
    result.push({ id: node.id, title, path });
    result.push(...flattenFolders(node.children, [...path, title]));
  }
  return result;
}

/**
 * Set up type-to-filter on the tree container.
 * When the user types while the tree is focused, it switches to a flat
 * filtered view. Clearing the filter restores the original tree.
 */
export interface TreeFilter {
  invalidateCache(): void;
}

export function setupTreeFilter(
  treeContainer: HTMLElement,
  filterInput: HTMLInputElement,
  state: TreeState,
): TreeFilter {
  let allFolders: FolderEntry[] = [];
  let originalContent: HTMLElement[] = [];
  let isFiltering = false;

  // Cache the full folder list on first use
  async function ensureFolderList() {
    if (allFolders.length > 0) return;
    const tree = await chrome.bookmarks.getTree();
    // Skip the invisible root, start from its children
    for (const root of tree[0].children || []) {
      allFolders.push(...flattenFolders([root]));
    }
  }

  function saveOriginalContent() {
    if (originalContent.length > 0) return;
    originalContent = Array.from(treeContainer.children) as HTMLElement[];
  }

  function restoreOriginalContent() {
    treeContainer.innerHTML = "";
    for (const el of originalContent) {
      treeContainer.appendChild(el);
    }
  }

  function renderFilteredList(query: string) {
    const lowerQuery = query.toLowerCase();
    const matches = allFolders.filter(
      (f) =>
        f.title.toLowerCase().includes(lowerQuery) ||
        f.path.some((p) => p.toLowerCase().includes(lowerQuery)),
    );

    treeContainer.innerHTML = "";

    if (matches.length === 0) {
      const empty = document.createElement("div");
      empty.className = "tree-empty";
      empty.textContent = "No folders found";
      treeContainer.appendChild(empty);
      return;
    }

    for (const folder of matches) {
      const item = document.createElement("div");
      item.className = "tree-item tree-filter-item";
      item.dataset.id = folder.id;

      if (folder.id === state.selectedFolderId) {
        item.classList.add("selected");
      }

      // Folder icon
      const iconSpan = document.createElement("span");
      iconSpan.innerHTML = FOLDER_SVG;
      item.appendChild(iconSpan.firstElementChild!);

      // Breadcrumb path + folder name
      const label = document.createElement("span");
      label.className = "tree-label";
      if (folder.path.length > 0) {
        const breadcrumb = document.createElement("span");
        breadcrumb.className = "tree-breadcrumb";
        breadcrumb.textContent = folder.path.join(" / ") + " / ";
        label.appendChild(breadcrumb);
      }
      label.appendChild(document.createTextNode(folder.title));
      item.appendChild(label);

      item.addEventListener("click", () => {
        const prev = treeContainer.querySelector(".selected");
        if (prev) prev.classList.remove("selected");
        item.classList.add("selected");
        state.selectedFolderId = folder.id;
        state.onFolderSelected?.(folder.id);
      });

      treeContainer.appendChild(item);
    }
  }

  function enterFilterMode() {
    if (!isFiltering) {
      saveOriginalContent();
      isFiltering = true;
      filterInput.parentElement!.style.display = "";
    }
  }

  function exitFilterMode() {
    if (!isFiltering) return;
    isFiltering = false;
    filterInput.value = "";
    filterInput.parentElement!.style.display = "none";
    restoreOriginalContent();

    // Re-highlight the selected item in the restored tree
    if (state.selectedFolderId) {
      const prev = treeContainer.querySelector(".selected");
      if (prev) prev.classList.remove("selected");
      const sel = treeContainer.querySelector(
        `.tree-item[data-id="${state.selectedFolderId}"]`,
      );
      if (sel) sel.classList.add("selected");
    }
  }

  // Typing while tree is focused enters filter mode
  treeContainer.setAttribute("tabindex", "0");

  treeContainer.addEventListener("keydown", async (e) => {
    // Don't intercept typing inside inputs (e.g. inline folder rename)
    if ((e.target as HTMLElement).tagName === "INPUT") return;

    // Ignore modifier-only keys, navigation, etc.
    if (e.key === "Tab" || e.ctrlKey || e.altKey || e.metaKey) return;

    if (e.key === "Escape") {
      if (isFiltering) {
        exitFilterMode();
        treeContainer.focus();
        e.preventDefault();
      }
      return;
    }

    // Start filtering on printable characters
    if (e.key.length === 1) {
      await ensureFolderList();
      enterFilterMode();
      filterInput.focus();
      // The character will be typed into the input naturally
    }
  });

  // Filter as user types
  filterInput.addEventListener("input", () => {
    const query = filterInput.value.trim();
    if (query === "") {
      exitFilterMode();
      treeContainer.focus();
    } else {
      renderFilteredList(query);
    }
  });

  // Escape in the input exits filter mode
  filterInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      exitFilterMode();
      treeContainer.focus();
      e.preventDefault();
    }
  });

  return {
    invalidateCache() {
      allFolders = [];
    },
  };
}
