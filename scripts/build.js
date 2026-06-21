import { rmSync, mkdirSync, cpSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { EXTENSIONS, EXTENSION_NAMES } from "./extensions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const bin = (cmd) => resolve(root, "node_modules", ".bin", cmd);

// Optionally build a single extension: `node scripts/build.js <name>`.
// With no argument, builds all of them.
const only = process.argv[2];
if (only && !EXTENSION_NAMES.includes(only)) {
  console.error(`Unknown extension: ${only}`);
  console.error(`Extensions: ${EXTENSION_NAMES.join(", ")}`);
  process.exit(1);
}
const targets = only ? EXTENSIONS.filter((e) => e.name === only) : EXTENSIONS;

mkdirSync("dist", { recursive: true });

execSync(`"${bin("tsc")}" --noEmit`, { stdio: "inherit", shell: true });

for (const ext of targets) {
  rmSync(`dist/${ext.name}`, { recursive: true, force: true });
  const extDir = `extensions/${ext.name}`;
  const outDir = `dist/${ext.name}`;
  mkdirSync(outDir, { recursive: true });

  for (const { src, out } of ext.entries) {
    execSync(
      `"${bin("esbuild")}" ${extDir}/${src} --bundle --outfile=${outDir}/${out} --format=iife --target=chrome115`,
      { stdio: "inherit", shell: true },
    );
  }

  for (const asset of ext.staticAssets) {
    cpSync(`${extDir}/${asset}`, `${outDir}/${asset}`, { recursive: true });
  }
}
