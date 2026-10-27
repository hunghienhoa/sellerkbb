import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';

const version=fs.readFileSync(new URL('../VERSION',import.meta.url),'utf8').trim();
const source=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const newUiCss=fs.readFileSync(new URL('../public/new-ui-preview.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const previewSource=source
  .replace('</head>', '<style id="new-ui-preview-style">' + newUiCss + '</style></head>')
  .replace('</body>', '<div id="newUiPreviewLabel" aria-label="Đang ở bản giao diện mới, dữ liệu thử nghiệm">GIAO DIỆN MỚI · PREVIEW</div></body>');

const origin='https://sellerkbb.doanhsokpis.workers.dev';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function fetchUntil(path,validate,{attempts=8,delayMs=1200}={}) {
  let lastError;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      const response=await fetch(origin+path,{cache:'no-store'});
      assert(response.ok,`${path}: HTTP ${response.status}`);
      const payload=path==='/api/health'?await response.json():(await response.text()).replace(/\r\n/g,'\n');
      validate(payload);
      if(attempt>1)console.log(`Verified ${path} after propagation retry ${attempt}/${attempts}`);
      return;
    }catch(error){
      lastError=error;
      if(attempt===attempts)break;
      await sleep(delayMs);
    }
  }
  throw lastError;
}

await fetchUntil('/api/health',health=>{
  assert.equal(health.ok,true);
  assert.equal(health.version,version,'Production APP_VERSION mismatch');
});
console.log(`Verified /api/health: v${version}`);

for(const path of ['/','/preview']) {
  const expected=path==='/preview'?previewSource:source;
  await fetchUntil(path,body=>assert.equal(body,expected,`${path}: served source differs from tested source`));
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
