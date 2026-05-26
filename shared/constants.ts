export const DEFAULT_FOLDER_ID = "2"; // "Other Bookmarks"

// Root/system folder IDs that must not be deleted (Chrome/Chromium)
export const ROOT_FOLDER_IDS = new Set(["0", "1", "2", "3"]);

export const FOLDER_SVG = `<svg class="tree-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M2 4.5A1.5 1.5 0 013.5 3h4.586a1 1 0 01.707.293L10.5 5H16.5A1.5 1.5 0 0118 6.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 012 15.5v-11z"/></svg>`;

export const BOOKMARK_LEAF_SVG = `<svg class="tree-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M5 2.5C5 1.7 5.7 1 6.5 1H13.5C14.3 1 15 1.7 15 2.5V18L10 14.5L5 18V2.5Z"/></svg>`;
