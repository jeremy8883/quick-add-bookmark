import { rmSync, mkdirSync, cpSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const bin = (cmd) => resolve(root, "node_modules", ".bin", cmd);

// Clean
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

// Type check
execSync(`"${bin("tsc")}" --noEmit`, { stdio: "inherit", shell: true });

// Bundle
execSync(
  `"${bin("esbuild")}" src/popup.ts --bundle --outfile=dist/popup.js --format=iife --target=chrome115`,
  { stdio: "inherit", shell: true },
);
execSync(
  `"${bin("esbuild")}" src/background.ts --bundle --outfile=dist/background.js --format=iife --target=chrome115`,
  { stdio: "inherit", shell: true },
);

// Copy static assets
cpSync("manifest.json", "dist/manifest.json");
cpSync("popup.html", "dist/popup.html");
cpSync("popup.css", "dist/popup.css");
cpSync("icons", "dist/icons", { recursive: true });
