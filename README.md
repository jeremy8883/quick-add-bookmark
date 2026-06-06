# Quick Browser Suite

This repo includes a set of Chrome extensions that are typically built to improve the UI of existing browser features.

## Quick Add Bookmark

[Avaliable in the Chrome Web Store](https://chromewebstore.google.com/detail/quick-add-bookmark/clkfkgboihgogpbflcaiemmphjjcoaio)

Replaces the default bookmark dialog with a full folder tree view. Bookmark is saved immediately on open. Simply pick a folder, tweak the name/URL if needed, and close.

<img src="./docs/screenshot-1.png" width="300" />

It behaves like the default Chrome bookmarks popup, but without the initial dropdown, and the hidden "advanced mode".

To search through folders, simply start typing.

> Note: AI has been used to generate this extension. With that said, it's also an extension that I use personally, and I will be on-top of any bugs and UI improvements.

## Quick Go To Bookmark

Quick open mechanisim for launching a bookmark. Simply type to search, then press enter.

Not yet submitted to the Chrome Web Store, but can be built from source (instructions below).

### Quick Sync Bookmark

Give the ability to sync your bookmarks to Dropbox and other cloud providers. Still WIP.

### Quick Find

Improved search experience, with regex support! Still WIP.

## Install

As well as downloading from the Chrome Web Store, you can also download the compiled releases here.

1. Download the [latest .zip release](https://github.com/jeremy8883/quick-add-bookmark/releases), then extract to a location of choice.
1. Open `chrome://extensions` and enable **Developer mode**
1. Click **Load unpacked** and select the extracted extension

If you'd like to override the default "Add bookmark" shortcut, go to `chrome://extensions/shortcuts` and map "Quick Add Bookmark" to Ctrl + D.

## Build from source

Clone the repo and install dependencies:

```bash
npm install
npm run build
```

## Development

```bash
npm run watch     # rebuild on file changes
npm run build     # typecheck + bundle + copy assets to dist/
npm test          # run tests
```

Run `npm run` for all commands.
