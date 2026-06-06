import { buildFaviconIcon, type BookmarkEntry } from "../../../shared/tree";

export const tokenize = (query: string): string[] =>
  query.toLowerCase().split(/\s+/).filter(Boolean);

/**
 * Whitespace-tokenized substring filter. Every term must appear
 * (case-insensitive) somewhere in the bookmark's title, url, or
 * breadcrumb folder path.
 */
export const filterBookmarks = (
  entries: BookmarkEntry[],
  query: string,
): BookmarkEntry[] => {
  const terms = tokenize(query);
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

export interface HighlightSegment {
  text: string;
  match: boolean;
}

/**
 * Split text into alternating match/non-match segments based on the
 * terms. Matches are case-insensitive substrings; overlapping matches
 * are merged so each character belongs to at most one segment.
 */
export const highlightSegments = (
  text: string,
  terms: string[],
): HighlightSegment[] => {
  if (terms.length === 0 || text === "") {
    return [{ text, match: false }];
  }

  const lower = text.toLowerCase();
  const ranges: Array<[number, number]> = [];
  for (const term of terms) {
    if (!term) continue;
    let idx = 0;
    while ((idx = lower.indexOf(term, idx)) !== -1) {
      ranges.push([idx, idx + term.length]);
      idx += term.length;
    }
  }

  if (ranges.length === 0) return [{ text, match: false }];

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  const segments: HighlightSegment[] = [];
  let pos = 0;
  for (const [start, end] of merged) {
    if (pos < start) {
      segments.push({ text: text.slice(pos, start), match: false });
    }
    segments.push({ text: text.slice(start, end), match: true });
    pos = end;
  }
  if (pos < text.length) {
    segments.push({ text: text.slice(pos), match: false });
  }
  return segments;
};

const appendHighlighted = (
  parent: HTMLElement,
  text: string,
  terms: string[],
): void => {
  for (const seg of highlightSegments(text, terms)) {
    if (seg.match) {
      const span = document.createElement("span");
      span.className = "match";
      span.textContent = seg.text;
      parent.appendChild(span);
    } else {
      parent.appendChild(document.createTextNode(seg.text));
    }
  }
};

export const renderFilterResults = (
  container: HTMLElement,
  entries: BookmarkEntry[],
  terms: string[],
  preserveHighlightId?: string,
): void => {
  container.innerHTML = "";

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "tree-empty";
    empty.textContent = "No bookmarks found";
    container.appendChild(empty);
    return;
  }

  const preservedIdx = preserveHighlightId
    ? entries.findIndex((e) => e.id === preserveHighlightId)
    : -1;
  const highlightIdx = preservedIdx >= 0 ? preservedIdx : 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const item = document.createElement("div");
    item.className = "tree-item tree-bookmark tree-filter-item";
    if (i === highlightIdx) item.classList.add("highlighted");
    item.dataset.id = entry.id;
    item.dataset.url = entry.url;

    item.appendChild(buildFaviconIcon(entry.url));

    const label = document.createElement("span");
    label.className = "tree-label";

    const titleRow = document.createElement("span");
    titleRow.className = "tree-title-row";

    const title = document.createElement("span");
    title.className = "tree-title";
    appendHighlighted(title, entry.title, terms);
    titleRow.appendChild(title);

    if (entry.path.length > 0) {
      const bc = document.createElement("span");
      bc.className = "tree-breadcrumb";
      appendHighlighted(bc, entry.path.join(" / "), terms);
      titleRow.appendChild(bc);
    }

    label.appendChild(titleRow);

    const url = document.createElement("span");
    url.className = "tree-url";
    appendHighlighted(url, entry.url, terms);
    label.appendChild(url);

    item.appendChild(label);
    container.appendChild(item);
  }
};
