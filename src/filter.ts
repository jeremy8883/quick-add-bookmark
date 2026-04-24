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
export function flattenFolders(
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

  function highlightFilterItem(item: HTMLElement) {
    const prev = treeContainer.querySelector(".highlighted");
    if (prev) prev.classList.remove("highlighted");
    item.classList.add("highlighted");
    item.scrollIntoView({ block: "nearest" });
  }

  function confirmFilterSelection() {
    const highlighted = treeContainer.querySelector(
      ".tree-item.highlighted",
    ) as HTMLElement | null;
    if (highlighted) {
      state.selectedFolderId = highlighted.dataset.id!;
      state.onFolderSelected?.(highlighted.dataset.id!);
    }
    exitFilterMode();
    treeContainer.focus();
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

    let first = true;
    for (const folder of matches) {
      const item = document.createElement("div");
      item.className = "tree-item tree-filter-item";
      item.dataset.id = folder.id;

      // Highlight first item by default
      if (first) {
        item.classList.add("highlighted");
        first = false;
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
        highlightFilterItem(item);
        confirmFilterSelection();
      });

      treeContainer.appendChild(item);
    }
  }

  const filterHint = document.getElementById("filter-hint");

  function enterFilterMode() {
    if (!isFiltering) {
      saveOriginalContent();
      isFiltering = true;
      filterInput.parentElement!.style.display = "";
      if (filterHint) filterHint.style.display = "none";
    }
  }

  function exitFilterMode() {
    if (!isFiltering) return;
    isFiltering = false;
    filterInput.value = "";
    filterInput.parentElement!.style.display = "none";
    if (filterHint) filterHint.style.display = "";
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

  function getVisibleItems(): HTMLElement[] {
    return Array.from(
      treeContainer.querySelectorAll(".tree-item"),
    ).filter((el) => {
      // Check all ancestors up to tree container are visible
      let parent = el.parentElement;
      while (parent && parent !== treeContainer) {
        if (
          parent.classList.contains("tree-children") &&
          !parent.classList.contains("open")
        ) {
          return false;
        }
        parent = parent.parentElement;
      }
      return true;
    }) as HTMLElement[];
  }

  function selectItem(item: HTMLElement) {
    const prev = treeContainer.querySelector(".selected");
    if (prev) prev.classList.remove("selected");
    item.classList.add("selected");
    state.selectedFolderId = item.dataset.id!;
    state.onFolderSelected?.(item.dataset.id!);
    item.scrollIntoView({ block: "nearest" });
  }

  treeContainer.addEventListener("keydown", async (e) => {
    // Don't intercept typing inside inputs (e.g. inline folder rename)
    if ((e.target as HTMLElement).tagName === "INPUT") return;

    // Arrow key navigation (only in folder view, not filter view)
    if (!isFiltering && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const items = getVisibleItems();
      if (items.length === 0) return;
      const currentIdx = items.findIndex((el) =>
        el.classList.contains("selected"),
      );
      let nextIdx: number;
      if (e.key === "ArrowUp") {
        nextIdx = currentIdx <= 0 ? items.length - 1 : currentIdx - 1;
      } else {
        nextIdx = currentIdx >= items.length - 1 ? 0 : currentIdx + 1;
      }
      selectItem(items[nextIdx]);
      return;
    }

    if (!isFiltering && e.key === "ArrowLeft") {
      e.preventDefault();
      const selected = treeContainer.querySelector(
        ".tree-item.selected",
      ) as HTMLElement | null;
      if (!selected) return;
      const wrapper = selected.parentElement!;
      const children = wrapper.querySelector(
        ":scope > .tree-children",
      ) as HTMLElement | null;
      if (children?.classList.contains("open")) {
        // Collapse current folder
        children.classList.remove("open");
        const toggle = selected.querySelector(".tree-toggle");
        if (toggle) toggle.classList.remove("expanded");
      } else {
        // Move to parent folder
        const parentChildren = wrapper.parentElement;
        if (
          parentChildren?.classList.contains("tree-children") &&
          parentChildren.parentElement
        ) {
          const parentItem = parentChildren.parentElement.querySelector(
            ":scope > .tree-item",
          ) as HTMLElement | null;
          if (parentItem) selectItem(parentItem);
        }
      }
      return;
    }

    if (!isFiltering && e.key === "ArrowRight") {
      e.preventDefault();
      const selected = treeContainer.querySelector(
        ".tree-item.selected",
      ) as HTMLElement | null;
      if (!selected) return;
      const wrapper = selected.parentElement!;
      const children = wrapper.querySelector(
        ":scope > .tree-children",
      ) as HTMLElement | null;
      const toggle = selected.querySelector(".tree-toggle");
      if (
        children &&
        toggle &&
        !toggle.classList.contains("empty") &&
        !children.classList.contains("open")
      ) {
        children.classList.add("open");
        toggle.classList.add("expanded");
      }
      return;
    }

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
      e.preventDefault();
      const char = e.key;
      await ensureFolderList();
      enterFilterMode();
      filterInput.value = char;
      filterInput.focus();
      renderFilteredList(char);
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

  // Keyboard navigation in filter mode
  filterInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      exitFilterMode();
      treeContainer.focus();
      e.preventDefault();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      confirmFilterSelection();
      return;
    }

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const items = Array.from(
        treeContainer.querySelectorAll(".tree-item"),
      ) as HTMLElement[];
      if (items.length === 0) return;
      const currentIdx = items.findIndex((el) =>
        el.classList.contains("highlighted"),
      );
      let nextIdx: number;
      if (e.key === "ArrowDown") {
        nextIdx = currentIdx >= items.length - 1 ? 0 : currentIdx + 1;
      } else {
        nextIdx = currentIdx <= 0 ? items.length - 1 : currentIdx - 1;
      }
      highlightFilterItem(items[nextIdx]);
    }
  });

  return {
    invalidateCache() {
      allFolders = [];
    },
  };
}
