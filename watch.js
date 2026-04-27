import { mkdirSync, cpSync, watch } from "fs";
import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bin = (cmd) => resolve(__dirname, "node_modules", ".bin", cmd);

// Ensure dist exists and copy static assets
mkdirSync("dist", { recursive: true });
cpSync("manifest.json", "dist/manifest.json");
cpSync("popup.html", "dist/popup.html");
cpSync("popup.css", "dist/popup.css");
cpSync("icons", "dist/icons", { recursive: true });

// Run both esbuild watchers
const esbuild = bin("esbuild");
const args = (entry, out) => [
  `src/${entry}`,
  "--bundle",
  `--outfile=dist/${out}`,
  "--format=iife",
  "--target=chrome115",
  "--watch",
];

spawn(esbuild, args("popup.ts", "popup.js"), { stdio: "inherit" });
spawn(esbuild, args("background.ts", "background.js"), { stdio: "inherit" });

// Re-copy static assets on change
for (const file of ["manifest.json", "popup.html", "popup.css"]) {
  watch(file, () => cpSync(file, `dist/${file}`));
}
