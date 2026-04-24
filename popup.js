const LAST_FOLDER_KEY = "lastBookmarkFolderId";

const titleInput = document.getElementById("title");
const urlInput = document.getElementById("url");
const treeEl = document.getElementById("tree");
const saveBtn = document.getElementById("save");
const cancelBtn = document.getElementById("cancel");
const removeBtn = document.getElementById("remove");

let selectedFolderId = null;
let existingBookmark = null;

// --- Init ---

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  titleInput.value = tab.title || "";
  urlInput.value = tab.url || "";

  // Check if this URL is already bookmarked
  const existing = await chrome.bookmarks.search({ url: tab.url });
  if (existing.length > 0) {
    existingBookmark = existing[0];
    titleInput.value = existingBookmark.title;
    urlInput.value = existingBookmark.url;
    saveBtn.textContent = "Update";
    removeBtn.style.display = "";
  }

  // Build the tree
  const tree = await chrome.bookmarks.getTree();
  const lastFolderId = (await chrome.storage.local.get(LAST_FOLDER_KEY))[LAST_FOLDER_KEY];

  // Determine which folder to pre-select
  let targetFolderId;
  if (existingBookmark) {
    targetFolderId = existingBookmark.parentId;
  } else if (lastFolderId) {
    targetFolderId = lastFolderId;
  } else {
    // Default: "Other Bookmarks" (id "2") or first available folder
    targetFolderId = "2";
  }

  // Build tree and collect folder IDs on the path to target
  const pathToTarget = new Set();
  findPath(tree[0], targetFolderId, pathToTarget);

  for (const root of tree[0].children || []) {
    treeEl.appendChild(buildNode(root, 0, pathToTarget, targetFolderId));
  }

  // Scroll selected into view
  const sel = treeEl.querySelector(".selected");
  if (sel) sel.scrollIntoView({ block: "nearest" });
}

// Find the path from root to a target folder, returning true if found
function findPath(node, targetId, pathSet) {
  if (node.id === targetId) {
    pathSet.add(node.id);
    return true;
  }
  if (node.children) {
    for (const child of node.children) {
      if (findPath(child, targetId, pathSet)) {
        pathSet.add(node.id);
        return true;
      }
    }
  }
  return false;
}

// --- Tree rendering ---

const FOLDER_SVG = `<svg class="tree-icon" viewBox="0 0 20 20" fill="#5f6368"><path d="M2 4.5A1.5 1.5 0 013.5 3h4.586a1 1 0 01.707.293L10.5 5H16.5A1.5 1.5 0 0118 6.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 012 15.5v-11z"/></svg>`;

function buildNode(node, depth, pathToTarget, targetId) {
  // Only show folders (nodes with children array)
  if (!node.children) return null;

  const wrapper = document.createElement("div");

  const item = document.createElement("div");
  item.className = "tree-item";
  item.style.paddingLeft = (8 + depth * 16) + "px";
  item.dataset.id = node.id;

  const hasSubfolders = node.children.some(c => c.children);

  // Toggle arrow
  const toggle = document.createElement("span");
  toggle.className = "tree-toggle" + (hasSubfolders ? "" : " empty");
  toggle.textContent = "▶";
  item.appendChild(toggle);

  // Folder icon
  const iconSpan = document.createElement("span");
  iconSpan.innerHTML = FOLDER_SVG;
  item.appendChild(iconSpan.firstElementChild);

  // Label
  const label = document.createElement("span");
  label.className = "tree-label";
  label.textContent = node.title || "Bookmarks";
  item.appendChild(label);

  wrapper.appendChild(item);

  // Children container
  const childContainer = document.createElement("div");
  childContainer.className = "tree-children";

  // If this node is on the path to the target, expand it
  if (pathToTarget.has(node.id)) {
    childContainer.classList.add("open");
    toggle.textContent = "▼";
  }

  for (const child of node.children) {
    const childEl = buildNode(child, depth + 1, pathToTarget, targetId);
    if (childEl) childContainer.appendChild(childEl);
  }

  wrapper.appendChild(childContainer);

  // Select handling
  if (node.id === targetId) {
    item.classList.add("selected");
    selectedFolderId = node.id;
  }

  item.addEventListener("click", (e) => {
    e.stopPropagation();

    // Toggle expand/collapse if has subfolders
    if (hasSubfolders) {
      const isOpen = childContainer.classList.toggle("open");
      toggle.textContent = isOpen ? "▼" : "▶";
    }

    // Select this folder
    const prev = treeEl.querySelector(".selected");
    if (prev) prev.classList.remove("selected");
    item.classList.add("selected");
    selectedFolderId = node.id;
  });

  return wrapper;
}

// --- Actions ---

saveBtn.addEventListener("click", async () => {
  const title = titleInput.value.trim();
  const url = urlInput.value.trim();
  if (!url) return;

  if (existingBookmark) {
    // Update existing bookmark
    await chrome.bookmarks.update(existingBookmark.id, { title, url });
    // Move if folder changed
    if (selectedFolderId && selectedFolderId !== existingBookmark.parentId) {
      await chrome.bookmarks.move(existingBookmark.id, { parentId: selectedFolderId });
    }
  } else {
    // Create new bookmark
    await chrome.bookmarks.create({
      parentId: selectedFolderId || "2",
      title,
      url,
    });
  }

  // Remember last-used folder
  if (selectedFolderId) {
    await chrome.storage.local.set({ [LAST_FOLDER_KEY]: selectedFolderId });
  }

  window.close();
});

cancelBtn.addEventListener("click", () => {
  window.close();
});

removeBtn.addEventListener("click", async () => {
  if (existingBookmark) {
    await chrome.bookmarks.remove(existingBookmark.id);
  }
  window.close();
});

init();
