import {
  buildTreeNode,
  TreeState,
} from "../../../shared/tree";

const openBookmark = (url: string, newTab: boolean) => {
  if (newTab) {
    chrome.tabs.create({ url });
  } else {
    chrome.tabs.update({ url });
    window.close();
  }
};

const highlightItem = (treeEl: HTMLElement, item: HTMLElement) => {
  const prev = treeEl.querySelector(".tree-item.highlighted");
  if (prev) prev.classList.remove("highlighted");
  item.classList.add("highlighted");
  item.scrollIntoView({ block: "nearest" });
};

const getVisibleItems = (treeEl: HTMLElement): HTMLElement[] =>
  Array.from(treeEl.querySelectorAll(".tree-item")).filter((el) => {
    let parent = el.parentElement;
    while (parent && parent !== treeEl) {
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

const activateItem = (item: HTMLElement, newTab: boolean) => {
  const url = item.dataset.url;
  if (url) {
    openBookmark(url, newTab);
  } else {
    // Folder: simulate click to toggle expand
    item.click();
  }
};

const init = async () => {
  const treeEl = document.getElementById("results")!;
  treeEl.classList.add("tree");
  treeEl.setAttribute("role", "tree");
  treeEl.setAttribute("tabindex", "0");

  const tree = await chrome.bookmarks.getTree();
  const roots = tree[0].children || [];

  const treeState: TreeState = {
    selectedFolderId: null,
    onFolderSelected: null,
    onBookmarkSelected: (node, event) => {
      if (!node.url) return;
      const newTab = event.button === 1 || event.ctrlKey || event.metaKey;
      openBookmark(node.url, newTab);
    },
  };

  // Expand top-level roots by default
  const pathToTarget = new Set<string>();
  for (const root of roots) pathToTarget.add(root.id);

  for (const root of roots) {
    const el = buildTreeNode(
      root,
      0,
      pathToTarget,
      "",
      treeEl,
      treeState,
      {
        renderBookmarks: true,
        clickFolderTogglesExpand: true,
        disableContextMenu: true,
      },
    );
    if (el) treeEl.appendChild(el);
  }

  // Highlight the first visible item
  const firstItem = treeEl.querySelector(".tree-item") as HTMLElement | null;
  if (firstItem) firstItem.classList.add("highlighted");

  treeEl.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const items = getVisibleItems(treeEl);
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
      highlightItem(treeEl, items[nextIdx]);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const highlighted = treeEl.querySelector(
        ".tree-item.highlighted",
      ) as HTMLElement | null;
      if (!highlighted) return;
      const newTab = e.ctrlKey || e.metaKey;
      activateItem(highlighted, newTab);
      return;
    }

    if (e.key === "ArrowRight") {
      e.preventDefault();
      const highlighted = treeEl.querySelector(
        ".tree-item.highlighted",
      ) as HTMLElement | null;
      if (!highlighted || highlighted.dataset.url) return;
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
      return;
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      const highlighted = treeEl.querySelector(
        ".tree-item.highlighted",
      ) as HTMLElement | null;
      if (!highlighted) return;
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
          if (parentItem) highlightItem(treeEl, parentItem);
        }
      }
      return;
    }
  });

  // Mouse hover updates highlight
  treeEl.addEventListener("mousemove", (e) => {
    const target = (e.target as HTMLElement).closest(".tree-item") as HTMLElement | null;
    if (target && !target.classList.contains("highlighted")) {
      highlightItem(treeEl, target);
    }
  });

  // Middle-click on a bookmark opens it in a new tab
  treeEl.addEventListener("auxclick", (e) => {
    if (e.button !== 1) return;
    const target = (e.target as HTMLElement).closest(".tree-item") as HTMLElement | null;
    if (!target) return;
    const url = target.dataset.url;
    if (url) {
      e.preventDefault();
      openBookmark(url, true);
    }
  });

  treeEl.focus();
};

init().catch((err) => {
  console.error("Quick Go To Bookmark init failed:", err);
});
