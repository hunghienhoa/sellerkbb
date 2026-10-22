import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const template = fs.readFileSync(path.join(root, "worker", "api-template.js"), "utf8");
const mascot = fs.readFileSync(path.join(root, "public", "khangbaby-mascot.png")).toString("base64");
const built = template.replace("__APP_HTML__", JSON.stringify(html))
  .replace("__BRAND_MASCOT_B64__", JSON.stringify(mascot));
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist", "worker.mjs"), built);
console.log(`Built dist/worker.mjs (${built.length} bytes)`);
