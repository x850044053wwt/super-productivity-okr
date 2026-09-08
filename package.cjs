const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const manifest = require("./manifest.json");
const output = path.join(__dirname, "releases");
const filename = `okr-${manifest.version}.zip`;
fs.mkdirSync(output, { recursive: true });
const archive = path.join(output, filename);
// Rebuild the archive from the explicit runtime files, without stale entries.
fs.rmSync(archive, { force: true });
execFileSync(
  "zip",
  [
    "-q",
    archive,
    "manifest.json",
    "plugin.js",
    "icon.svg",
    "index.html",
    "i18n/en.json",
    "LICENSE",
  ],
  {
    cwd: path.join(__dirname, "dist"),
    stdio: "inherit",
  },
);
console.log(`Created ${archive}`);
