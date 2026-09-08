const fs = require("node:fs");
const path = require("node:path");
const out = path.join(__dirname, "dist");
fs.mkdirSync(path.join(out, "i18n"), { recursive: true });
const read = (name) => fs.readFileSync(path.join(__dirname, name), "utf8");
const app = read("app.js").replace(
  "/* TRANSLATIONS */ {}",
  read("i18n/en.json"),
);
const html = read("index.template.html")
  .replace("/* MODEL */", read("model.js"))
  .replace("/* APP */", app);
fs.writeFileSync(path.join(out, "index.html"), html);
fs.copyFileSync(
  path.join(__dirname, "manifest.json"),
  path.join(out, "manifest.json"),
);
fs.copyFileSync(
  path.join(__dirname, "i18n/en.json"),
  path.join(out, "i18n/en.json"),
);

for (const file of ["plugin.js", "icon.svg", "LICENSE"]) {
  fs.copyFileSync(path.join(__dirname, file), path.join(out, file));
}
