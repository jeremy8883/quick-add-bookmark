import { mkdirSync, cpSync, watch as fsWatch } from "fs";
import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const bin = (cmd) => resolve(root, "node_modules", ".bin", cmd);

const EXTENSIONS = [
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
];

const esbuild = bin("esbuild");

for (const ext of EXTENSIONS) {
  const extDir = `extensions/${ext.name}`;
  const outDir = `dist/${ext.name}`;
  mkdirSync(outDir, { recursive: true });

  for (const asset of ext.staticAssets) {
    cpSync(`${extDir}/${asset}`, `${outDir}/${asset}`, { recursive: true });
  }

  for (const { src, out } of ext.entries) {
    spawn(
      esbuild,
      [
        `${extDir}/${src}`,
        "--bundle",
        `--outfile=${outDir}/${out}`,
        "--format=iife",
        "--target=chrome115",
        "--watch",
      ],
      { stdio: "inherit" },
    );
  }

  for (const asset of ext.staticAssets) {
    if (asset === "icons") continue;
    fsWatch(`${extDir}/${asset}`, () =>
      cpSync(`${extDir}/${asset}`, `${outDir}/${asset}`),
    );
  }
}
