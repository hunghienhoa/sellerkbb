import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';

const version=fs.readFileSync(new URL('../VERSION',import.meta.url),'utf8').trim();
const source=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const origin='https://sellerkbb.doanhsokpis.workers.dev';
for(const path of ['/api/health','/','/preview']) {
  const response=await fetch(origin+path,{cache:'no-store'});
  assert(response.ok,`${path}: HTTP ${response.status}`);
  if(path==='/api/health') {
    const health=await response.json();
    assert.equal(health.ok,true);
    assert.equal(health.version,version,'Production APP_VERSION mismatch');
  } else {
    assert.equal((await response.text()).replace(/\r\n/g,'\n'),source,`${path}: served source differs from tested source`);
  }
  console.log(`Verified ${path}: v${version}`);
}

// CI owns the deployment credentials. Keep CLI JSON private and log only release metadata.
if(process.env.VERIFY_CLOUDFLARE==='true') {
  const cli=(...args)=>JSON.parse(execFileSync('npx',['--no-install','wrangler',...args,'--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  const deployments=cli('deployments','list').sort((a,b)=>a.created_on.localeCompare(b.created_on));
  const current=deployments.at(-1);
  assert.equal(current.versions.length,1,'Expected a single production version');
  assert.equal(current.versions[0].percentage,100);
  const deployed=cli('versions','view',current.versions[0].version_id);
  assert.equal(deployed.annotations?.['workers/message'],`Commit ${process.env.GITHUB_SHA}`,'Deployed commit annotation mismatch');
  assert.equal(deployed.resources.bindings.find(b=>b.name==='APP_VERSION')?.text,version);
  console.log(`Verified Cloudflare version ${deployed.id}; commit ${process.env.GITHUB_SHA}; APP_VERSION ${version}`);
}
