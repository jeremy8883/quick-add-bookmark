import { findPathToTarget, buildTreeNode, TreeState } from "./tree";
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
const saveBtn = document.getElementById("save") as HTMLButtonElement;
const cancelBtn = document.getElementById("cancel") as HTMLButtonElement;
const removeBtn = document.getElementById("remove") as HTMLButtonElement;

const treeState: TreeState = { selectedFolderId: null };
let existingBookmark: chrome.bookmarks.BookmarkTreeNode | null = null;

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  titleInput.value = tab.title || "";
  urlInput.value = tab.url || "";

  // Check if already bookmarked
  existingBookmark = await findExistingBookmark(tab.url!);
  if (existingBookmark) {
    titleInput.value = existingBookmark.title;
    urlInput.value = existingBookmark.url!;
    saveBtn.textContent = "Update";
    removeBtn.style.display = "";
  }

  // Determine target folder
  const lastFolderId = await getLastFolderId();
  let targetFolderId: string;
  if (existingBookmark) {
    targetFolderId = existingBookmark.parentId!;
  } else if (lastFolderId) {
    targetFolderId = lastFolderId;
  } else {
    targetFolderId = DEFAULT_FOLDER_ID;
  }

  // Build folder tree
  const tree = await chrome.bookmarks.getTree();
  const pathToTarget = new Set<string>();
  findPathToTarget(tree[0], targetFolderId, pathToTarget);

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
}

// --- Actions ---

saveBtn.addEventListener("click", async () => {
  const title = titleInput.value.trim();
  const url = urlInput.value.trim();
  if (!url) return;

  const folderId = treeState.selectedFolderId;

  if (existingBookmark) {
    await updateBookmark(
      existingBookmark.id,
      title,
      url,
      folderId,
      existingBookmark.parentId!,
    );
  } else {
    await createBookmark(title, url, folderId);
  }

  if (folderId) {
    await setLastFolderId(folderId);
  }

  window.close();
});

cancelBtn.addEventListener("click", () => window.close());

removeBtn.addEventListener("click", async () => {
  if (existingBookmark) {
    await removeBookmark(existingBookmark.id);
  }
  window.close();
});

init();
