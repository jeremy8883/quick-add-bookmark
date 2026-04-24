# Quick Add Bookmark

Chrome extension that replaces the default bookmark dialog with a full folder tree view. Bookmark is saved immediately on open — just pick a folder, tweak the name/URL if needed, and close.

## Features

- Full bookmark folder tree with expand/collapse
- Auto-saves all changes (title, URL, folder) immediately
- Remembers last-used folder
- Type-to-filter: start typing while the tree is focused to search folders
- Inline new folder creation
- Remove bookmark button
- Keyboard shortcut: `Ctrl+Shift+D` (Windows/Linux) / `Cmd+Shift+D` (Mac)

## Install

1. Clone the repo and install dependencies:
   ```bash
   npm install
   npm run build
   ```
2. Open `chrome://extensions` and enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` directory

To remap the shortcut (e.g. override Chrome's `Ctrl+D`), go to `chrome://extensions/shortcuts`.

## Development

```bash
npm run watch     # rebuild on file changes
npm run build     # typecheck + bundle + copy assets to dist/
npm run lint      # eslint
npm run format    # prettier
npm test          # vitest
```

## Project Structure

```
src/
  popup.ts       — entry point, init, auto-save wiring
  tree.ts        — folder tree rendering, expand/collapse, new folder
  filter.ts      — type-to-filter with flattened breadcrumb view
  bookmarks.ts   — Chrome bookmarks API wrapper (CRUD)
  storage.ts     — last-used folder persistence
  constants.ts   — shared constants
popup.html       — popup markup
popup.css        — styles
manifest.json    — MV3 extension config
```
