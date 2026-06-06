import {
  buildTreeNode,
  flattenBookmarks,
  TreeState,
  type BookmarkEntry,
} from "../../../shared/tree";
import { filterBookmarks, renderFilterResults, tokenize } from "./filter";
import { getFrecencyMap, recordVisit, sortByFrecency } from "./frecency";

const openBookmark = async (id: string, url: string, newTab: boolean) => {
  await recordVisit(id);
  if (newTab) {
    chrome.tabs.create({ url });
  } else {
    chrome.tabs.update({ url });
    window.close();
  }
};

type Mode = "tree" | "filter";

const cursorClass = (m: Mode): "selected" | "highlighted" =>
  m === "tree" ? "selected" : "highlighted";

const setCursor = (
  container: HTMLElement,
  item: HTMLElement,
  m: Mode,
) => {
  const cls = cursorClass(m);
  const prev = container.querySelector(`.tree-item.${cls}`);
  if (prev && prev !== item) {
    prev.classList.remove(cls);
    if (cls === "selected") prev.setAttribute("aria-selected", "false");
  }
  item.classList.add(cls);
  if (cls === "selected") item.setAttribute("aria-selected", "true");
  item.scrollIntoView({ block: "nearest" });
};

const getCursor = (
  container: HTMLElement,
  m: Mode,
): HTMLElement | null =>
  container.querySelector(
    `.tree-item.${cursorClass(m)}`,
  ) as HTMLElement | null;

const toggleFolderExpand = (folder: HTMLElement): boolean | null => {
  const wrapper = folder.parentElement;
  const children = wrapper?.querySelector(
    ":scope > .tree-children",
  ) as HTMLElement | null;
  const toggle = folder.querySelector(".tree-toggle");
  if (!children || !toggle || toggle.classList.contains("empty")) return null;
  const isOpen = children.classList.toggle("open");
  toggle.classList.toggle("expanded", isOpen);
  folder.setAttribute("aria-expanded", String(isOpen));
  return isOpen;
};

