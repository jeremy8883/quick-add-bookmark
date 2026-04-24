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
import { getLastFolderId, setLastFolderId } from "./storage";

const DEFAULT_FOLDER_ID = "2";

const titleInput = document.getElementById("title") as HTMLInputElement;
const urlInput = document.getElementById("url") as HTMLInputElement;
const treeEl = document.getElementById("tree")!;
const doneBtn = document.getElementById("done") as HTMLButtonElement;
const removeBtn = document.getElementById("remove") as HTMLButtonElement;
const newFolderBtn = document.getElementById("new-folder") as HTMLButtonElement;

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
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const pageTitle = tab.title || "";
  const pageUrl = tab.url || "";

  titleInput.value = pageTitle;
  urlInput.value = pageUrl;

  // Check if already bookmarked, or create immediately
  const existing = await findExistingBookmark(pageUrl);
  if (existing) {
    bookmarkId = existing.id;
    currentParentId = existing.parentId!;
    titleInput.value = existing.title;
    urlInput.value = existing.url!;
  } else {
    // Create the bookmark immediately
    const lastFolderId = await getLastFolderId();
    const parentId = lastFolderId || DEFAULT_FOLDER_ID;
    const created = await createBookmark(pageTitle, pageUrl, parentId);
    bookmarkId = created.id;
    currentParentId = parentId;
  }

  // Show remove button now that we have a bookmark
  removeBtn.style.display = "";

  // Determine target folder for tree
  const targetFolderId = currentParentId || DEFAULT_FOLDER_ID;

  // Build folder tree
  const tree = await chrome.bookmarks.getTree();
  const pathToTarget = new Set<string>();
  findPathToTarget(tree[0], targetFolderId, pathToTarget);

  // Wire up folder selection to auto-save
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

  // Scroll selected into view
  const sel = treeEl.querySelector(".selected");
  if (sel) sel.scrollIntoView({ block: "nearest" });

  // Auto-save on title/URL changes (debounced)
  let saveTimeout: ReturnType<typeof setTimeout>;
  const debouncedSave = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => saveChanges(), 400);
  };
  titleInput.addEventListener("input", debouncedSave);
  urlInput.addEventListener("input", debouncedSave);
}

// --- Actions ---

doneBtn.addEventListener("click", () => window.close());

removeBtn.addEventListener("click", async () => {
  if (bookmarkId) {
    await removeBookmark(bookmarkId);
  }
  window.close();
});

newFolderBtn.addEventListener("click", () => {
  createNewFolder(treeEl, treeState);
});

init();
