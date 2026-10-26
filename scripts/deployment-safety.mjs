import fs from "node:fs";
import assert from "node:assert/strict";

// Read-only guard. This script never requests tokens or changes production data.
// It runs before Firestore rules, Cloudflare Worker or Release are deployed.
const root = new URL("../", import.meta.url);
const read = name => fs.readFileSync(new URL(name,root),"utf8");
const version = read("VERSION").trim();
const pkg = JSON.parse(read("package.json"));
const config = read("wrangler.toml");
const html = read("public/index.html");
const worker = read("worker/api-template.js");
const rules = read("firebase/firestore.rules");
const workflow = read(".github/workflows/deploy.yml");

assert.match(version,/^\d+\.\d+\.\d+$/,"Release VERSION is not semantic");
assert.equal(pkg.version,version,"package.json / VERSION mismatch");
assert.match(config,new RegExp('^APP_VERSION = "'+version.replaceAll(".","\\.")+'"$',"m"),
  "Cloudflare APP_VERSION must match source version");
assert.ok(html.includes("version:'"+version+"-preview'") &&
  html.includes('id="syncBadge" class="pill">v'+version+"</span>"),
  "Visible website and preview must match deployed source version");

// Never silently rebind the production KV namespace or overwrite Worker secrets.
assert.match(config,/^name = "sellerkbb"$/m,"Unexpected Worker name");
assert.match(config,/^keep_vars = true$/m,"Worker secrets must survive deployment");
assert.match(config,/^binding = "TIKTOK_KV"$/m,"TikTok data KV binding was removed");
assert.match(config,/^id = "b622d8a3949d4a1d95d4ad4b24b7b114"$/m,
  "TikTok production KV namespace changed; explicit migration and verified backup required");

// Protect the identities, reconciliation data contracts and account permissions.
assert.ok(worker.includes('new Set(["shopkhangbaby", "mekhangsua"])'),
  "Only the two approved TikTok creators may be synchronized");
assert.ok(worker.includes('name.startsWith(CREATOR_TOKEN_PREFIX)'),
  "Creator refresh tokens must be protected from automatic KV cleanup");
for (const collection of ["users","liveSessions","liveKpiDrafts"]) {
  assert.ok(rules.includes("match /"+collection+"/"),
    "Firestore data/authorization collection removed: "+collection);
}

// Fail-closed CI: missing credentials, wrong version or broken smoke test must
// stop BOTH deployments; Firestore must not deploy when web tests fail.
assert.match(workflow,/^  safety-preflight:$/m,"Shared pre-deployment safety gate missing");
assert.match(workflow,/^  deploy-firestore:\n    needs: safety-preflight$/m,
  "Firestore deploy must depend on successful tests");
assert.match(workflow,/^  deploy-cloudflare:\n    needs: \[safety-preflight, deploy-firestore\]$/m,
  "Cloudflare must wait for safety tests and compatible Firestore rules");
for (const step of [
  "scripts/deployment-safety.mjs",
  "node scripts/ui-browser-test.mjs",
  "node scripts/ui-audit.mjs",
  "npm run check",
  "npm run build"
]) {
  assert.ok(workflow.includes(step),"Mandatory pre-deploy check is missing: "+step);
}
assert.ok(workflow.includes('::error::Missing deployment credential'),
  "Missing deployment secrets must FAIL the workflow rather than warn and skip");
assert.ok(workflow.includes("--only firestore:rules,firestore:indexes"),
  "The pipeline must deploy only Firestore metadata, never the data itself");
assert.ok(!/firebase\s+firestore:delete|wrangler\s+kv\s+(?:key\s+delete|bulk\s+delete)|gcloud\s+firestore\s+databases\s+delete/i.test(workflow),
  "Destructive database/KV commands are forbidden in the deployment pipeline");

console.log("Predeploy safety OK: one app version, same KV namespace, Creator token protection, both deploys gated");
