// Single source of truth for the extensions in this repo.
// Build, package, version, and release scripts all read from here.

export const EXTENSIONS = [
  {
    name: "quick-add-bookmark",
    entries: [
      { src: "src/popup.ts", out: "popup.js" },
      { src: "src/background.ts", out: "background.js" },
    ],
    staticAssets: ["manifest.json", "popup.html", "popup.css", "icons"],
  },
  {
    name: "quick-go-to-bookmark",
    entries: [
      { src: "src/go-to.ts", out: "go-to.js" },
      { src: "src/background.ts", out: "background.js" },
    ],
    staticAssets: ["manifest.json", "go-to.html", "go-to.css", "icons"],
  },
  {
    name: "quick-sync-bookmark",
    entries: [
      { src: "src/popup.ts", out: "popup.js" },
      { src: "src/options.ts", out: "options.js" },
      { src: "src/background.ts", out: "background.js" },
    ],
    staticAssets: [
      "manifest.json",
      "popup.html",
      "popup.css",
      "options.html",
      "options.css",
      "icons",
    ],
  },
];

export const EXTENSION_NAMES = EXTENSIONS.map((e) => e.name);

// Resolves an extension name from a CLI arg, exiting with a helpful message
// if it's missing or unknown. Used by package/version/release scripts.
export function resolveExtension(name, usage) {
  if (!name) {
    console.error(usage);
    console.error(`Extensions: ${EXTENSION_NAMES.join(", ")}`);
    process.exit(1);
  }
  const ext = EXTENSIONS.find((e) => e.name === name);
  if (!ext) {
    console.error(`Unknown extension: ${name}`);
    console.error(`Extensions: ${EXTENSION_NAMES.join(", ")}`);
    process.exit(1);
  }
  return ext;
}
