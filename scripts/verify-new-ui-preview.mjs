import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');

assert.ok(fs.existsSync(new URL('dist/worker.mjs', root)),
  'Run npm run build before preview verification');
const worker = (await import(new URL('../dist/worker.mjs', import.meta.url))).default;
const env = {}; // No TikTok, Firebase or production KV credentials, ever.
const ctx = {waitUntil() {}};
const request = path => new Request('https://preview-test.local' + path);
const production = await worker.fetch(request('/'), env, ctx);
const preview = await worker.fetch(request('/preview'), env, ctx);
assert.equal(production.status, 200);
assert.equal(preview.status, 200);
const productionHtml = await production.text();
const previewHtml = await preview.text();
const rawHtml = read('public/index.html');
const newUiCss = read('public/new-ui-preview.css');

assert.equal(productionHtml, rawHtml,
  'The main website HTML must stay EXACTLY unchanged');
assert.match(previewHtml, /id="new-ui-preview-style"/);
assert.match(previewHtml, /id="newUiPreviewLabel"/);
assert.match(previewHtml, /GIAO DIỆN MỚI · PREVIEW/);
assert.match(previewHtml, /const PREVIEW = location.pathname === '\/preview'/);
assert.match(newUiCss, /--bg:#FFF7FA/);
assert.match(newUiCss, /--accent:#EC4899/);
assert.match(newUiCss, /@media\(max-width:700px\)/);
assert.ok(previewHtml.includes(newUiCss));
assert.equal(previewHtml.replace('<style id="new-ui-preview-style">' + newUiCss + '</style>', '')
  .replace('<div id="newUiPreviewLabel" aria-label="Đang ở bản giao diện mới, dữ liệu thử nghiệm">GIAO DIỆN MỚI · PREVIEW</div>', ''), rawHtml,
  'Preview may modify only CSS and add its visual preview marker');
const bannedWords = ['localStorage.setItem', 'firebaseConfig =', 'signInWithPopup ='];
for (const forbidden of bannedWords) assert.ok(!newUiCss.includes(forbidden),
  'Never bring demo business logic into the CSS adapter');

console.log('PASS: production HTML is byte-for-byte unchanged; /preview uses the new UI style.');
if (process.env.RUN_PREVIEW_BROWSER_TEST !== '1') process.exit(0);

const puppeteer = (await import('puppeteer-core')).default;
const chrome = [
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].find(path => path && fs.existsSync(path));
assert.ok(chrome, 'Chromium required for browser smoke tests');
const server = http.createServer(async (req, res) => {
  const path = new URL(req.url || '/', 'http://127.0.0.1').pathname;
  try {
    const target = await worker.fetch(request(path), env, ctx);
    res.writeHead(target.status, Object.fromEntries(target.headers));
    res.end(Buffer.from(await target.arrayBuffer()));
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
});
const browserErrors = [];
let browser;
try {
  await new Promise(resolve => server.listen(4177, '127.0.0.1', resolve));
  browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  for (const width of [320,390,768,1024,1440]) {
    const page = await browser.newPage();
    page.on('pageerror', error => browserErrors.push({width, error: error.message}));
    await page.setViewport({width,height:900,deviceScaleFactor:1});
    await page.goto('http://127.0.0.1:4177/preview',{waitUntil:'domcontentloaded',timeout:25000});
    await page.waitForSelector('#app:not(.hidden)',{timeout:15000});
    const result = await page.evaluate(() => {
      const app = document.querySelector('#app'), panel=document.querySelector('#section-dashboard');
      const activeCard = panel.querySelector('.card');
      const title = document.querySelector('.page-title');
      const nav = [...document.querySelectorAll('#nav button')];
      return {
        bg:getComputedStyle(document.body).backgroundColor,
        backgroundToken:getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
        cardRadius:activeCard ? parseFloat(getComputedStyle(activeCard).borderTopLeftRadius) : null,
        cardCount:panel.querySelectorAll('.card').length,
        navCount:nav.length,
        markerVisible:!!document.querySelector('#newUiPreviewLabel'),
        viewportWidth:innerWidth,
        scrollWidth:document.documentElement.scrollWidth,
        title:title?.textContent,
        previewMode:location.pathname==='/preview',
        appVisible:!app.classList.contains('hidden')
      };
    });
    assert.equal(result.backgroundToken.toUpperCase(),'#FFF7FA', 'Wrong new UI background at '+width);
    assert.ok(result.cardCount > 0 && result.navCount >= 5 && result.appVisible,
      'Preview dashboard is empty at '+width);
    assert.ok(result.cardRadius >= 12, 'Card radius must match ZIP on '+width+': '+JSON.stringify(result));
    assert.ok(result.markerVisible, 'Preview marker missing at '+width);
    assert.ok(result.scrollWidth<=width+2,
      'Horizontal page overflow at '+width+': '+JSON.stringify(result));
    const navButton = await page.$('#nav button[data-section="live"]');
    if (navButton) {
      if (width <=700) {
        const menu=await page.$('#menuToggle');
        if(menu)await menu.click();
      }
      // Navigation is a delegated event handler. Click through the DOM here:
      // Puppeteer coordinates are obscured by the mobile drawer backdrop at 320px,
      // whereas the existing dedicated ui-browser-test checks physical touch navigation.
      await page.$eval('#nav button[data-section="live"]', button => button.click());
      await page.waitForSelector('#section-live.active',{timeout:5000});
    }
    console.log('PASS Chromium /preview '+width+'px: '+result.cardCount+' cards, '+result.navCount+' tabs; radius '+result.cardRadius+'px, scroll '+result.scrollWidth+'px');
    await page.close();
  }
  assert.equal(browserErrors.length,0,'Browser runtime errors: '+JSON.stringify(browserErrors));
  console.log('PASS Chromium responsive /preview smoke at five widths');
} finally {
  if(browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
