import fs from "node:fs";
import http from "node:http";
import puppeteer from "puppeteer-core";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const chrome = [
  process.env.CHROME_BIN,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
].find(p => p && fs.existsSync(p));
if (!chrome) throw new Error("Chrome/Chromium executable not found");

const server = http.createServer((req,res)=>{
  if (req.url === "/favicon.ico") { res.writeHead(204); return res.end(); }
  res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});
  res.end(html);
});
await new Promise(resolve=>server.listen(4173,"127.0.0.1",resolve));

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args:["--no-sandbox","--disable-dev-shm-usage"]
});
const assert = (ok,msg) => { if(!ok) throw new Error(msg); };
const sleep = ms => new Promise(r=>setTimeout(r,ms));

try {
  const page = await browser.newPage();
  await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});
  await page.goto("http://127.0.0.1:4173/preview",{waitUntil:"domcontentloaded"});
  await page.waitForSelector("#app:not(.hidden)",{timeout:30000});
  await page.evaluate(()=>localStorage.clear());
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForSelector("#app:not(.hidden)",{timeout:30000});

  await page.click('[data-section="live"]');
  await page.click('#section-live [data-range-mode="custom"]');
  await page.waitForSelector('#section-live [data-date-calendar="live"] [data-calendar-day]');
  assert(await page.$('#section-live input[placeholder="DD/MM/YYYY"]') === null,"Manual date field still exists on desktop");
  const dayCount=await page.$$eval('#section-live [data-calendar-day]',els=>els.length);
  assert(dayCount>=28,"Calendar grid did not render enough days");
  const dates=await page.$$eval('#section-live [data-calendar-day]',els=>els.slice(0,2).map(x=>x.dataset.calendarDay));
  await page.click('#section-live [data-date-target="start"]');
  await page.click('#section-live [data-calendar-day="'+dates[0]+'"]');
  await page.click('#section-live [data-calendar-day="'+dates[1]+'"]');
  await page.click('#section-live [data-apply-range="live"]');

  const desktopRow='#section-live .desktop-live-table tbody tr:nth-child(1)';
  await page.select(desktopRow+' select[data-person="host"]','thao-my');
  await page.select(desktopRow+' select[data-person="operator"]','hung-bg');
  await page.click(desktopRow+' [data-save-session]');
  await sleep(150);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForSelector("#app:not(.hidden)",{timeout:30000});
  await page.click('[data-section="live"]');
  assert(await page.$eval(desktopRow+' select[data-person="host"]',e=>e.value)==='thao-my',"Desktop Host did not persist after reload");
  assert(await page.$eval(desktopRow+' select[data-person="operator"]',e=>e.value)==='hung-bg',"Desktop Operator did not persist after reload");

  await page.click(desktopRow+' [data-manual-kpi]');
  assert(await page.$eval(desktopRow+' select[data-person="host"]',e=>e.value)==='',"Campaign/Mega did not clear desktop Host");
  assert(await page.$eval(desktopRow+' select[data-person="operator"]',e=>e.value)==='',"Campaign/Mega did not clear desktop Operator");
  assert(await page.$eval(desktopRow+' select[data-person="host"]',e=>e.disabled),"Campaign/Mega did not disable desktop Host");
  await page.click(desktopRow+' [data-save-session]');
  await sleep(150);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForSelector("#app:not(.hidden)",{timeout:30000});
  await page.click('[data-section="live"]');
  assert(await page.$eval(desktopRow+' [data-manual-kpi]',e=>e.checked),"Campaign/Mega flag did not persist");
  assert(await page.$eval(desktopRow+' select[data-person="host"]',e=>e.value)==='',"Campaign/Mega Host was restored unexpectedly");

  await page.click('[data-section="storage"]');
  await page.select('#retentionDays','120');
  await page.click('#saveMaintenance');
  await sleep(100);
  await page.click('[data-section="users"]');
  await page.select('[data-role="pending-01"]','operator');
  await page.click('[data-approve="pending-01"]');
  await sleep(100);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForSelector("#app:not(.hidden)",{timeout:30000});
  await page.click('[data-section="storage"]');
  assert(await page.$eval('#retentionDays',e=>e.value)==='120',"Storage settings did not persist in Preview");
  await page.click('[data-section="users"]');
  assert(await page.$('[data-role="pending-01"]')===null,"Approved Preview user returned to pending after reload");

  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForSelector("#app:not(.hidden)",{timeout:30000});
  await page.click('#menuToggle');
  await page.click('#nav [data-section="live"]');

  const mobileCard='#section-live .mobile-live-card:nth-child(2)';
  await page.select(mobileCard+' select[data-person="host"]','dung');
  await page.select(mobileCard+' select[data-person="operator"]','hung-hh');
  await page.click(mobileCard+' [data-save-session]');
  await sleep(150);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForSelector("#app:not(.hidden)",{timeout:30000});
  await page.click('#menuToggle');
  await page.click('#nav [data-section="live"]');
  assert(await page.$eval(mobileCard+' select[data-person="host"]',e=>e.value)==='dung',"Mobile Host save read the wrong hidden desktop selector");
  assert(await page.$eval(mobileCard+' select[data-person="operator"]',e=>e.value)==='hung-hh',"Mobile Operator save read the wrong hidden desktop selector");

  await page.click(mobileCard+' [data-manual-kpi]');
  assert(await page.$eval(mobileCard+' select[data-person="host"]',e=>e.value)==='',"Mobile Campaign/Mega did not clear Host");
  assert(await page.$eval(mobileCard+' select[data-person="operator"]',e=>e.value)==='',"Mobile Campaign/Mega did not clear Operator");
  await page.click(mobileCard+' [data-save-session]');
  await sleep(100);

  await page.click('#section-live [data-range-mode="custom"]');
  await page.waitForSelector('#section-live [data-date-calendar="live"] [data-calendar-day]');
  assert((await page.$$eval('#section-live [data-calendar-day]',els=>els.length))>=28,"Mobile calendar grid missing");

  console.log("Desktop + mobile browser smoke tests passed");
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
