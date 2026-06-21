import { readFileSync } from "fs";
import { execSync } from "child_process";
import { resolveExtension } from "./extensions.js";

// Builds, packages, and cuts a GitHub release for a single extension.
// The release tag is per-extension: <name>-v<version> (e.g.
// quick-go-to-bookmark-v0.2.0), so each extension has its own tag namespace.
// Usage: node scripts/release.js <name>
const ext = resolveExtension(process.argv[2], "Usage: npm run release -- <name>");

const version = JSON.parse(
  readFileSync(`extensions/${ext.name}/manifest.json`, "utf-8"),
).version;

const tag = `${ext.name}-v${version}`;
const zip = `${ext.name}.zip`;

const run = (cmd) => execSync(cmd, { stdio: "inherit", shell: true });

run(`node scripts/build.js ${ext.name}`);
run(`node scripts/package.js ${ext.name}`);
run(
  `gh release create ${tag} ${zip} --title "${ext.name} v${version}" --generate-notes`,
);

console.log(`Released ${tag}`);
console.log(`Now upload ${zip} to the Chrome Web Store.`);
