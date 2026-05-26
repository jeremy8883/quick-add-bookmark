import type { BookmarkEntry } from "../../../shared/tree";
import { BOOKMARK_LEAF_SVG } from "../../../shared/constants";

/**
 * Whitespace-tokenized substring filter. Every term must appear
 * (case-insensitive) somewhere in the bookmark's title, url, or
 * breadcrumb folder path.
 */
export const filterBookmarks = (
  entries: BookmarkEntry[],
  query: string,
): BookmarkEntry[] => {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return entries;
  return entries.filter((b) => {
    const haystack = (
      b.title +
      " " +
      b.url +
      " " +
      b.path.join(" ")
    ).toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
};

export const renderFilterResults = (
  container: HTMLElement,
  entries: BookmarkEntry[],
): void => {
  container.innerHTML = "";

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "tree-empty";
    empty.textContent = "No bookmarks found";
    container.appendChild(empty);
    return;
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const item = document.createElement("div");
    item.className = "tree-item tree-bookmark tree-filter-item";
    if (i === 0) item.classList.add("highlighted");
    item.dataset.id = entry.id;
    item.dataset.url = entry.url;

    const iconSpan = document.createElement("span");
    iconSpan.innerHTML = BOOKMARK_LEAF_SVG;
    item.appendChild(iconSpan.firstElementChild!);

    const label = document.createElement("span");
    label.className = "tree-label";

    const title = document.createElement("span");
    title.className = "tree-title";
    title.textContent = entry.title;
    label.appendChild(title);

    if (entry.path.length > 0) {
      const bc = document.createElement("span");
      bc.className = "tree-breadcrumb";
      bc.textContent = entry.path.join(" / ");
      label.appendChild(bc);
    }

    item.appendChild(label);
    container.appendChild(item);
  }
};
