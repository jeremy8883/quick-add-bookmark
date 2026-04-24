import {
  findPathToTarget,
  buildTreeNode,
  createNewFolder,
  TreeState,
} from "./tree";
import {
  findExistingBookmark,
  createBookmark,
  updateBookmark,
  removeBookmark,
} from "./bookmarks";
import {
  getLastFolderId,
  setLastFolderId,
  getTreeHeight,
  setTreeHeight,
} from "./storage";
import { setupTreeFilter } from "./filter";
import { DEFAULT_FOLDER_ID } from "./constants";

const form = document.getElementById("bookmark-form") as HTMLFormElement;
const titleInput = document.getElementById("title") as HTMLInputElement;
const urlInput = document.getElementById("url") as HTMLInputElement;
const treeEl = document.getElementById("tree")!;
const doneBtn = document.getElementById("done") as HTMLButtonElement;
const removeBtn = document.getElementById("remove") as HTMLButtonElement;
const newFolderBtn = document.getElementById("new-folder") as HTMLButtonElement;
const filterInput = document.getElementById("filter-input") as HTMLInputElement;
const heading = document.getElementById("heading")!;
const favicon = document.getElementById("favicon") as HTMLImageElement;

const treeState: TreeState = {
  selectedFolderId: null,
  onFolderSelected: null,
};

let bookmarkId: string | null = null;
let currentParentId: string | null = null;

async function saveChanges() {
  if (!bookmarkId) return;
  const title = titleInput.value.trim();
  const url = urlInput.value.trim();
  if (!url) return;

  await updateBookmark(
    bookmarkId,
    title,
    url,
    treeState.selectedFolderId,
    currentParentId!,
  );

  if (
    treeState.selectedFolderId &&
    treeState.selectedFolderId !== currentParentId
  ) {
    currentParentId = treeState.selectedFolderId;
  }

  if (treeState.selectedFolderId) {
    await setLastFolderId(treeState.selectedFolderId);
  }
}

async function init() {
  // Restore saved tree height
  const savedHeight = await getTreeHeight();
  if (savedHeight) {
    const h = Math.max(100, Math.min(600, savedHeight));
    treeEl.style.height = h + "px";
  }

  // Persist tree height when user resizes via CSS resize handle.
  // Clamp so the popup doesn't exceed the viewport (Chrome caps at 600px).
  const resizeObserver = new ResizeObserver(() => {
    const overflow = document.documentElement.scrollHeight - window.innerHeight;
    if (overflow > 0) {
      const clamped = treeEl.offsetHeight - overflow;
      treeEl.style.height = clamped + "px";
    }
    setTreeHeight(treeEl.offsetHeight);
  });
  resizeObserver.observe(treeEl);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const pageTitle = tab.title || "";
  const pageUrl = tab.url || "";

  titleInput.value = pageTitle;
  urlInput.value = pageUrl;

  // Show favicon
  if (tab.favIconUrl) {
    favicon.src = tab.favIconUrl;
    favicon.style.display = "";
  } else {
    favicon.style.display = "none";
  }

  // Check if already bookmarked, or create immediately
  const existing = await findExistingBookmark(pageUrl);
  if (existing) {
    bookmarkId = existing.id;
    currentParentId = existing.parentId!;
    titleInput.value = existing.title;
    urlInput.value = existing.url!;
    heading.textContent = "Edit bookmark";
  } else {
    const lastFolderId = await getLastFolderId();
    let parentId = lastFolderId || DEFAULT_FOLDER_ID;

    // Verify the parent folder still exists (it may have been deleted)
    try {
      await chrome.bookmarks.get(parentId);
    } catch {
      parentId = DEFAULT_FOLDER_ID;
    }

    const created = await createBookmark(pageTitle, pageUrl, parentId);
    bookmarkId = created.id;
    currentParentId = parentId;
    heading.textContent = "Bookmark added";
  }

  removeBtn.style.display = "";

  // Build folder tree
  const targetFolderId = currentParentId || DEFAULT_FOLDER_ID;
  const tree = await chrome.bookmarks.getTree();
  const pathToTarget = new Set<string>();
  findPathToTarget(tree[0], targetFolderId, pathToTarget);

  treeState.onFolderSelected = () => saveChanges();

  for (const root of tree[0].children || []) {
    const el = buildTreeNode(
      root,
      0,
      pathToTarget,
      targetFolderId,
      treeEl,
      treeState,
    );
    if (el) treeEl.appendChild(el);
  }

  const sel = treeEl.querySelector(".selected");
  if (sel) sel.scrollIntoView({ block: "nearest" });

  // Type-to-filter
  const treeFilter = setupTreeFilter(treeEl, filterInput, treeState);

  treeState.onTreeChanged = () => treeFilter.invalidateCache();

  // Auto-save on title/URL changes (debounced)
  let saveTimeout: ReturnType<typeof setTimeout>;
  const debouncedSave = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => saveChanges(), 400);
  };
  titleInput.addEventListener("input", debouncedSave);
  urlInput.addEventListener("input", debouncedSave);

  // Actions — form submit closes popup (flush pending save first)
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearTimeout(saveTimeout);
    await saveChanges();
    window.close();
  });

  removeBtn.addEventListener("click", async () => {
    if (bookmarkId) {
      await removeBookmark(bookmarkId);
    }
    window.close();
  });

  newFolderBtn.addEventListener("click", async () => {
    await createNewFolder(treeEl, treeState);
    treeFilter.invalidateCache();
  });

  // Ctrl+N to create new folder
  document.addEventListener("keydown", async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "n") {
      e.preventDefault();
      await createNewFolder(treeEl, treeState);
      treeFilter.invalidateCache();
    }
  });

  // Focus name input with all text selected
  titleInput.focus();
  titleInput.select();
}

init().catch((err) => {
  console.error("Quick Add Bookmark init failed:", err);
  const container = document.querySelector(".container") as HTMLElement;
  if (container) {
    container.innerHTML = "";
    container.className = "error-screen";
    const msg = document.createElement("p");
    msg.textContent = "Something went wrong. Please try again.";
    container.appendChild(msg);
    const detail = document.createElement("p");
    detail.className = "error-detail";
    detail.textContent = String(err);
    container.appendChild(detail);
  }
});