const getVisibleItems = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll(".tree-item")).filter((el) => {
    let parent = el.parentElement;
    while (parent && parent !== container) {
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

const init = async () => {
  const input = document.getElementById("search-input") as HTMLInputElement;
  const results = document.getElementById("results")!;
  results.classList.add("tree");

  // Load bookmark data + frecency
  const tree = await chrome.bookmarks.getTree();
  const roots = tree[0].children || [];
  const allBookmarks = flattenBookmarks(roots);
  const frecencyMap = await getFrecencyMap();

  let mode: Mode = "tree";

  const renderTree = () => {
    results.innerHTML = "";

    const treeState: TreeState = {
      selectedFolderId: null,
      onFolderSelected: null,
      onBookmarkSelected: (node, event) => {
        if (!node.url) return;
        const newTab = event.button === 1 || event.ctrlKey || event.metaKey;
        openBookmark(node.id, node.url, newTab);
      },
    };

    const pathToTarget = new Set<string>();
    for (const root of roots) pathToTarget.add(root.id);

    for (const root of roots) {
      const el = buildTreeNode(
        root,
        0,
        pathToTarget,
        "",
        results,
        treeState,
        {
          renderBookmarks: true,
          disableContextMenu: true,
        },
      );
      if (el) results.appendChild(el);
    }

    const first = results.querySelector(".tree-item") as HTMLElement | null;
    if (first) {
      first.classList.add("selected");
      first.setAttribute("aria-selected", "true");
    } else {
      const empty = document.createElement("div");
      empty.className = "tree-empty";
      empty.textContent = "No bookmarks yet";
      results.appendChild(empty);
    }
  };

  const renderFilter = (query: string) => {
    const terms = tokenize(query);
    const matches = filterBookmarks(allBookmarks, query);
    const ranked = sortByFrecency<BookmarkEntry>(matches, frecencyMap, Date.now());
    const prevHighlighted = results.querySelector(
      ".tree-item.highlighted",
    ) as HTMLElement | null;
    renderFilterResults(results, ranked, terms, prevHighlighted?.dataset.id);
  };

  const setMode = (next: Mode, query: string) => {
    if (next === mode) {
      if (next === "filter") renderFilter(query);
      return;
    }
    mode = next;
    if (next === "tree") renderTree();
    else renderFilter(query);
  };

  // Initial render
  renderTree();

  // Type-ahead state — file-explorer style. Active when the results
  // container has focus and tree mode is active. Anchor is captured at
  // the start of each buffer so the cursor doesn't drag the search
  // origin forward as it lands on partial matches.
  const TYPE_AHEAD_TIMEOUT_MS = 750;
  let typeBuffer = "";
  let typeAnchorIdx = -1;
  let typeTimer: ReturnType<typeof setTimeout> | null = null;

  const resetTypeBuffer = () => {
    typeBuffer = "";
    typeAnchorIdx = -1;
    if (typeTimer) {
      clearTimeout(typeTimer);
      typeTimer = null;
    }
  };

  const refreshTypeTimer = () => {
    if (typeTimer) clearTimeout(typeTimer);
    typeTimer = setTimeout(resetTypeBuffer, TYPE_AHEAD_TIMEOUT_MS);
  };

  const findPrefixMatch = (
    buf: string,
    items: HTMLElement[],
    fromIdx: number,
  ): HTMLElement | null => {
    const lower = buf.toLowerCase();
    const origin = fromIdx < 0 ? -1 : fromIdx;
    for (let i = 1; i <= items.length; i++) {
      const idx = ((origin + i) % items.length + items.length) % items.length;
      const label =
        items[idx].querySelector(".tree-label")?.textContent?.toLowerCase() ||
        "";
      if (label.startsWith(lower)) return items[idx];
    }
    return null;
  };

  const applyTypeAhead = () => {
    if (typeBuffer.length === 0) return;
    const items = getVisibleItems(results);
    if (items.length === 0) return;
    const match = findPrefixMatch(typeBuffer, items, typeAnchorIdx);
    if (match) setCursor(results, match, mode);
  };

  // Live filter
  input.addEventListener("input", () => {
    const query = input.value.trim();
    if (query === "") setMode("tree", "");
    else setMode("filter", query);
  });

  // Tree-mode-only: expand/collapse with arrow keys
  const handleTreeArrowHoriz = (e: KeyboardEvent) => {
    const cursor = getCursor(results, mode);
    if (!cursor) return;

    if (e.key === "ArrowRight") {
      if (cursor.dataset.url) return; // bookmark leaf
      const wrapper = cursor.parentElement!;
      const children = wrapper.querySelector(
        ":scope > .tree-children",
      ) as HTMLElement | null;
      const toggle = cursor.querySelector(".tree-toggle");
      if (!children || !toggle || toggle.classList.contains("empty")) return;
      if (!children.classList.contains("open")) {
        children.classList.add("open");
        toggle.classList.add("expanded");
        cursor.setAttribute("aria-expanded", "true");
      } else {
        const firstChild = children.querySelector(
          ":scope > * > .tree-item",
        ) as HTMLElement | null;
        if (firstChild) setCursor(results, firstChild, mode);
      }
    } else if (e.key === "ArrowLeft") {
      const wrapper = cursor.parentElement!;
      const children = wrapper.querySelector(
        ":scope > .tree-children",
      ) as HTMLElement | null;
      if (children?.classList.contains("open")) {
        children.classList.remove("open");
        const toggle = cursor.querySelector(".tree-toggle");
        if (toggle) toggle.classList.remove("expanded");
        cursor.setAttribute("aria-expanded", "false");
      } else {
        const parentChildren = wrapper.parentElement;
        if (
          parentChildren?.classList.contains("tree-children") &&
          parentChildren.parentElement
        ) {
          const parentItem = parentChildren.parentElement.querySelector(
            ":scope > .tree-item",
          ) as HTMLElement | null;
          if (parentItem) setCursor(results, parentItem, mode);
        }
      }
    }
  };

  const handleNavKeydown = (e: KeyboardEvent): boolean => {
    if (
      e.key === "ArrowDown" ||
      e.key === "ArrowUp" ||
      e.key === "PageDown" ||
      e.key === "PageUp" ||
      e.key === "Home" ||
      e.key === "End"
    ) {
      e.preventDefault();
      const items = getVisibleItems(results);
      if (items.length === 0) return true;
      const currentIdx = items.findIndex((el) =>
        el.classList.contains(cursorClass(mode)),
      );
      const pageSize = Math.max(
        1,
        Math.floor(results.clientHeight / (items[0].offsetHeight || 24)) - 1,
      );
      let nextIdx: number;
      switch (e.key) {
        case "ArrowDown":
          nextIdx = currentIdx >= items.length - 1 ? 0 : currentIdx + 1;
          break;
        case "ArrowUp":
          nextIdx = currentIdx <= 0 ? items.length - 1 : currentIdx - 1;
          break;
        case "PageDown":
          nextIdx = Math.min(items.length - 1, Math.max(0, currentIdx) + pageSize);
          break;
        case "PageUp":
          nextIdx = Math.max(0, Math.max(0, currentIdx) - pageSize);
          break;
        case "Home":
          nextIdx = 0;
          break;
        case "End":
          nextIdx = items.length - 1;
          break;
        default:
          return true;
      }
      setCursor(results, items[nextIdx], mode);
      return true;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const cursor = getCursor(results, mode);
      if (!cursor) return true;
      const url = cursor.dataset.url;
      const id = cursor.dataset.id;
      const newTab = e.ctrlKey || e.metaKey;
      if (url && id) {
        openBookmark(id, url, newTab);
      } else if (mode === "tree") {
        toggleFolderExpand(cursor);
      }
      return true;
    }

    if (e.key === "Escape") {
      if (typeBuffer.length > 0) {
        e.preventDefault();
        resetTypeBuffer();
        return true;
      }
      if (input.value !== "") {
        e.preventDefault();
        input.value = "";
        setMode("tree", "");
        input.focus();
      } else {
        window.close();
      }
      return true;
    }

    if (mode === "tree" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      handleTreeArrowHoriz(e);
      return true;
    }

    return false;
  };

  input.addEventListener("keydown", handleNavKeydown);
  results.addEventListener("keydown", handleNavKeydown);

  // Type-ahead — only active when the tree (results) has focus and we're
  // in tree mode. handleNavKeydown runs first and consumes navigation
  // keys; this only sees printable chars and Backspace.
  results.addEventListener("keydown", (e) => {
    if (mode !== "tree") return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === "Backspace") {
      if (typeBuffer.length === 0) return;
      e.preventDefault();
      typeBuffer = typeBuffer.slice(0, -1);
      if (typeBuffer.length === 0) {
        resetTypeBuffer();
      } else {
        refreshTypeTimer();
        applyTypeAhead();
      }
      return;
    }

    if (e.key.length !== 1) return;

    e.preventDefault();
    if (typeBuffer.length === 0) {
      const items = getVisibleItems(results);
      const currentIdx = items.findIndex((el) =>
        el.classList.contains(cursorClass(mode)),
      );
      typeAnchorIdx = currentIdx;
    }
    typeBuffer += e.key;
    refreshTypeTimer();
    applyTypeAhead();
  });

  // Lose focus → drop any in-flight buffer so we don't carry it back.
  results.addEventListener("blur", resetTypeBuffer);

  // Mouse hover updates the cursor in filter mode only — in tree mode click
  // is the explicit selection action, mirroring file-explorer behaviour.
  // Filter results re-render under a stationary cursor while typing, so
  // ignore pseudo-mousemove events that don't actually move.
  let lastMouseX = -1;
  let lastMouseY = -1;
  results.addEventListener("mousemove", (e) => {
    if (mode !== "filter") return;
    if (e.clientX === lastMouseX && e.clientY === lastMouseY) return;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    const target = (e.target as HTMLElement).closest(
      ".tree-item",
    ) as HTMLElement | null;
    if (target && !target.classList.contains("highlighted")) {
      setCursor(results, target, mode);
    }
  });

  // Click on filter results opens the bookmark
  results.addEventListener("click", (e) => {
    if (mode !== "filter") return;
    const target = (e.target as HTMLElement).closest(
      ".tree-item",
    ) as HTMLElement | null;
    if (!target) return;
    const url = target.dataset.url;
    const id = target.dataset.id;
    if (url && id) {
      const newTab = e.ctrlKey || e.metaKey;
      openBookmark(id, url, newTab);
    }
  });

  // Middle-click on a bookmark (either mode) opens in a new tab
  results.addEventListener("auxclick", (e) => {
    if (e.button !== 1) return;
    const target = (e.target as HTMLElement).closest(
      ".tree-item",
    ) as HTMLElement | null;
    if (!target) return;
    const url = target.dataset.url;
    const id = target.dataset.id;
    if (url && id) {
      e.preventDefault();
      openBookmark(id, url, true);
    }
  });

  input.focus();
};

init().catch((err) => {
  console.error("Quick Go To Bookmark init failed:", err);
});
