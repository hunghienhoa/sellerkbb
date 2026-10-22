import fs from 'node:fs';
import http from 'node:http';
import puppeteer from 'puppeteer-core';

const chrome = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && fs.existsSync(p));
const out = process.env.AUDIT_OUTPUT || '../verification/audit';
fs.mkdirSync(out, {recursive:true});
const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const server = http.createServer((req,res) => {if(req.url?.startsWith('/khangbaby-wordmark.png')){res.setHeader('content-type','image/png');return res.end(fs.readFileSync(new URL('../public/khangbaby-wordmark.png',import.meta.url)));}res.setHeader('content-type','text/html; charset=utf-8');res.end(html);});
await new Promise(resolve => server.listen(4174,'127.0.0.1',resolve));
const browser = await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
const findings = [];
try {
  for (const width of [1440, 1024, 768, 390, 320]) {
    const page = await browser.newPage();
    page.on('pageerror', e => findings.push({width,error:e.message}));
    await page.setViewport({width,height:1000,deviceScaleFactor:1});
    await page.goto('http://127.0.0.1:4174/preview',{waitUntil:'networkidle2'});
    await page.waitForSelector('#app:not(.hidden)');
    const sections = await page.$$eval('#nav [data-section]', els => els.map(e => e.dataset.section));
    for (const section of sections) {
      await page.$eval(`#nav [data-section="${section}"]`, e => e.click());
      const range = await page.$(`#section-${section} [data-range-mode="30d"]`);
      if (range) await range.click();
      await page.evaluate(() => document.fonts.ready);
      if(process.env.AXE_PATH && [1440,390].includes(width)) {
        await page.addScriptTag({path:process.env.AXE_PATH});
        const result = await page.evaluate(async () => (await axe.run(document.querySelector('#app'), {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
        if(result.length)findings.push({width,section,accessibility:result});
      }
      const geometry = await page.evaluate(() => ({width:innerWidth,scroll:document.documentElement.scrollWidth}));
      if (geometry.scroll > width+1) findings.push({width,section,overflow:geometry.scroll});
      if ([1440,390].includes(width)) await page.screenshot({path:`${out}/${width}-${section}.png`,fullPage:false});
    }
    // Keyboard interaction must stay in a modal and restore focus on close.
    await page.click('#topbarAccountBtn');
    await page.$eval('#accountPopover', async el => Promise.all(el.getAnimations().map(a => a.finished)));
    if(process.env.AXE_PATH && [1440,390].includes(width)) {
      const violations=await page.evaluate(async()=>(await axe.run(document.querySelector('#accountPopover'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
      if(violations.length)findings.push({width,section:'account-dialog',accessibility:violations});
    }
    const assert = (ok,msg) => {if(!ok)throw new Error(`${width}: ${msg}`);};
    assert(await page.$eval('#app',e=>e.inert),'Background must be inert with a dialog open');
    assert(await page.evaluate(()=>document.activeElement.id==='accountModalClose'),'Account dialog must focus close');
    await page.keyboard.down('Shift');await page.keyboard.press('Tab');await page.keyboard.up('Shift');
    assert(await page.evaluate(()=>document.activeElement.id==='accountLogoutBtn'),'Shift+Tab must wrap inside account dialog');
    await page.keyboard.press('Tab');
    assert(await page.evaluate(()=>document.activeElement.id==='accountModalClose'),'Tab must wrap inside account dialog');
    await page.keyboard.press('Escape');
    assert(await page.evaluate(()=>!document.querySelector('#app').inert&&document.activeElement.id==='topbarAccountBtn'),'Escape must restore background and opener focus');
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.click('#topbarAccountBtn');
    assert(await page.$eval('#accountPopover',e=>getComputedStyle(e).animationName==='none'),'Reduced motion must disable modal animation');
    await page.keyboard.press('Escape');
    await page.$eval('#nav [data-section="reconcile"]',e=>e.click());
    await page.click('#section-reconcile [data-range-mode="30d"]');
    await page.click('#section-reconcile [data-reconcile-open]');
    await page.waitForSelector('#reconcileModalBody .reconcile-overview');
    await page.$eval('#reconcileModal', async el => Promise.all(el.getAnimations().map(a => a.finished)));
    await page.$eval('#reconcileModalClose',e=>e.focus());
    for(let i=0;i<20;i++) {
      await page.keyboard.press('Tab');
      assert(await page.evaluate(()=>document.querySelector('#reconcileModal').contains(document.activeElement)),'Tab escaped reconciliation dialog');
    }
    if([1440,390].includes(width))await page.screenshot({path:`${out}/${width}-reconcile-dialog.png`});
    if(process.env.AXE_PATH && [1440,390].includes(width)) {
      const violations=await page.evaluate(async()=>(await axe.run(document.querySelector('#reconcileModal'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
      if(violations.length)findings.push({width,section:'reconcile-dialog',accessibility:violations});
    }
    await page.keyboard.press('Escape');
    assert(await page.evaluate(()=>!document.querySelector('#app').inert&&!!document.activeElement.dataset.reconcileOpen),'Reconciliation dialog must restore opener focus');
    await page.close();
  }
  fs.writeFileSync(`${out}/findings.json`,JSON.stringify(findings,null,2));
  console.log(JSON.stringify({findingGroups:findings.length,output:out}));
  if(findings.length) {
    console.error("UI_AUDIT_FINDINGS="+JSON.stringify(findings));
    process.exitCode=1;
  }
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
