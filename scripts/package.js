import { rmSync } from "fs";
import { execSync } from "child_process";
import { resolveExtension } from "./extensions.js";

// Zips a built extension's dist into <name>.zip (manifest at the zip root, as
// the Chrome Web Store requires). Run `npm run build` first.
// Usage: node scripts/package.js <name>
const ext = resolveExtension(process.argv[2], "Usage: npm run package -- <name>");

const zip = `${ext.name}.zip`;
rmSync(zip, { force: true });
execSync(`zip -r ../../${zip} .`, {
  cwd: `dist/${ext.name}`,
  stdio: "inherit",
  shell: true,
});

console.log(`Packaged ${zip}`);
