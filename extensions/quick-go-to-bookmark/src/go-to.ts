import {
  buildTreeNode,
  flattenBookmarks,
  TreeState,
  type BookmarkEntry,
} from "../../../shared/tree";
import { filterBookmarks, renderFilterResults } from "./filter";
import { getFrecencyMap, recordVisit, sortByFrecency } from "./frecency";

type Mode = "tree" | "filter";

const openBookmark = async (id: string, url: string, newTab: boolean) => {
  await recordVisit(id);
  if (newTab) {
    chrome.tabs.create({ url });
  } else {
    chrome.tabs.update({ url });
    window.close();
  }
};

const highlightItem = (container: HTMLElement, item: HTMLElement) => {
  const prev = container.querySelector(".tree-item.highlighted");
  if (prev) prev.classList.remove("highlighted");
  item.classList.add("highlighted");
  item.scrollIntoView({ block: "nearest" });
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
          clickFolderTogglesExpand: true,
          disableContextMenu: true,
        },
      );
      if (el) results.appendChild(el);
    }

    const first = results.querySelector(".tree-item") as HTMLElement | null;
    if (first) first.classList.add("highlighted");
  };

  const renderFilter = (query: string) => {
    const matches = filterBookmarks(allBookmarks, query);
    const ranked = sortByFrecency<BookmarkEntry>(matches, frecencyMap, Date.now());
    renderFilterResults(results, ranked);
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

  // Live filter
  input.addEventListener("input", () => {
    const query = input.value.trim();
    if (query === "") setMode("tree", "");
    else setMode("filter", query);
  });

  // Tree-mode-only: expand/collapse with arrow keys
  const handleTreeArrowHoriz = (e: KeyboardEvent) => {
    const highlighted = results.querySelector(
      ".tree-item.highlighted",
    ) as HTMLElement | null;
    if (!highlighted) return;

    if (e.key === "ArrowRight") {
      if (highlighted.dataset.url) return; // bookmark leaf
      const wrapper = highlighted.parentElement!;
      const children = wrapper.querySelector(
        ":scope > .tree-children",
      ) as HTMLElement | null;
      const toggle = highlighted.querySelector(".tree-toggle");
      if (
        children &&
        toggle &&
        !toggle.classList.contains("empty") &&
        !children.classList.contains("open")
      ) {
        children.classList.add("open");
        toggle.classList.add("expanded");
        highlighted.setAttribute("aria-expanded", "true");
      }
    } else if (e.key === "ArrowLeft") {
      const wrapper = highlighted.parentElement!;
      const children = wrapper.querySelector(
        ":scope > .tree-children",
      ) as HTMLElement | null;
      if (children?.classList.contains("open")) {
        children.classList.remove("open");
        const toggle = highlighted.querySelector(".tree-toggle");
        if (toggle) toggle.classList.remove("expanded");
        highlighted.setAttribute("aria-expanded", "false");
      } else {
        const parentChildren = wrapper.parentElement;
        if (
          parentChildren?.classList.contains("tree-children") &&
          parentChildren.parentElement
        ) {
          const parentItem = parentChildren.parentElement.querySelector(
            ":scope > .tree-item",
          ) as HTMLElement | null;
          if (parentItem) highlightItem(results, parentItem);
        }
      }
    }
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const items = getVisibleItems(results);
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
      highlightItem(results, items[nextIdx]);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const highlighted = results.querySelector(
        ".tree-item.highlighted",
      ) as HTMLElement | null;
      if (!highlighted) return;
      const url = highlighted.dataset.url;
      const id = highlighted.dataset.id;
      const newTab = e.ctrlKey || e.metaKey;
      if (url && id) {
        openBookmark(id, url, newTab);
      } else if (mode === "tree") {
        // Toggle folder expand
        highlighted.click();
      }
      return;
    }

    if (e.key === "Escape") {
      if (input.value !== "") {
        e.preventDefault();
        input.value = "";
        setMode("tree", "");
      } else {
        window.close();
      }
      return;
    }

    if (mode === "tree" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      handleTreeArrowHoriz(e);
      return;
    }
  });

  // Mouse hover updates highlight
  results.addEventListener("mousemove", (e) => {
    const target = (e.target as HTMLElement).closest(
      ".tree-item",
    ) as HTMLElement | null;
    if (target && !target.classList.contains("highlighted")) {
      highlightItem(results, target);
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
