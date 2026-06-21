import { readFileSync, writeFileSync } from "fs";
import { resolveExtension } from "./extensions.js";

// Bumps a single extension's version. The extension's manifest.json is the
// source of truth. Usage: node scripts/version.js <name> <major|minor|patch>
const name = process.argv[2];
const bump = process.argv[3];

const ext = resolveExtension(
  name,
  "Usage: npm run version -- <name> <major|minor|patch>",
);

if (!["major", "minor", "patch"].includes(bump)) {
  console.error("Usage: npm run version -- <name> <major|minor|patch>");
  process.exit(1);
}

const manifestPath = `extensions/${ext.name}/manifest.json`;
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
const parts = manifest.version.split(".").map(Number);

if (bump === "major") {
  parts[0]++;
  parts[1] = 0;
  parts[2] = 0;
} else if (bump === "minor") {
  parts[1]++;
  parts[2] = 0;
} else {
  parts[2]++;
}

const version = parts.join(".");
const updated = { ...manifest, version };
writeFileSync(manifestPath, JSON.stringify(updated, null, 2) + "\n");

console.log(`${ext.name}: ${manifest.version} → ${version}`);
