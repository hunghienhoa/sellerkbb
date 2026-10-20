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

  assert((await page.$eval('#userAvatar',e=>e.getAttribute('src')||'')).length>0,"Sidebar Google avatar is missing");
  const navGroups=await page.$$eval('#nav .nav-group-title',els=>els.map(e=>e.textContent.trim()));
  assert(navGroups.join('|')==='Báo cáo|Công cụ|Quản trị',"Sidebar groups are not ordered correctly");
  const toolItems=await page.$$eval('#nav .nav-group:nth-child(2) [data-section]',els=>els.map(e=>e.dataset.section));
  assert(toolItems.join('|')==='export|manual-kpi',"Công cụ must contain Xuất file then KPI thủ công");
  assert(await page.$('#nav .nav-group:nth-child(3) [data-section="users"]')!==null,"Quản lý tài khoản must be inside Quản trị");
  assert(await page.$eval('#nav [data-section="users"]',e=>e.textContent.includes('Quản lý tài khoản')),"Quản lý tài khoản label is missing");
  assert(await page.$('#nav .nav-group:nth-child(3) [data-section="staff"]')!==null,"Quản lý nhân sự must be a separate Quản trị tab");
  assert(await page.$eval('#nav [data-section="staff"]',e=>e.textContent.includes('Quản lý nhân sự')),"Quản lý nhân sự label is missing");
  assert(await page.$('#usersDockBtn')===null,"Duplicate external Users dock must be removed");
  assert(await page.$eval('.side-brand .brand-lockup',e=>e.textContent.replace(/\s+/g,'').includes('SellerKBBLIVE')),"SellerKBB LIVE brand lockup is incorrect");
  assert(await page.$eval('html',e=>getComputedStyle(e).getPropertyValue('--accent').trim())==='#e7a3c0',"Pastel pink theme accent is not active");
  await page.click('#userMenuBtn');
  assert(!(await page.$eval('#accountPopover',e=>e.classList.contains('hidden'))),"Account popover did not open");
  assert(await page.$eval('#accountPopover',e=>e.textContent.includes('admin@sellerkbb.demo')&&e.textContent.includes('Quản trị viên')&&e.textContent.includes('Đã duyệt')&&e.textContent.includes('Toàn quyền quản trị')),"Account popover basic information missing");
  assert(await page.$('#accountLogoutBtn')!==null,"Account logout button missing");
  await page.click('#userMenuBtn');
  assert(await page.$eval('#accountPopover',e=>e.classList.contains('hidden')),"Account popover did not close");

  assert(await page.$eval('#section-dashboard [data-range-mode="today"]',e=>e.classList.contains('active')),"Dashboard must default to Today");
  await page.click('#section-dashboard [data-range-mode="7d"]');
  assert(await page.$eval('#section-dashboard [data-range-mode="7d"]',e=>e.classList.contains('active')),"7-day filter did not activate");
  await page.click('#section-dashboard [data-range-mode="30d"]');
  assert(await page.$eval('#section-dashboard [data-range-mode="30d"]',e=>e.classList.contains('active')),"30-day filter did not activate");
  assert(await page.$eval('#section-dashboard .dashboard-range-note',e=>e.textContent.includes('chỉ hiển thị 7 ngày gần nhất')),"Monthly Dashboard 7-day preview note missing");
  assert(await page.$('#dashboardViewMore')!==null,"Monthly Dashboard View More button missing");
  await page.click('#dashboardViewMore');
  assert(await page.$eval('#section-live',e=>e.classList.contains('active')),"View More did not switch to LIVE section");
  assert(await page.$eval('#section-live [data-range-mode="30d"]',e=>e.classList.contains('active')),"View More did not preserve the 30-day filter");
  assert(await page.$eval('#section-live .desktop-live-table thead',e=>e.textContent.includes('Thời gian phiên LIVE')),"Desktop LIVE time header missing");
  assert(await page.$eval('#section-live .desktop-live-table tbody tr:first-child .live-time-cell',e=>/^\d{2}\/\d{2}\/\d{4} Vào lúc \d{2}:\d{2}-/.test(e.textContent.trim())),"Desktop compact LIVE time range not rendered");
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
  assert(await page.$('#section-live [data-date-calendar="live"]')===null,"Desktop calendar did not collapse after Apply");
  assert(await page.$eval('#section-live [data-range-mode="custom"]',e=>e.classList.contains('active')),"Custom range should remain active after Apply");
  await page.click('#section-live [data-range-mode="custom"]');
  await page.waitForSelector('#section-live [data-date-calendar="live"] [data-calendar-day]');
  await page.click('#section-live [data-apply-range="live"]');
  assert(await page.$('#section-live [data-date-calendar="live"]')===null,"Desktop calendar did not collapse after reopening and applying");
  await page.click('#section-live [data-range-mode="30d"]');

  const desktopRow='#section-live .desktop-live-table tbody tr:nth-child(1)';
  const desktopId=await page.$eval(desktopRow+' [data-save-session]',e=>e.dataset.saveSession);
  await page.select(desktopRow+' select[data-person="host"]','staff-thao-my');
  await page.select(desktopRow+' select[data-person="operator"]','staff-hung-bg');
  await page.click(desktopRow+' [data-save-session]');
  await sleep(150);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForSelector("#app:not(.hidden)",{timeout:30000});
  await page.click('[data-section="live"]');
  await page.click('#section-live [data-range-mode="30d"]');
  const desktopSavedRow='#section-live .desktop-live-table tbody tr:has([data-save-session="'+desktopId+'"])';
  assert(await page.$eval(desktopSavedRow+' select[data-person="host"]',e=>e.value)==='staff-thao-my',"Desktop Host did not persist after reload");
  assert(await page.$eval(desktopSavedRow+' select[data-person="operator"]',e=>e.value)==='staff-hung-bg',"Desktop Operator did not persist after reload");

  await page.click(desktopSavedRow+' [data-manual-kpi]');
  assert(await page.$eval(desktopSavedRow+' select[data-person="host"]',e=>e.value)==='',"Campaign/Mega did not clear desktop Host");
  assert(await page.$eval(desktopSavedRow+' select[data-person="operator"]',e=>e.value)==='',"Campaign/Mega did not clear desktop Operator");
  assert(await page.$eval(desktopSavedRow+' select[data-person="host"]',e=>e.disabled),"Campaign/Mega did not disable desktop Host");
  await page.click(desktopSavedRow+' [data-save-session]');
  await sleep(150);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForSelector("#app:not(.hidden)",{timeout:30000});
  await page.click('[data-section="live"]');
  await page.click('#section-live [data-range-mode="30d"]');
  const desktopManualRow='#section-live .desktop-live-table tbody tr:has([data-save-session="'+desktopId+'"])';
  assert(await page.$eval(desktopManualRow+' [data-manual-kpi]',e=>e.checked),"Campaign/Mega flag did not persist");
  assert(await page.$eval(desktopManualRow+' select[data-person="host"]',e=>e.value)==='',"Campaign/Mega Host was restored unexpectedly");

  assert(await page.$('#nav [data-section="manual-kpi"]')!==null,"Dedicated KPI thủ công nav tab missing");
  await page.click('[data-section="manual-kpi"]');
  await page.click('#section-manual-kpi [data-range-mode="30d"]');
  assert((await page.$$('#section-manual-kpi [data-manual-session]')).length>=1,"Manual KPI session section missing");
  assert(await page.$('#section-kpi [data-manual-session]')===null,"Manual KPI editor must not remain inside KPI nhân sự");
  const manualCard='#section-manual-kpi [data-manual-session]:first-of-type';
  assert(await page.$eval(manualCard,e=>e.textContent.includes('không tự chia GMV tổng')),"Manual KPI no-equal-split notice missing");
  assert(await page.$eval(manualCard,e=>e.textContent.includes('Host Livestream')&&e.textContent.includes('Nhân viên vận hành Livestream')),"Paired Host/Operator labels missing");
  assert(await page.$eval(manualCard,e=>e.textContent.includes('Thêm người')&&!e.textContent.includes('Thêm Host riêng')&&!e.textContent.includes('Thêm Vận hành riêng')),"Manual add control must match v1.18 Thêm người");

  const hostOptions=await page.$$eval(manualCard+' [data-manual-host-person] option',els=>els.map(e=>e.textContent.trim()));
  assert(hostOptions.includes('Thảo My')&&hostOptions.includes('Dung')&&hostOptions.includes('Tâm')&&!hostOptions.includes('Hùng Bắc Giang'),"Host Livestream selector must show Host staff only");
  const operatorOptions=await page.$$eval(manualCard+' [data-manual-operator-person] option',els=>els.map(e=>e.textContent.trim()));
  assert(operatorOptions.includes('Hùng Bắc Giang')&&operatorOptions.includes('Hùng Hiền Hoà')&&!operatorOptions.includes('Dung'),"Operator selector must show Operator staff only");

  await page.select(manualCard+' [data-manual-host-person]','staff-dung');
  await page.select(manualCard+' [data-manual-operator-person]','staff-hung-bg');

  assert(await page.$eval(manualCard,e=>e.textContent.includes('KPI của Host Livestream (0,3%)')),"Host 0.3% KPI label is missing");
  await page.$eval(manualCard+' [data-manual-host-gmv]',e=>{e.value='10000';e.dispatchEvent(new Event('input',{bubbles:true}));});
  assert(await page.$eval(manualCard+' [data-manual-host-gmv]',e=>e.value)==='10.000đ',"Host GMV did not format 10000 as 10.000đ");
  assert(await page.$eval(manualCard+' [data-manual-host-kpi]',e=>e.value)==='30đ',"Host KPI did not auto-calculate 0.3% from Host GMV");
  assert(await page.$eval(manualCard+' [data-manual-host-kpi]',e=>e.readOnly),"Host KPI field must be read-only");
  assert(await page.$eval(manualCard+' [data-manual-operator-kpi]',e=>e.value)==='10đ',"Operator KPI did not auto-calculate 0.1% from Host GMV");
  assert(await page.$eval(manualCard+' [data-manual-operator-kpi]',e=>e.readOnly),"Operator KPI field must be read-only");

  await page.$eval(manualCard+' [data-manual-host-gmv]',e=>{e.value='1234000';e.dispatchEvent(new Event('input',{bubbles:true}));});
  assert(await page.$eval(manualCard+' [data-manual-host-gmv]',e=>e.value)==='1.234.000đ',"Formatted Host GMV is incorrect");
  assert(await page.$eval(manualCard+' [data-manual-host-kpi]',e=>e.value)==='3.702đ',"Host KPI 0.3% is incorrect");
  assert(await page.$eval(manualCard+' [data-manual-operator-kpi]',e=>e.value)==='1.234đ',"Operator KPI 0.1% is incorrect");

  await page.click(manualCard+' [data-manual-add]');
  assert((await page.$$(manualCard+' [data-manual-entry]')).length===2,"Thêm người did not add a new paired Host/Operator block");
  assert((await page.$$(manualCard+' [data-manual-host-person]')).length===2,"New paired block is missing Host selector");
  assert((await page.$$(manualCard+' [data-manual-operator-person]')).length===2,"New paired block is missing Operator selector");
  await page.click(manualCard+' [data-manual-entry]:nth-child(2) [data-manual-remove]');

  await page.click(manualCard+' [data-manual-save]');
  await sleep(150);
  await page.click('[data-section="kpi"]');
  await page.click('#section-kpi [data-range-mode="30d"]');
  assert(await page.$eval('#section-kpi',e=>e.textContent.includes('3.702')),"Host 0.3% KPI was not added to KPI nhân sự");
  assert(await page.$eval('#section-kpi',e=>e.textContent.includes('1.234')),"Operator 0.1% KPI was not added to KPI nhân sự");
  assert(await page.$eval('#section-kpi',e=>e.textContent.includes('1.234.000')),"Manual Host GMV was not added to KPI nhân sự");
  assert(await page.$('#section-kpi [data-manual-save]')===null,"KPI nhân sự must not contain manual KPI save controls");

  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForSelector("#app:not(.hidden)",{timeout:30000});
  await page.click('[data-section="manual-kpi"]');
  await page.click('#section-manual-kpi [data-range-mode="30d"]');
  const savedManualCard='#section-manual-kpi [data-manual-session]:first-of-type';
  assert(await page.$eval(savedManualCard+' [data-manual-host-person]',e=>e.value)==='staff-dung',"Saved Host Livestream did not persist");
  assert(await page.$eval(savedManualCard+' [data-manual-operator-person]',e=>e.value)==='staff-hung-bg',"Saved Operator did not persist");
  assert(await page.$eval(savedManualCard+' [data-manual-host-kpi]',e=>e.value)==='3.702đ',"Computed Host KPI did not persist after reload");
  assert(await page.$eval(savedManualCard+' [data-manual-host-gmv]',e=>e.value)==='1.234.000đ',"Formatted Host GMV did not persist after reload");
  assert(await page.$eval(savedManualCard+' [data-manual-operator-kpi]',e=>e.value)==='1.234đ',"Operator auto KPI did not persist after reload");

  await page.click('[data-section="export"]');
  assert(await page.$eval('#section-export',e=>e.textContent.includes('BO_HO_SO_KPI_KHANGCHOU_'+new Date().getFullYear())),"Khangchou KPI dossier export item missing");
  await page.click('#exportKhangchouDossier');
  await sleep(100);
  assert(await page.$eval('#actionToast',e=>e.textContent.includes('Tính năng đang được phát triển')&&e.classList.contains('show')),"Khangchou dossier placeholder toast missing");

  await page.click('[data-section="storage"]');
  assert((await page.$$('#section-storage .storage-quota-card')).length===3,"Storage page must show GitHub Firebase and Cloudflare cards");
  const providerText=await page.$$eval('#section-storage .storage-provider-copy b',els=>els.map(e=>e.textContent));
  assert(providerText.join('|').includes('GitHub')&&providerText.join('|').includes('Firebase')&&providerText.join('|').includes('Cloudflare'),"Storage provider labels missing");
  await page.click('#nav [data-section="tiktok"]');
  assert(await page.$eval('#section-tiktok .status-dot.ok',e=>getComputedStyle(e,'::before').animationName==='statusDotPulse'),"Active TikTok status dot pulse is not running");
  assert(await page.$eval('#section-tiktok .status-dot.ok',e=>getComputedStyle(e,'::before').animationDuration==='1.45s'),"Active TikTok pulse duration is incorrect");
  await page.click('#nav [data-section="storage"]');
  assert(await page.$eval('#section-storage',e=>e.querySelectorAll('.storage-progress').length===3),"Storage progress bars missing");
  assert(await page.$eval('#section-storage .storage-quota-grid',e=>e.textContent.includes('% / 100%')),"Storage percentage text missing");
  await page.select('#retentionDays','120');
  await page.click('#saveMaintenance');
  await sleep(100);
  await page.click('#nav [data-section="staff"]');
  assert(await page.$eval('#section-staff',e=>e.textContent.includes('độc lập hoàn toàn với tài khoản đăng nhập')),"Staff/account separation notice missing");
  const defaultHostStaff=await page.$eval('#section-staff',e=>[...e.querySelectorAll('[data-staff-row]')].map(x=>x.textContent.trim()));
  assert(defaultHostStaff.some(x=>x.includes('Thảo My')&&x.includes('Host Livestream')),"Default Thảo My Host staff missing");
  assert(defaultHostStaff.some(x=>x.includes('Dung')&&x.includes('Host Livestream')),"Default Dung Host staff missing");
  assert(defaultHostStaff.some(x=>x.includes('Tâm')&&x.includes('Host Livestream')),"Default Tâm Host staff missing");
  assert(defaultHostStaff.some(x=>x.includes('Hùng Bắc Giang')&&x.includes('Nhân viên vận hành Livestream')),"Default Hùng Bắc Giang Operator staff missing");
  assert(defaultHostStaff.some(x=>x.includes('Hùng Hiền Hoà')&&x.includes('Nhân viên vận hành Livestream')),"Default Hùng Hiền Hoà Operator staff missing");

  await page.$eval('#newStaffName',e=>e.value='Host Mới');
  await page.select('#newStaffRole','host');
  await page.click('#addStaffBtn');
  await sleep(80);
  assert(await page.$eval('#section-staff',e=>e.textContent.includes('Host Mới')),"Adding staff failed");
  const hostMoiId=await page.$eval('#section-staff',e=>[...e.querySelectorAll('[data-staff-row]')].find(x=>x.textContent.includes('Host Mới'))?.dataset.staffRow||'');
  assert(hostMoiId.startsWith('staff-'),"New staff ID must be independent from account IDs");
  await page.click('[data-staff-edit="'+hostMoiId+'"]');
  await page.$eval('[data-staff-name="'+hostMoiId+'"]',e=>e.value='Host Mới Sửa');
  await page.click('[data-staff-save="'+hostMoiId+'"]');
  await sleep(80);
  assert(await page.$eval('#section-staff',e=>e.textContent.includes('Host Mới Sửa')),"Editing staff failed");

  await page.click('[data-section="live"]');
  await page.click('#section-live [data-range-mode="30d"]');
  const hostDropdownText=await page.$eval('#section-live',e=>[...e.querySelectorAll('select[data-person="host"] option')].map(x=>x.textContent.trim()));
  assert(hostDropdownText.includes('Thảo My')&&hostDropdownText.includes('Dung')&&hostDropdownText.includes('Tâm')&&hostDropdownText.includes('Host Mới Sửa'),"LIVE Host dropdown is not linked to staff directory");

  await page.click('#nav [data-section="staff"]');
  page.once('dialog',dialog=>dialog.accept());
  await page.click('[data-staff-delete="'+hostMoiId+'"]');
  await sleep(80);
  assert(!(await page.$eval('#section-staff',e=>e.textContent.includes('Host Mới Sửa'))),"Deleting staff failed");

  await page.click('#nav [data-section="users"]');
  assert(await page.$eval('#section-users',e=>e.querySelectorAll('.user-list-avatar').length>=6),"User account avatars are missing from the Users page");
  assert(await page.$('#usersDockBtn')===null,"Users dock still exists");
  const approvedRoles=await page.$$eval('#section-users .approved-user-row .tag',els=>els.map(e=>e.textContent.trim()));
  const roleRank={'Quản trị viên':0,'Nhân viên vận hành livestream':1,'Host Livestream':2};
  assert(approvedRoles[0]==='Quản trị viên',"Approved accounts must start with administrators");
  assert(approvedRoles.every((role,i)=>i===0||(roleRank[approvedRoles[i-1]]??9)<=(roleRank[role]??9)),"Approved accounts are not sorted Admin → Operator → Host");
  assert(await page.$('[data-user-edit="preview-admin"][disabled]')!==null,"Current admin edit button must be locked");
  assert(await page.$('[data-user-delete="preview-admin"][disabled]')!==null,"Current admin delete button must be locked");
  assert(await page.$eval('[data-user-editor="thao-my"]',e=>e.classList.contains('hidden')),"Approved user editor must be hidden by default");

  await page.click('[data-user-edit="thao-my"]');
  assert(!(await page.$eval('[data-user-editor="thao-my"]',e=>e.classList.contains('hidden'))),"Pencil button did not open approved user editor");
  await page.select('[data-approved-role="thao-my"]','operator');
  await page.click('[data-approved-uid="thao-my"][data-approved-perm="kpi.read"]');
  await page.click('[data-user-save="thao-my"]');
  await sleep(100);
  assert(await page.$eval('[data-approved-role="thao-my"]',e=>e.value)==='operator',"Approved user role did not update");
  assert(!(await page.$eval('[data-approved-uid="thao-my"][data-approved-perm="kpi.read"]',e=>e.checked)),"Approved user KPI permission did not update");
  assert(await page.$eval('[data-user-editor="thao-my"]',e=>e.classList.contains('hidden')),"Editor must close after saving");

  page.once('dialog',dialog=>dialog.dismiss());
  await page.click('[data-user-delete="tam"]');
  await sleep(80);
  assert(await page.$('[data-approved-user="tam"]')!==null,"Canceling delete confirmation must keep user");

  page.once('dialog',dialog=>dialog.accept());
  await page.click('[data-user-delete="tam"]');
  await sleep(100);
  assert(await page.$('[data-approved-user="tam"]')===null,"Confirmed delete did not remove user");
  await page.click('[data-section="live"]');
  await page.click('#section-live [data-range-mode="30d"]');
  assert(await page.$eval('#section-live',e=>[...e.querySelectorAll('select[data-person="host"] option')].some(x=>x.textContent.trim()==='Tâm')),"Deleting login account Tâm must not remove staff Tâm from Host dropdown");
  await page.click('#nav [data-section="users"]');

  await page.select('[data-role="pending-01"]','operator');
  await page.click('[data-approve="pending-01"]');
  await sleep(100);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForSelector("#app:not(.hidden)",{timeout:30000});
  await page.click('[data-section="storage"]');
  assert(await page.$eval('#retentionDays',e=>e.value)==='120',"Storage settings did not persist in Preview");
  await page.click('#nav [data-section="users"]');
  assert(await page.$('[data-role="pending-01"]')===null,"Approved Preview user returned to pending after reload");
  assert(await page.$('[data-approved-user="tam"]')===null,"Deleted Preview user returned after reload");
  assert(await page.$eval('[data-approved-role="thao-my"]',e=>e.value)==='operator',"Updated Preview role did not persist after reload");
  assert(!(await page.$eval('[data-approved-uid="thao-my"][data-approved-perm="kpi.read"]',e=>e.checked)),"Updated Preview permission did not persist after reload");

  await page.setViewport({width:900,height:844,deviceScaleFactor:1});
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForSelector("#app:not(.hidden)",{timeout:30000});
  assert(await page.$('#nav .nav-group:nth-child(3) [data-section="users"]')!==null,"Tablet Quản lý tài khoản must stay inside Quản trị");
  assert(await page.$('#nav .nav-group:nth-child(3) [data-section="staff"]')!==null,"Tablet Quản lý nhân sự must stay inside Quản trị");
  assert(await page.$('#usersDockBtn')===null,"Tablet duplicate Users dock must be removed");

  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForSelector("#app:not(.hidden)",{timeout:30000});
  await page.click('#menuToggle');
  await page.waitForFunction(()=>document.querySelector('#sidebar')?.classList.contains('open'));
  await sleep(300);
  const mobileNavGroups=await page.$$eval('#nav .nav-group-title',els=>els.map(e=>e.textContent.trim()));
  assert(mobileNavGroups.join('|')==='Báo cáo|Công cụ|Quản trị',"Mobile sidebar groups are missing");
  assert(await page.$('#nav [data-section="manual-kpi"]')!==null,"Mobile KPI thủ công tab missing");
  assert(await page.$('#nav .nav-group:nth-child(3) [data-section="users"]')!==null,"Mobile Quản lý tài khoản must stay inside Quản trị");
  assert(await page.$('#nav .nav-group:nth-child(3) [data-section="staff"]')!==null,"Mobile Quản lý nhân sự must stay inside Quản trị");
  assert(await page.$('#usersDockBtn')===null,"Mobile duplicate Users dock must be removed");
  await page.click('#userMenuBtn');
  assert(!(await page.$eval('#accountPopover',e=>e.classList.contains('hidden'))),"Mobile account popover did not open");
  assert(await page.$('#accountLogoutBtn')!==null,"Mobile account logout button missing");
  await page.click('#userMenuBtn');
  await page.$eval('#nav [data-section="live"]',e=>e.click());
  await page.waitForFunction(()=>!document.querySelector('#sidebar')?.classList.contains('open'));
  await sleep(320);
  await page.click('#section-live [data-range-mode="30d"]');

  const mobileCard='#section-live .mobile-live-card:nth-child(2)';
  assert(await page.$eval(mobileCard+' .mobile-live-time',e=>/^\d{2}\/\d{2}\/\d{4} Vào lúc \d{2}:\d{2}-/.test(e.textContent.trim())),"Mobile compact LIVE time range not rendered");
  const mobileId=await page.$eval(mobileCard+' [data-save-session]',e=>e.dataset.saveSession);
  await page.select(mobileCard+' select[data-person="host"]','staff-dung');
  await page.select(mobileCard+' select[data-person="operator"]','staff-hung-hh');
  await page.click(mobileCard+' [data-save-session]');
  await sleep(150);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForSelector("#app:not(.hidden)",{timeout:30000});
  await page.click('#menuToggle');
  await page.waitForFunction(()=>document.querySelector('#sidebar')?.classList.contains('open'));
  await sleep(300);
  await page.$eval('#nav [data-section="live"]',e=>e.click());
  await page.waitForFunction(()=>!document.querySelector('#sidebar')?.classList.contains('open'));
  await sleep(320);
  await page.click('#section-live [data-range-mode="30d"]');
  const mobileSavedCard='#section-live .mobile-live-card:has([data-save-session="'+mobileId+'"])';
  assert(await page.$eval(mobileSavedCard+' select[data-person="host"]',e=>e.value)==='staff-dung',"Mobile Host save read the wrong hidden desktop selector");
  assert(await page.$eval(mobileSavedCard+' select[data-person="operator"]',e=>e.value)==='staff-hung-hh',"Mobile Operator save read the wrong hidden desktop selector");

  await page.click(mobileSavedCard+' [data-manual-kpi]');
  assert(await page.$eval(mobileSavedCard+' select[data-person="host"]',e=>e.value)==='',"Mobile Campaign/Mega did not clear Host");
  assert(await page.$eval(mobileSavedCard+' select[data-person="operator"]',e=>e.value)==='',"Mobile Campaign/Mega did not clear Operator");
  await page.click(mobileSavedCard+' [data-save-session]');
  await sleep(100);

  await page.click('#section-live [data-range-mode="custom"]');
  await page.waitForSelector('#section-live [data-date-calendar="live"] [data-calendar-day]');
  assert((await page.$$eval('#section-live [data-calendar-day]',els=>els.length))>=28,"Mobile calendar grid missing");
  await page.click('#section-live [data-apply-range="live"]');
  assert(await page.$('#section-live [data-date-calendar="live"]')===null,"Mobile calendar did not collapse after Apply");

  console.log("Desktop + mobile browser smoke tests passed");
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
