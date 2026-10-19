import fs from "node:fs";
const required = [
  "public/index.html",
  "worker/api-template.js",
  "firebase/firestore.rules",
  "firebase/firestore.indexes.json",
  "wrangler.toml"
];
for (const file of required) {
  if (!fs.existsSync(new URL(`../${file}`, import.meta.url))) throw new Error(`Missing ${file}`);
}
console.log("Project structure OK");
