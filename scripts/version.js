import { readFileSync, writeFileSync } from "fs";

const bump = process.argv[2];

if (!["major", "minor", "patch"].includes(bump)) {
  console.error("Usage: npm run version -- <major|minor|patch>");
  process.exit(1);
}

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
const parts = pkg.version.split(".").map(Number);

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

for (const file of ["package.json", "manifest.json"]) {
  const json = JSON.parse(readFileSync(file, "utf-8"));
  json.version = version;
  writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
}

console.log(`${pkg.version} → ${version}`);
