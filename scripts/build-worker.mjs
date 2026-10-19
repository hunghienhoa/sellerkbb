import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const template = fs.readFileSync(path.join(root, "worker", "api-template.js"), "utf8");
const built = template.replace("__APP_HTML__", JSON.stringify(html));
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist", "worker.mjs"), built);
console.log(`Built dist/worker.mjs (${built.length} bytes)`);
