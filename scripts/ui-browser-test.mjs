import fs from "node:fs";
import http from "node:http";
import puppeteer from "puppeteer-core";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const chrome = [
  process.env.CHROME_BIN,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
].find(p => p && fs.existsSync(p));
if (!chrome) throw new Error("Chrome/Chromium executable not found");

const server = http.createServer((req,res)=>{
  if (req.url?.startsWith("/khangbaby-wordmark.png")) { res.writeHead(200,{"content-type":"image/png"}); return res.end(fs.readFileSync(new URL("../public/khangbaby-wordmark.png", import.meta.url))); }
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
  const previewUrl=process.env.UI_TEST_ORIGIN?new URL('/preview',process.env.UI_TEST_ORIGIN).href:'http://127.0.0.1:4173/preview';
  await page.goto(previewUrl,{waitUntil:"domcontentloaded"});
  await page.waitForSelector("#app:not(.hidden)",{timeout:30000});
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>localStorage.clear());
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForSelector("#app:not(.hidden)",{timeout:30000});
  await page.evaluate(()=>document.fonts.ready);

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
  assert(await page.$eval('.side-brand .sidebar-brand-logo',e=>e.getAttribute("alt").includes("KHANG BABY")),"KHANG BABY sidebar logo is missing");
  assert(await page.$eval('.side-brand .sidebar-brand-caption',e=>e.textContent.includes("SellerKBB")),"SellerKBB sidebar caption is missing");
  assert(await page.$eval('html',e=>getComputedStyle(e).getPropertyValue('--accent').trim())==='#e7a3c0',"Pastel pink theme accent is not active");
  assert(await page.$('#sidebar #userAvatar')===null,"Current user must no longer be inside the sidebar");
  assert(await page.$('#topbarAccountBtn #userAvatar')!==null,"Current user avatar must be the topbar trigger");
  assert(await page.$eval('#topbarAccountBtn',e=>e.textContent.trim()===''&&!e.querySelector('.account-chevron')&&!e.querySelector('[data-icon="settings"]')),"Topbar avatar trigger must contain no persistent name/role, arrow or settings icon");
  assert(await page.$eval('#topbarAccountBtn',e=>getComputedStyle(e).borderLeftWidth==='1px'&&getComputedStyle(e.parentElement).borderLeftWidth==='0px'),"Account area must not have the old vertical divider");
  const topbarAccountGeometry=await page.$eval('.topbar',e=>{
    const title=e.querySelector('.topbar-title-wrap').getBoundingClientRect();
    const account=e.querySelector('#topbarAccountBtn').getBoundingClientRect();
    return {titleRight:title.right,accountLeft:account.left,accountRight:account.right,barRight:e.getBoundingClientRect().right};
  });
  assert(topbarAccountGeometry.accountLeft>=topbarAccountGeometry.titleRight,"Avatar must sit to the right of the page title");
  assert(topbarAccountGeometry.barRight-topbarAccountGeometry.accountRight<40,"Avatar must stay at the right edge");
  await page.click('#topbarAccountBtn');
  await page.$eval('#accountPopover', async el => Promise.all(el.getAnimations().map(a => a.finished)));
  assert(!(await page.$eval('#accountModalBackdrop',e=>e.classList.contains('hidden'))),"Account modal did not open from avatar");
  assert(await page.$eval('#accountPopover',e=>e.textContent.includes('Quản trị viên Demo')&&e.textContent.includes('admin@sellerkbb.demo')&&e.textContent.includes('Quản trị viên')&&e.textContent.includes('Đã duyệt')),"Account popup basic information missing");
  assert(await page.$('#accountLogoutBtn')!==null&&await page.$('#accountModalClose')!==null,"Account modal logout/close controls missing");
  const desktopModal=await page.$eval('#accountPopover',e=>{const r=e.getBoundingClientRect();return {cx:r.left+r.width/2,cy:r.top+r.height/2,vw:innerWidth,vh:innerHeight};});
  assert(Math.abs(desktopModal.cx-desktopModal.vw/2)<3&&Math.abs(desktopModal.cy-desktopModal.vh/2)<3,"Desktop account modal must be centered in the viewport");
  await page.click('#accountModalClose');
  assert(await page.$eval('#accountModalBackdrop',e=>e.classList.contains('hidden')),"Account modal did not close");

  await page.click('#nav [data-section="tiktok"]');
  await page.waitForSelector('#section-tiktok [data-readiness-grid]');
  assert((await page.$$eval('#section-tiktok [data-readiness-grid] [data-readiness-item]',els=>els.length))>=5,"Go-live readiness checklist must show Firebase, TikTok, token, scopes and sync");
  assert(await page.$('[data-creator-auth-card]')!==null,"Creator Authorization card missing");
  const creatorPreview=await page.$$eval('#section-tiktok [data-creator-channel]',els=>els.map(e=>({channel:e.getAttribute('data-creator-channel'),text:e.textContent})));
  assert(creatorPreview.length===2&&creatorPreview.some(x=>x.channel==='shopkhangbaby')&&creatorPreview.some(x=>x.channel==='mekhangsua'),"Creator Authorization must show exactly the two SellerKBB channels");
  assert(creatorPreview.every(x=>x.text.includes('Đã kết nối')&&x.text.includes('Access Token + Refresh Token riêng')&&x.text.includes('Refresh Token:')&&x.text.includes('Có · tự gia hạn')),"Creator preview Refresh Token status/safety copy missing");
  assert((await page.$$('[data-connect-creator]')).length===2,"Creator connect/re-authorize controls missing");
  assert((await page.$$('[data-refresh-creator]')).length===2,"Creator manual Refresh Token controls missing");
  await page.click('[data-refresh-creator="shopkhangbaby"]');
  assert(await page.$eval('#actionToast',e=>e.textContent.includes('Refresh Token')&&e.textContent.includes('shopkhangbaby')),"Creator preview manual Refresh Token flow missing");
  await page.click('[data-connect-creator="shopkhangbaby"]');
  assert(await page.$eval('#actionToast',e=>e.textContent.includes('shopkhangbaby')&&e.textContent.includes('mô phỏng kết nối')),"Creator preview connect interaction missing");
  assert(await page.$('#previewSyncNow')!==null,"Preview Sync-now button missing");
  await page.click('#previewSyncNow');
  await sleep(750);
  assert(await page.$eval('#actionToast',e=>e.textContent.includes('đồng bộ 30 ngày thành công')),"Preview Sync-now flow missing success toast");
  await page.click('#nav [data-section="storage"]');
  assert(await page.$('#downloadBusinessBackup')!==null,"Business backup JSON button missing");
  assert(await page.$('[data-business-backup-card]')!==null,"Business backup card missing");
  await page.click('#nav [data-section="dashboard"]');

  assert(await page.$('#dataRefreshBtn')!==null,"Latest-data refresh button missing beside user avatar");
  assert(await page.$eval('#dataRefreshBtn',e=>e.checkVisibility()&&(e.textContent.includes('Cập nhật dữ liệu')||e.textContent.includes('Đã cập nhật'))),"Dashboard update button must be visible");
  const refreshGeometry=await page.$eval('.topbar',e=>{
    const refresh=e.querySelector('#dataRefreshBtn').getBoundingClientRect();
    const account=e.querySelector('#topbarAccountBtn').getBoundingClientRect();
    return {refreshRight:refresh.right,accountLeft:account.left};
  });
  assert(refreshGeometry.refreshRight<=refreshGeometry.accountLeft,"Latest-data button must sit directly before the user avatar without overlap");
  const toastBeforeRefresh=await page.$eval('#actionToast',e=>e.textContent);
  await page.click('#dataRefreshBtn');
  await sleep(70);
  assert(await page.$eval('#dataRefreshBtn',e=>e.disabled&&e.getAttribute('aria-busy')==='true'&&e.textContent.includes('Đang đồng bộ')&&e.textContent.includes('30 ngày')),"Dashboard refresh must launch the same 30-day sync job and prevent double clicks");
  await sleep(850);
  assert(await page.$eval('#dataRefreshBtn',e=>e.classList.contains('is-success')&&e.textContent.includes('Đã cập nhật')),"Dashboard must report success after 30-day sync completes");
  assert((await page.$eval('#actionToast',e=>e.textContent))===toastBeforeRefresh,"Latest-data refresh must not show a toast notification");
  assert(await page.$('#dataRefreshModalBackdrop')===null&&await page.$('#dataRefreshPopover')===null,"Latest-data popup/modal must stay removed after refresh");

  assert(await page.$('#section-dashboard .sync-status')===null,"Desktop Dashboard must hide redundant TikTok sync timestamp");
  assert(await page.$eval('#section-dashboard',e=>!e.textContent.includes('Dữ liệu Tiktok được đồng bộ lúc:')),"Desktop Dashboard sync timestamp text must be absent");
  assert(await page.$eval('#section-dashboard [data-range-mode="today"]',e=>e.classList.contains('active')),"Dashboard must default to Today");
  await page.click('#section-dashboard [data-range-mode="7d"]');
  assert(await page.$eval('#section-dashboard [data-range-mode="7d"]',e=>e.classList.contains('active')),"7-day filter did not activate");
  await page.click('#section-dashboard [data-range-mode="30d"]');
  assert(await page.$eval('#section-dashboard [data-range-mode="30d"]',e=>e.classList.contains('active')),"30-day filter did not activate");
  assert(await page.$eval('#section-dashboard .dashboard-range-note',e=>e.textContent.includes('chỉ hiển thị 7 ngày gần nhất')),"Monthly Dashboard 7-day preview note missing");
  assert(await page.$('[data-dashboard-final-gmv]')!==null,"Dashboard finalized GMV summary missing");
  const dashboardFinalGmv=await page.$eval('[data-dashboard-final-gmv]',e=>({
    text:e.textContent.trim(),
    amount:e.querySelector('.dashboard-final-gmv-copy>strong')?.textContent.trim()||'',
    width:e.getBoundingClientRect().width,
    parentWidth:e.parentElement?.getBoundingClientRect().width||0
  }));
  assert(dashboardFinalGmv.text.includes('GMV sau khi hoàn hủy')&&dashboardFinalGmv.text.includes('Đã chốt'),"Dashboard finalized GMV copy missing");
  assert(dashboardFinalGmv.amount.endsWith('đ'),"Dashboard finalized GMV must display currency");
  assert(dashboardFinalGmv.width<=dashboardFinalGmv.parentWidth+1,"Dashboard finalized GMV card must not overflow layout");
  assert(await page.$('#section-dashboard .live-row-reconciled')!==null,"Desktop Dashboard must mark at least one finalized LIVE row");
  const desktopFinalizedStyle=await page.$eval('#section-dashboard .live-row-reconciled',e=>{
    const td=e.querySelector('td');
    const badge=e.querySelector('.live-reconciled-badge');
    return {text:e.textContent,cellBg:getComputedStyle(td).backgroundColor,badgeColor:getComputedStyle(badge).color,badgeBg:getComputedStyle(badge).backgroundColor};
  });
  assert(desktopFinalizedStyle.text.includes('✓ Đã đối soát'),"Desktop finalized LIVE row must show green reconciliation check");
  assert(desktopFinalizedStyle.badgeColor!=='rgb(149, 76, 112)',"Desktop finalized LIVE badge must not use the pink status color");
  assert(await page.$('#dashboardViewMore')!==null,"Monthly Dashboard View More button missing");
  await page.click('#dashboardViewMore');
  assert(await page.$eval('#section-live',e=>e.classList.contains('active')),"View More did not switch to LIVE section");
  assert(await page.$eval('#section-live [data-range-mode="30d"]',e=>e.classList.contains('active')),"View More did not preserve the 30-day filter");
  assert(await page.$eval('#section-live .desktop-live-table thead',e=>e.textContent.includes('Thời gian phiên LIVE')),"Desktop LIVE time header missing");
  assert(await page.$eval('#section-live .affiliate-live-summary',e=>e.textContent.includes('GMV LIVE tổng')&&e.textContent.includes('GMV từ shopkhangbaby')&&e.textContent.includes('GMV Affiliate')&&!e.textContent.includes('Hoa hồng Affiliate')),"Affiliate LIVE summary must show GMV only");
  assert(await page.$eval('#section-live .desktop-live-table thead',e=>e.textContent.includes('GMV LIVE tổng')&&e.textContent.includes('GMV từ shopkhangbaby')&&e.textContent.includes('GMV Affiliate')&&!e.textContent.includes('Hoa hồng Affiliate')),"Desktop Affiliate LIVE columns must hide commission");
  const affiliateDesktopRow=await page.$eval('#section-live .desktop-live-table tbody tr:first-child',e=>e.textContent);
  assert(affiliateDesktopRow.includes('món Affiliate')&&!affiliateDesktopRow.includes('Hoa hồng Affiliate')&&!affiliateDesktopRow.includes('Không cộng GMV/KPI'),"Desktop Affiliate row must keep GMV details only");
  assert(await page.$eval('#section-live .desktop-live-table tbody tr:first-child .live-time-cell',e=>/^\d{2}\/\d{2}\/\d{4} Vào lúc \d{2}:\d{2}-/.test(e.textContent.trim())),"Desktop compact LIVE time range not rendered");
  assert(!(await page.$eval('#section-live',e=>e.textContent.includes('01/01/1970'))),"LIVE UI must never render Unix epoch as a session end time");
  await page.$eval('#section-live [data-range-mode="custom"]',e=>e.click());
  await page.waitForFunction(()=>document.querySelector('#section-live [data-range-mode="custom"]')?.classList.contains('active')&&document.querySelector('#section-live [data-date-calendar="live"] [data-calendar-day]'));
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
  await page.$eval('#section-live [data-range-mode="custom"]',e=>e.click());
  await page.waitForFunction(()=>document.querySelector('#section-live [data-range-mode="custom"]')?.classList.contains('active')&&document.querySelector('#section-live [data-date-calendar="live"] [data-calendar-day]'));
  await page.click('#section-live [data-apply-range="live"]');
  assert(await page.$('#section-live [data-date-calendar="live"]')===null,"Desktop calendar did not collapse after reopening and applying");
  await page.click('#section-live [data-range-mode="30d"]');

  assert(await page.$('#nav [data-section="reconcile"]')!==null,"Đối soát đơn LIVE nav tab missing");
  await page.click('#nav [data-section="reconcile"]');
  await page.click('#section-reconcile [data-range-mode="30d"]');
  const reconcileCount=(await page.$$('#section-reconcile .reconcile-session')).length;
  assert(reconcileCount>=1,"LIVE reconciliation session cards missing");
  const reconcileCard='#section-reconcile .reconcile-session:first-of-type';
  const desktopOpenButton=reconcileCard+' [data-reconcile-open]';
  await page.click(desktopOpenButton);
  await page.$eval('#reconcileModal', async el => Promise.all(el.getAnimations().map(a => a.finished)));
  await page.waitForSelector('#reconcileModalBackdrop:not(.hidden) #reconcileModalBody .reconcile-overview');
  assert(await page.$eval(desktopOpenButton,e=>e.classList.contains('hidden')),"Xem đơn must hide while its popup is open");
  assert(await page.$eval('body',e=>e.classList.contains('reconcile-modal-open')),"Reconciliation popup must lock background scroll");
  assert((await page.$$('#reconcileModalBody .reconcile-order-card')).length>=8,"LIVE reconciliation order cards missing in popup");
  assert(await page.$eval('#reconcileModalBody',e=>e.textContent.includes('Chờ đóng hàng')&&e.textContent.includes('Chờ vận chuyển')&&e.textContent.includes('Đang vận chuyển')&&e.textContent.includes('Đang giao')),"Shipping-state chips missing");
  assert(await page.$eval('#reconcileModalBody',e=>e.textContent.includes('Đang hoàn / trả')&&e.textContent.includes('Đã hoàn tiền')&&e.textContent.includes('Đã hủy')&&e.textContent.includes('Hoàn tất')),"Aftersale/final-state chips missing");
  assert(await page.$eval('#reconcileModalBody',e=>e.textContent.includes('Có tín hiệu LIVE')&&e.textContent.includes('1 kênh nội bộ LIVE')),"LIVE attribution confidence labels missing");
  assert(await page.$eval('#reconcileModalBody',e=>e.textContent.includes('Bảo vệ đối soát 60 ngày')&&e.textContent.includes('15 ngày')&&e.textContent.includes('6 ngày')),"Reconciliation retention/return-window explanation missing");
  assert(await page.$eval('#reconcileModalBody',e=>e.textContent.includes('GMV LIVE tổng')&&e.textContent.includes('GMV từ shopkhangbaby')&&e.textContent.includes('GMV Affiliate')&&!e.textContent.includes('Hoa hồng Affiliate')&&e.textContent.includes('GMV chờ đối soát')&&e.textContent.includes('Đơn hủy từ Livestream')&&e.textContent.includes('GMV sau khi hoàn hủy')&&e.textContent.includes('KPI tự động:')),"Reconciliation popup must show Affiliate GMV without commission");
  assert(await page.$eval('#reconcileModalBody',e=>e.textContent.includes('Quy tắc Affiliate:')&&e.textContent.includes('GMV sản phẩm Affiliate vẫn được cộng vào GMV phiên và cơ sở tính KPI')),"Reconciliation popup Affiliate KPI rule missing");
  const noticeGapDesktop=await page.$eval('#reconcileModalBody [data-reconcile-notices]',e=>{
    const [first,second]=e.querySelectorAll('.notice');
    return {count:e.querySelectorAll('.notice').length,gap:second.getBoundingClientRect().top-first.getBoundingClientRect().bottom};
  });
  assert(noticeGapDesktop.count===2&&noticeGapDesktop.gap>=11,"Desktop Affiliate rule and KPI warning must be separated by visible spacing");
  assert(await page.$eval('#reconcileModalBody',e=>e.textContent.includes('KPI tạm tính')&&e.textContent.includes('Có tín hiệu LIVE · tính KPI')),"Reconciliation attribution must show confirmed/provisional KPI inclusion");
  const returnFilter=[...await page.$$('#reconcileModalBody [data-reconcile-filter]')];
  assert(returnFilter.length>=8,"Reconciliation filter chips missing");
  await page.$$eval('#reconcileModalBody [data-reconcile-filter]',els=>els.find(e=>e.textContent.includes('Đang hoàn'))?.click());
  await sleep(80);
  const visibleReturnCards=await page.$$eval('#reconcileModalBody .reconcile-order-card',els=>els.filter(e=>!e.hidden).map(e=>e.dataset.orderState));
  assert(visibleReturnCards.length===1&&visibleReturnCards[0]==='returning',"Reconciliation status filtering failed");
  await page.waitForFunction(()=>!document.querySelector('#reconcileModalRefresh')?.disabled);
  assert(await page.$eval('#reconcileModalRefresh',e=>e.querySelector('.ui-icon')!==null&&e.textContent.includes('Làm mới')),"Reconciliation refresh button must use the standard refresh SVG icon");
  await page.click('#reconcileModalRefresh');
  await page.waitForFunction(()=>document.querySelector('#reconcileModalRefresh')?.disabled===true);
  const reconcileRefreshBusy=await page.$eval('#reconcileModalRefresh',e=>{
    const icon=e.querySelector('.ui-icon');
    const cs=icon?getComputedStyle(icon):null;
    return {
      spinning:e.classList.contains('is-refreshing'),
      busy:e.getAttribute('aria-busy'),
      text:e.textContent.trim(),
      animationName:cs?.animationName||'',
      animationDuration:cs?.animationDuration||''
    };
  });
  assert(reconcileRefreshBusy.spinning&&reconcileRefreshBusy.busy==='true',"Reconciliation refresh must expose a busy spinning state");
  assert(reconcileRefreshBusy.text.includes('Đang tải'),"Reconciliation refresh must show loading text while spinning");
  assert(reconcileRefreshBusy.animationName==='sync-spin'&&reconcileRefreshBusy.animationDuration==='0.75s',"Reconciliation refresh icon must spin like the dashboard sync icon");
  await page.waitForFunction(()=>!document.querySelector('#reconcileModalRefresh')?.disabled);
  assert(await page.$eval('#reconcileModalRefresh',e=>!e.classList.contains('is-refreshing')&&!e.hasAttribute('aria-busy')&&e.textContent.includes('Làm mới')),"Reconciliation refresh must restore its idle state");
  assert(await page.$('#reconcileModalBody .reconcile-overview')!==null,"Reconciliation refresh must keep popup content");
  await page.click('#reconcileModalClose');
  await page.waitForFunction(()=>document.querySelector('#reconcileModalBackdrop')?.classList.contains('hidden'));
  assert(!(await page.$eval('body',e=>e.classList.contains('reconcile-modal-open'))),"Closing reconciliation popup must unlock background scroll");
  assert(!(await page.$eval(desktopOpenButton,e=>e.classList.contains('hidden'))),"Xem đơn must reappear after popup closes");
  await page.click('#nav [data-section="live"]');
  await page.click('#section-live [data-range-mode="30d"]');

  const desktopRow='#section-live .desktop-live-table tbody tr:nth-child(1)';
  const desktopId=await page.$eval(desktopRow+' [data-save-session]',e=>e.dataset.saveSession);
  if(await page.$(desktopRow+' [data-edit-assignment]')) await page.click(desktopRow+' [data-edit-assignment]');
  await page.select(desktopRow+' select[data-person="host"]','staff-thao-my');
  await page.select(desktopRow+' select[data-person="operator"]','staff-hung-bg');
  await page.click(desktopRow+' [data-save-session]');
  await sleep(150);
  const assertAssignmentCollapsed=async(scope,host,operator)=>{
    assert(await page.$$eval(scope+' [data-person]',els=>els.length===2&&els.every(e=>!e.checkVisibility())),"Saved Host/Operator dropdowns must both be hidden");
    assert(await page.$$eval(scope+' [data-assignment-summary]',els=>els.length>0&&els.every(e=>e.checkVisibility())),"Saved assignment summary must be visible");
    const names=await page.$$eval(scope+' [data-assignment-summary]',els=>els.map(e=>e.textContent).join(' '));
    assert(names.includes(host)&&names.includes(operator),"Saved assignment summary must show both selected names");
    assert(await page.$eval(scope+' [data-edit-assignment]',e=>e.checkVisibility()),"Saved assignment must expose Sửa");
    assert(await page.$eval(scope+' [data-save-session]',e=>!e.checkVisibility()),"Saved assignment must hide Lưu until Sửa is clicked");
  };
  await assertAssignmentCollapsed(desktopRow,'Thảo My','Hùng Bắc Giang');
  await page.click(desktopRow+' [data-edit-assignment]');
  assert(await page.$$eval(desktopRow+' [data-person]',els=>els.every(e=>e.checkVisibility())),"Desktop Sửa must open both dropdowns");
  assert(await page.$$eval(desktopRow+' [data-assignment-summary]',els=>els.every(e=>!e.checkVisibility())),"Desktop Sửa must hide all summary parts");
  assert(await page.$eval(desktopRow+' [data-save-session]',e=>e.checkVisibility()),"Desktop Sửa must show Lưu");
  const untouchedMobile='#section-live .mobile-live-card[data-live-session="'+desktopId+'"]';
  assert(await page.$eval(untouchedMobile+' [data-assignment-editor]',e=>e.classList.contains('hidden')),"Desktop edit must not open the hidden mobile form");
  await page.select(desktopRow+' select[data-person="host"]','staff-dung');
  await page.select(desktopRow+' select[data-person="operator"]','staff-hung-hh');
  await page.click(desktopRow+' [data-save-session]');
  await assertAssignmentCollapsed(desktopRow,'Dung','Hùng Hiền Hoà');
  // A partially assigned session stays editable, as on mobile.
  await page.click(desktopRow+' [data-edit-assignment]');
  await page.select(desktopRow+' select[data-person="operator"]','');
  await page.click(desktopRow+' [data-save-session]');
  assert(await page.$$eval(desktopRow+' [data-person]',els=>els.every(e=>e.checkVisibility())),"Incomplete assignments must stay editable");
  await page.select(desktopRow+' select[data-person="host"]','staff-thao-my');
  await page.select(desktopRow+' select[data-person="operator"]','staff-hung-bg');
  await page.click(desktopRow+' [data-save-session]');
  for(const width of [1024,1440]){
    await page.setViewport({width,height:1000,deviceScaleFactor:1});
    await assertAssignmentCollapsed(desktopRow,'Thảo My','Hùng Bắc Giang');
  }
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForSelector("#app:not(.hidden)",{timeout:30000});
  await page.click('[data-section="live"]');
  await page.click('#section-live [data-range-mode="30d"]');
  const desktopSavedRow='#section-live .desktop-live-table tbody tr:has([data-save-session="'+desktopId+'"])';
  await assertAssignmentCollapsed(desktopSavedRow,'Thảo My','Hùng Bắc Giang');
  assert(await page.$eval(desktopSavedRow+' select[data-person="host"]',e=>e.value)==='staff-thao-my',"Desktop Host did not persist after reload");
  assert(await page.$eval(desktopSavedRow+' select[data-person="operator"]',e=>e.value)==='staff-hung-bg',"Desktop Operator did not persist after reload");
  const autoKpiBasis=await page.$eval(desktopSavedRow,e=>{
    const status=e.querySelector('.kpi-state-line')?.textContent.trim()||'';
    const gmv=Number((status.split('·')[1]||'').replace(/[^0-9]/g,'')||0);
    const grossCells=[...e.querySelectorAll('td.money')].map(x=>Number(x.textContent.replace(/[^0-9]/g,'')||0));
    return {status,gmv,gross:grossCells[0]||0};
  });
  assert(autoKpiBasis.status.includes('Đã chốt')&&autoKpiBasis.gmv>0,"Preview auto session must expose a finalized reconciled KPI basis");
  assert(autoKpiBasis.gmv!==autoKpiBasis.gross,"Automatic KPI basis must differ from gross LIVE GMV in Preview");
  await page.click('#nav [data-section="kpi"]');
  assert(await page.$('#section-kpi [data-kpi-month-select]')!==null,"KPI month selector missing");
  assert((await page.$$('#section-kpi [data-range-mode]')).length===0,"KPI page must not show Today/7-day/30-day filters");
  const kpiMonthValue=await page.$eval('#section-kpi [data-kpi-month-select]',e=>e.value);
  assert(/^\d{4}-\d{2}$/.test(kpiMonthValue),"KPI month selector value invalid");
  assert(await page.$eval('#section-kpi .data-note',e=>e.textContent.includes('KPI nhân sự được tổng hợp theo tháng')&&e.textContent.includes('hệ thống tự tính toàn bộ phiên trong tháng đã chọn')&&!/01\/\d{2}\/\d{4}/.test(e.textContent)),"KPI monthly explanation must not repeat explicit start/end dates");
  assert(await page.$('#section-kpi .range-summary')===null,"KPI month filter must not show the 01/MM/YYYY – DD/MM/YYYY summary");
  const kpiMonthStyle=await page.$eval('#section-kpi .kpi-month-select-shell',e=>{
    const select=e.querySelector('[data-kpi-month-select]');
    const shell=getComputedStyle(e),selectStyle=getComputedStyle(select);
    return {radius:shell.borderRadius,background:shell.backgroundImage,appearance:selectStyle.appearance,height:e.getBoundingClientRect().height};
  });
  assert(kpiMonthStyle.height>=40&&kpiMonthStyle.radius!=='0px'&&kpiMonthStyle.background!=='none'&&kpiMonthStyle.appearance==='none',"KPI month selector must use custom pastel styling instead of browser default");
  assert(await page.$eval('#section-kpi .kpi-rate-guide',e=>e.textContent.includes('KPI tự động dùng đối soát theo từng phiên')&&e.textContent.includes('2 kênh chồng giờ')&&e.textContent.includes('tránh cộng trùng')),"KPI guide must explain overlap-safe reconciliation");
  assert(await page.$eval('#section-kpi',e=>e.textContent.includes('KPI đã chốt')&&e.textContent.includes('KPI tạm tính')&&e.textContent.includes('KPI dự kiến')&&e.textContent.includes('Chờ đối soát')),"KPI final/provisional/waiting summary labels missing");
  assert(await page.$('[data-kpi-table="pending"]')!==null&&await page.$('[data-kpi-table="final"]')!==null,"KPI page must split pending and finalized data into two tables");
  assert(await page.$eval('[data-kpi-table="pending"]',e=>e.textContent.includes('KPI chưa chốt')&&e.textContent.includes('GMV chờ đối soát')&&e.textContent.includes('KPI tạm tính')),"Pending KPI table labels missing");
  assert(await page.$eval('[data-kpi-table="final"]',e=>e.textContent.includes('KPI đã chốt')&&e.textContent.includes('GMV tự động đã chốt')&&e.textContent.includes('GMV thủ công')&&e.textContent.includes('Tổng KPI đã chốt')),"Final KPI table labels missing");
  const autoKpiRows=await page.$$eval('[data-kpi-table="final"] tbody tr',rows=>rows.map(row=>{
    const cells=[...row.querySelectorAll('td')].map(x=>x.textContent.trim());
    return {name:cells[0]||'',finalKpi:Number((cells[6]||'').replace(/[^0-9]/g,'')||0)};
  }));
  const hostAuto=autoKpiRows.find(x=>x.name.includes('Thảo My'));
  const operatorAuto=autoKpiRows.find(x=>x.name.includes('Hùng Bắc Giang'));
  assert(hostAuto?.finalKpi===Math.round(autoKpiBasis.gmv*.003),"Host automatic KPI must use reconciled GMV at 0.3%");
  assert(operatorAuto?.finalKpi===Math.round(autoKpiBasis.gmv*.001),"Operator automatic KPI must use reconciled GMV at 0.1%");
  await page.click('#nav [data-section="live"]');
  await page.click('#section-live [data-range-mode="30d"]');

  await page.click(desktopSavedRow+' [data-manual-kpi]');
  assert(await page.$eval(desktopSavedRow+' [data-auto-person-wrap]',e=>getComputedStyle(e).display==='none'),"Desktop Host/Operator fields must hide in manual KPI mode");
  assert(await page.$eval(desktopSavedRow+' select[data-person="host"]',e=>e.value)==='',"Campaign/Mega did not clear desktop Host");
  assert(await page.$eval(desktopSavedRow+' select[data-person="operator"]',e=>e.value)==='',"Campaign/Mega did not clear desktop Operator");
  assert(await page.$eval(desktopSavedRow+' select[data-person="host"]',e=>e.disabled),"Campaign/Mega did not disable desktop Host");
  assert(!(await page.$eval(desktopSavedRow+' [data-manual-type-wrap]',e=>e.classList.contains('hidden'))),"Campaign/Mega type selector must appear after enabling manual KPI");
  const manualTypeOptions=await page.$eval(desktopSavedRow+' [data-manual-type]',e=>[...e.options].map(o=>o.textContent.trim()));
  assert(manualTypeOptions.includes('Ngày Campaign')&&manualTypeOptions.includes('Mega Live'),"Campaign/Mega type options missing");
  await page.click(desktopSavedRow+' [data-save-session]');
  await sleep(80);
  assert(await page.$eval('#actionToast',e=>e.textContent.includes('Hãy chọn loại phiên: Ngày Campaign hoặc Mega Live')),"Manual KPI must require Campaign or Mega Live classification");
  await page.select(desktopSavedRow+' [data-manual-type]','mega');
  await page.click(desktopSavedRow+' [data-save-session]');
  await sleep(150);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForSelector("#app:not(.hidden)",{timeout:30000});
  await page.click('[data-section="live"]');
  await page.click('#section-live [data-range-mode="30d"]');
  const desktopManualRow='#section-live .desktop-live-table tbody tr:has([data-save-session="'+desktopId+'"])';
  assert(await page.$eval(desktopManualRow+' [data-manual-kpi]',e=>e.checked),"Campaign/Mega flag did not persist");
  assert(await page.$eval(desktopManualRow+' [data-manual-type]',e=>e.value)==='mega',"Mega Live classification did not persist");
  assert(await page.$eval(desktopManualRow+' [data-manual-type-summary]',e=>getComputedStyle(e).display!=='none'&&e.textContent.includes('Mega Live')&&e.textContent.includes('Sửa')),"Saved Mega Live type must collapse into a summary");
  assert(await page.$eval(desktopManualRow+' [data-manual-type-wrap]',e=>e.classList.contains('hidden')||getComputedStyle(e).display==='none'),"Saved Mega Live selector must stay hidden");
  assert(await page.$eval(desktopManualRow+' [data-save-session]',e=>e.classList.contains('hidden')||getComputedStyle(e).display==='none'),"Saved manual type must hide the LIVE save button");
  await page.click(desktopManualRow+' [data-edit-manual-type]');
  assert(await page.$eval(desktopManualRow+' [data-manual-type-wrap]',e=>!e.classList.contains('hidden')&&getComputedStyle(e).display!=='none'),"Sửa manual type must reopen Campaign/Mega selector");
  assert(await page.$eval(desktopManualRow+' [data-save-session]',e=>!e.classList.contains('hidden')&&getComputedStyle(e).display!=='none'),"Sửa manual type must restore the LIVE save button");
  assert(await page.$eval(desktopManualRow+' [data-auto-person-wrap]',e=>getComputedStyle(e).display==='none'),"Persisted manual desktop row must keep Host/Operator hidden");
  assert(await page.$eval(desktopManualRow,e=>e.textContent.includes('Mega Live · tính thủ công')),"Saved Mega Live badge missing on LIVE row");
  assert(await page.$eval(desktopManualRow+' select[data-person="host"]',e=>e.value)==='',"Campaign/Mega Host was restored unexpectedly");

  assert(await page.$('#nav [data-section="manual-kpi"]')!==null,"Dedicated KPI thủ công nav tab missing");
  await page.click('[data-section="manual-kpi"]');
  await page.click('#section-manual-kpi [data-range-mode="30d"]');
  assert((await page.$$('#section-manual-kpi [data-manual-session]')).length>=1,"Manual KPI session section missing");
  assert(await page.$('#section-kpi [data-manual-session]')===null,"Manual KPI editor must not remain inside KPI nhân sự");
  const manualCard='#section-manual-kpi [data-manual-session]:first-of-type';
  const manualSessionId=await page.$eval(manualCard,e=>e.dataset.manualSession);
  assert(await page.$eval(manualCard,e=>e.textContent.includes('Mega Live')),"Manual KPI card must show saved Mega Live classification");
  assert(await page.$eval(manualCard,e=>e.classList.contains('reconciled')&&e.textContent.includes('✓ Đã đối soát')),"Finalized manual KPI session must use green reconciled styling/badge");
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
  assert(await page.$eval(manualCard+' [data-manual-host-gmv]',e=>e.value)==='10.000',"Host GMV did not format 10000 as 10.000");
  assert(await page.$eval(manualCard+' .manual-money-input-suffix',e=>e.textContent.trim())==='đ',"Host GMV currency suffix must stay outside the editable value");
  assert(await page.$eval(manualCard+' [data-manual-host-kpi]',e=>e.textContent.trim())==='30đ',"Host KPI did not auto-calculate 0.3% from Host GMV");
  assert(await page.$eval(manualCard+' [data-manual-host-kpi]',e=>e.tagName==='DIV'&&getComputedStyle(e).pointerEvents==='none'&&e.tabIndex===-1),"Host KPI must be a non-interactive static output");
  assert(await page.$eval(manualCard+' [data-manual-operator-kpi]',e=>e.textContent.trim())==='10đ',"Operator KPI did not auto-calculate 0.1% from Host GMV");
  assert(await page.$eval(manualCard+' [data-manual-operator-kpi]',e=>e.tagName==='DIV'&&getComputedStyle(e).pointerEvents==='none'&&e.tabIndex===-1),"Operator KPI must be a non-interactive static output");

  await page.$eval(manualCard+' [data-manual-host-gmv]',e=>{e.value='1234000';e.dispatchEvent(new Event('input',{bubbles:true}));});
  assert(await page.$eval(manualCard+' [data-manual-host-gmv]',e=>e.value)==='1.234.000',"Formatted Host GMV is incorrect");
  await page.click(manualCard+' [data-manual-host-gmv]');
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  assert(await page.$eval(manualCard+' [data-manual-host-gmv]',e=>e.value)==='123.400',"Backspace at the end must delete a digit while preserving number formatting");
  assert(await page.$eval(manualCard+' .manual-money-input-suffix',e=>e.textContent.trim())==='đ',"Backspace must never delete the fixed currency suffix");
  await page.$eval(manualCard+' [data-manual-host-gmv]',e=>{e.value='1234000';e.dispatchEvent(new Event('input',{bubbles:true}));});
  assert(await page.$eval(manualCard+' [data-manual-host-kpi]',e=>e.textContent.trim())==='3.702đ',"Host KPI 0.3% is incorrect");
  assert(await page.$eval(manualCard+' [data-manual-operator-kpi]',e=>e.textContent.trim())==='1.234đ',"Operator KPI 0.1% is incorrect");
  assert(await page.$eval(manualCard+' [data-manual-validation-status]',e=>['under','matched'].includes(e.dataset.manualValidationStatus)),"Valid manual GMV should be under or matched against finalized GMV");

  await page.$eval(manualCard+' [data-manual-host-gmv]',e=>{e.value='999999999999';e.dispatchEvent(new Event('input',{bubbles:true}));});
  assert(await page.$eval(manualCard+' [data-manual-validation-status]',e=>e.dataset.manualValidationStatus)==='excess',"Manual GMV over-allocation warning missing");
  await page.click(manualCard+' [data-manual-save]');
  await sleep(100);
  assert(await page.$eval('#actionToast',e=>e.textContent.includes('Không thể lưu')&&e.textContent.includes('vượt GMV sau khi hoàn hủy')),"Manual excess GMV must be blocked with a clear toast");
  await page.$eval(manualCard+' [data-manual-host-gmv]',e=>{e.value='1234000';e.dispatchEvent(new Event('input',{bubbles:true}));});
  assert(await page.$eval(manualCard+' [data-manual-validation-status]',e=>e.dataset.manualValidationStatus)==='under',"Manual under-allocation should show warning but remain savable");

  await page.click(manualCard+' [data-manual-add]');
  assert((await page.$$(manualCard+' [data-manual-entry]')).length===2,"Thêm người did not add a new paired Host/Operator block");
  assert((await page.$$(manualCard+' [data-manual-host-person]')).length===2,"New paired block is missing Host selector");
  assert((await page.$$(manualCard+' [data-manual-operator-person]')).length===2,"New paired block is missing Operator selector");
  assert(await page.$eval(manualCard+' [data-manual-entry]:nth-child(2) .manual-entry-footer',e=>e.textContent.includes('Xóa người')),"Delete control must be placed in the row footer with a clear label");
  await page.click(manualCard+' [data-manual-entry]:nth-child(2) [data-manual-remove]');

  await page.click(manualCard+' [data-manual-save]');
  await sleep(150);
  assert(await page.$eval(manualCard+' [data-manual-kpi-session-summary]',e=>getComputedStyle(e).display!=='none'&&e.textContent.includes('KPI thủ công đã lưu')&&e.textContent.includes('Sửa KPI')),"Saved manual KPI session must collapse into a compact summary");
  assert(await page.$eval(manualCard+' [data-manual-kpi-session-editor]',e=>e.classList.contains('hidden')||getComputedStyle(e).display==='none'),"Saved manual KPI editor must hide after save");
  await page.click(manualCard+' [data-manual-kpi-edit]');
  assert(await page.$eval(manualCard+' [data-manual-kpi-session-editor]',e=>!e.classList.contains('hidden')&&getComputedStyle(e).display!=='none'),"Sửa KPI must reopen the manual KPI editor");
  await page.click('[data-section="kpi"]');
  assert(await page.$eval('#section-kpi .kpi-rate-guide',e=>e.textContent.includes('Cách tính KPI')&&e.textContent.includes('Host Livestream = 0,3%')&&e.textContent.includes('Nhân viên vận hành Livestream = 0,1%')),"KPI rate explanation guide missing");
  assert(await page.$('#section-kpi .range-actions .pill')===null,"Old KPI rate pills must not remain in the time filter");
  await page.select('#section-kpi [data-kpi-month-select]','2026-10');
  assert(await page.$eval('#section-kpi',e=>e.textContent.includes('3.702')),"Host 0.3% KPI was not added to KPI nhân sự");
  assert(await page.$eval('#section-kpi',e=>e.textContent.includes('1.234')),"Operator 0.1% KPI was not added to KPI nhân sự");
  assert(await page.$eval('#section-kpi',e=>e.textContent.includes('1.234.000')),"Manual Host GMV was not added to KPI nhân sự");
  assert(await page.$eval('[data-kpi-table="final"]',e=>e.textContent.includes('1.234.000')),"Manual Host GMV must appear in finalized KPI table");
  assert(await page.$eval('#section-kpi',e=>e.textContent.includes('KPI thủ công chỉ được coi là đã chốt khi đã kiểm tra được GMV sau khi hoàn hủy')),"Manual KPI finalization rule missing");
  assert(await page.$('#section-kpi [data-manual-save]')===null,"KPI nhân sự must not contain manual KPI save controls");

  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForSelector("#app:not(.hidden)",{timeout:30000});
  await page.click('[data-section="manual-kpi"]');
  await page.click('#section-manual-kpi [data-range-mode="30d"]');
  const savedManualCard='#section-manual-kpi [data-manual-session="'+manualSessionId+'"]';
  assert(await page.$eval(savedManualCard+' [data-manual-kpi-session-summary]',e=>getComputedStyle(e).display!=='none'&&e.textContent.includes('Sửa KPI')),"Saved manual KPI session must remain collapsed after reload");
  assert(await page.$eval(savedManualCard+' [data-manual-kpi-session-editor]',e=>e.classList.contains('hidden')||getComputedStyle(e).display==='none'),"Reloaded manual KPI editor must stay hidden");
  await page.click(savedManualCard+' [data-manual-kpi-edit]');
  assert((await page.$$(savedManualCard+' [data-manual-entry-saved="1"]')).length>=1,"Saved manual KPI people must render as compact rows after save");
  assert(await page.$eval(savedManualCard+' [data-manual-entry-saved="1"] [data-manual-entry-details]',e=>e.classList.contains('hidden')),"Saved manual KPI details must start collapsed after reload");
  assert(await page.$eval(savedManualCard+' [data-manual-entry-saved="1"] .manual-kpi-entry-summary',e=>e.textContent.includes('Host:')&&e.textContent.includes('Vận hành:')&&e.textContent.includes('Chi tiết')),"Collapsed manual KPI summary must show Host Operator and Chi tiết");
  await page.click(savedManualCard+' [data-manual-entry-saved="1"] [data-manual-detail-toggle]');
  assert(!(await page.$eval(savedManualCard+' [data-manual-entry-saved="1"] [data-manual-entry-details]',e=>e.classList.contains('hidden'))),"Chi tiết must expand saved KPI row");
  assert(await page.$eval(savedManualCard+' [data-manual-host-person]',e=>e.value)==='staff-dung',"Saved Host Livestream did not persist");
  assert(await page.$eval(savedManualCard+' [data-manual-operator-person]',e=>e.value)==='staff-hung-bg',"Saved Operator did not persist");
  assert(await page.$eval(savedManualCard+' [data-manual-host-kpi]',e=>e.textContent.trim())==='3.702đ',"Computed Host KPI did not persist after reload");
  assert(await page.$eval(savedManualCard+' [data-manual-host-gmv]',e=>e.value)==='1.234.000',"Formatted Host GMV did not persist after reload");
  assert(await page.$eval(savedManualCard+' [data-manual-operator-kpi]',e=>e.textContent.trim())==='1.234đ',"Operator auto KPI did not persist after reload");

  await page.click('[data-section="export"]');
  assert(await page.$eval('#section-export',e=>e.textContent.includes('BO_HO_SO_KPI_KHANGCHOU_'+new Date().getFullYear())),"Khangchou KPI dossier export item missing");
  await page.click('#exportKhangchouDossier');
  await sleep(100);
  assert(await page.$eval('#actionToast',e=>e.textContent.includes('Tính năng đang được phát triển')&&e.classList.contains('show')),"Khangchou dossier placeholder toast missing");
  const desktopToastStyle=await page.$eval('#actionToast',e=>{
    const cs=getComputedStyle(e), dot=getComputedStyle(e,'::before');
    return {role:e.getAttribute('role'),live:e.getAttribute('aria-live'),radius:cs.borderRadius,border:cs.borderTopColor,color:cs.color,dotWidth:dot.width};
  });
  assert(desktopToastStyle.role==='status'&&desktopToastStyle.live==='polite',"Toast live-region semantics missing");
  assert(desktopToastStyle.radius==='16px'&&desktopToastStyle.dotWidth==='12px',"Prominent pastel toast visual treatment missing");

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
  assert(await page.$eval('#section-staff',e=>e.textContent.includes('Nhân sự độc lập với tài khoản đăng nhập')),"Staff/account separation notice missing");
  const defaultHostStaff=await page.$eval('#section-staff',e=>[...e.querySelectorAll('[data-staff-row]')].map(x=>x.textContent.trim()));
  assert(defaultHostStaff.some(x=>x.includes('Thảo My')&&x.includes('Host Livestream')),"Default Thảo My Host staff missing");
  assert(defaultHostStaff.some(x=>x.includes('Dung')&&x.includes('Host Livestream')),"Default Dung Host staff missing");
  assert(defaultHostStaff.some(x=>x.includes('Tâm')&&x.includes('Host Livestream')),"Default Tâm Host staff missing");
  assert(defaultHostStaff.some(x=>x.includes('Hùng Bắc Giang')&&x.includes('Nhân viên vận hành Livestream')),"Default Hùng Bắc Giang Operator staff missing");
  assert(defaultHostStaff.some(x=>x.includes('Hùng Hiền Hoà')&&x.includes('Nhân viên vận hành Livestream')),"Default Hùng Hiền Hoà Operator staff missing");
  await page.click('[data-staff-edit="staff-dung"]');
  assert(await page.$eval('[data-staff-google="staff-dung"]',e=>[...e.options].some(x=>x.value==='dung')),"Staff Gmail selector must include an approved Google login with the same role");
  await page.select('[data-staff-google="staff-dung"]','dung');
  await page.click('[data-staff-save="staff-dung"]');
  assert(await page.$eval('[data-staff-row="staff-dung"]',e=>e.textContent.includes('Đã liên kết ảnh Gmail')),"Staff Gmail photo link must be saved");
  await page.click('#nav [data-section="users"]');
  const dungGooglePhoto=await page.$eval('[data-approved-user="dung"] img[data-user-avatar]',e=>e.src);
  await page.click('#nav [data-section="kpi"]');
  const dungKpiAvatar=await page.$$eval('[data-kpi-table="final"] tbody tr',rows=>rows.map(row=>({name:row.cells[0]?.textContent||'',src:row.querySelector('img.kpi-person-avatar')?.src||'',alt:row.querySelector('img.kpi-person-avatar')?.alt||''})).find(r=>r.name.includes('Dung')));
  assert(dungKpiAvatar?.src===dungGooglePhoto&&dungKpiAvatar.alt.includes('Dung'),"Linked KPI staff must use the approved Gmail avatar, not the generic initial");
  await page.click('#nav [data-section="staff"]');

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
  assert(await page.$eval('[data-approved-uid="thao-my"][data-approved-perm="live.assign"]',e=>!e.disabled),"Operator assignment checkbox must be enabled when LIVE read access is checked");
  await page.click('[data-approved-uid="thao-my"][data-approved-perm="live.assign"]');
  await page.click('[data-approved-uid="thao-my"][data-approved-perm="kpi.read"]');
  await page.click('[data-user-save="thao-my"]');
  await sleep(100);
  assert(await page.$eval('[data-approved-role="thao-my"]',e=>e.value)==='operator',"Approved user role did not update");
  assert(!(await page.$eval('[data-approved-uid="thao-my"][data-approved-perm="kpi.read"]',e=>e.checked)),"Approved user KPI permission did not update");
  assert(await page.$eval('[data-approved-uid="thao-my"][data-approved-perm="live.assign"]',e=>e.checked),"Operator assignment permission did not persist");
  assert(await page.$eval('[data-user-editor="thao-my"]',e=>e.classList.contains('hidden')),"Editor must close after saving");

  await page.click('[data-user-edit="dung"]');
  assert(await page.$eval('[data-approved-role="dung"]',e=>e.value)==='host',"Host account role unexpectedly changed");
  assert(await page.$eval('[data-approved-uid="dung"][data-approved-perm="live.assign"]',e=>e.checkVisibility()&&!e.disabled),"Host must be able to receive delegated LIVE and draft rights");
  await page.click('[data-approved-uid="dung"][data-approved-perm="live.assign"]');
  await page.click('[data-user-save="dung"]');
  assert(await page.$eval('[data-approved-uid="dung"][data-approved-perm="live.assign"]',e=>e.checked),"Host assignment permission was not saved");

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
  assert(await page.$eval('[data-uid="pending-01"][data-perm="live.assign"]',e=>!e.disabled),"Pending operator assignment permission must be selectable");
  await page.click('[data-uid="pending-01"][data-perm="live.assign"]');
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
  assert(await page.$eval('[data-approved-uid="thao-my"][data-approved-perm="live.assign"]',e=>e.checked),"Updated operator assignment checkbox did not persist after reload");
  assert(await page.$eval('[data-approved-uid="dung"][data-approved-perm="live.assign"]',e=>e.checked),"Updated Host permission did not persist after reload");

  await page.setViewport({width:900,height:844,deviceScaleFactor:1});
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForSelector("#app:not(.hidden)",{timeout:30000});
  assert(await page.$('#nav .nav-group:nth-child(3) [data-section="users"]')!==null,"Tablet Quản lý tài khoản must stay inside Quản trị");
  assert(await page.$('#nav .nav-group:nth-child(3) [data-section="staff"]')!==null,"Tablet Quản lý nhân sự must stay inside Quản trị");
  assert(await page.$('#usersDockBtn')===null,"Tablet duplicate Users dock must be removed");

  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForSelector("#app:not(.hidden)",{timeout:30000});
  await page.$eval('#nav [data-section="tiktok"]',e=>e.click());
  await page.waitForSelector('#section-tiktok.active [data-creator-auth-card]');
  const mobileCreatorLayout=await page.$$eval('#section-tiktok [data-creator-channel]',els=>els.map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,vw:innerWidth};}));
  assert(mobileCreatorLayout.length===2&&mobileCreatorLayout.every(x=>x.left>=0&&x.right<=x.vw&&x.width<=x.vw),"Mobile Creator cards must fit viewport without overflow");
  await page.$eval('#nav [data-section="dashboard"]',e=>e.click());
  assert(await page.$('#section-dashboard .sync-status')===null,"Mobile Dashboard must hide redundant TikTok sync timestamp");
  assert(await page.$eval('#section-dashboard',e=>!e.textContent.includes('Dữ liệu Tiktok được đồng bộ lúc:')),"Mobile Dashboard sync timestamp text must be absent");
  assert(await page.$eval('#dataRefreshBtn',e=>e.checkVisibility()),"Mobile latest-data refresh button must remain visible on Tổng quan");
  const mobileRefreshGeometry=await page.$eval('.topbar',e=>{
    const refresh=e.querySelector('#dataRefreshBtn').getBoundingClientRect();
    const account=e.querySelector('#topbarAccountBtn').getBoundingClientRect();
    const bar=e.getBoundingClientRect();
    return {refreshWidth:refresh.width,refreshRight:refresh.right,accountLeft:account.left,barLeft:bar.left,barRight:bar.right};
  });
  assert(mobileRefreshGeometry.refreshWidth<=44&&mobileRefreshGeometry.refreshRight<=mobileRefreshGeometry.accountLeft&&mobileRefreshGeometry.refreshRight<=mobileRefreshGeometry.barRight,"Mobile latest-data button must compact without overlapping avatar");
  await page.click('#dataRefreshBtn');
  await sleep(70);
  assert(await page.$eval('#dataRefreshBtn',e=>e.disabled&&e.getAttribute('aria-busy')==='true'),"Mobile Dashboard must lock the button during TikTok 30-day sync");
  await sleep(850);
  assert(await page.$eval('#dataRefreshBtn',e=>e.textContent.includes('Đã cập nhật')),"Mobile Dashboard must show success after the sync completes");
  assert(await page.$('#dataRefreshModalBackdrop')===null&&await page.$('#dataRefreshPopover')===null,"Mobile latest-data popup/modal must stay removed");
  const mobileFormFonts=await page.evaluate(()=>[...document.querySelectorAll('input,select,textarea')].map(e=>({
    tag:e.tagName,
    type:e.getAttribute('type')||'',
    id:e.id||'',
    cls:e.className||'',
    fontSize:parseFloat(getComputedStyle(e).fontSize)||0
  })));
  assert(mobileFormFonts.length>0,"Mobile form controls missing from regression scan");
  assert(mobileFormFonts.every(x=>x.fontSize>=16),"Every mobile input/select/textarea must stay at >=16px to prevent iOS Safari focus zoom: "+JSON.stringify(mobileFormFonts.filter(x=>x.fontSize<16)));
  await page.click('#section-dashboard [data-range-mode="30d"]');
  const mobileMetrics=await page.$eval('#section-dashboard',root=>[...root.querySelectorAll('.metric-card')].map(card=>{
    const label=card.querySelector('.metric-copy>span')?.textContent.trim()||'';
    const value=card.querySelector('.metric-copy>strong');
    if(!value)return {label,lines:0,whiteSpace:'',text:''};
    const range=document.createRange();
    range.selectNodeContents(value);
    return {label,text:value.textContent.trim(),lines:range.getClientRects().length,whiteSpace:getComputedStyle(value).whiteSpace,fits:value.scrollWidth<=value.clientWidth+1};
  }));
  assert(mobileMetrics.length===4,"Mobile Dashboard metric cards missing");
  assert(mobileMetrics.every(x=>x.lines===1&&x.whiteSpace==='nowrap'&&x.fits),"Mobile Dashboard metric values must stay on one line without clipping");
  const mobileGmv=mobileMetrics.find(x=>x.label==='GMV đã ghi nhận');
  assert(mobileGmv&&mobileGmv.text.endsWith('đ')&&mobileGmv.lines===1,"Mobile GMV đã ghi nhận must display the full amount and đ on one line");
  const mobileFinalGmv=await page.$eval('[data-dashboard-final-gmv]',e=>{
    const r=e.getBoundingClientRect();
    const value=e.querySelector('.dashboard-final-gmv-copy>strong');
    return {text:e.textContent.trim(),width:r.width,vw:innerWidth,value:value?.textContent.trim()||'',scrollWidth:e.scrollWidth};
  });
  assert(mobileFinalGmv.text.includes('GMV sau khi hoàn hủy')&&mobileFinalGmv.value.endsWith('đ'),"Mobile finalized GMV summary missing");
  assert(mobileFinalGmv.width<=mobileFinalGmv.vw-16&&mobileFinalGmv.scrollWidth<=mobileFinalGmv.width+1,"Mobile finalized GMV summary must fit viewport without horizontal overflow");
  assert(await page.$('#section-dashboard .mobile-live-card.reconciled')!==null,"Mobile Dashboard must mark finalized LIVE cards");
  const mobileFinalizedStyle=await page.$eval('#section-dashboard .mobile-live-card.reconciled',e=>{
    const field=e.querySelector('.mobile-field');
    const badge=e.querySelector('.live-reconciled-badge');
    const pill=e.querySelector('.kpi-status-final');
    return {
      text:e.textContent,
      cardBg:getComputedStyle(e).backgroundColor,
      border:getComputedStyle(e).borderTopColor,
      fieldBg:getComputedStyle(field).backgroundColor,
      badgeColor:getComputedStyle(badge).color,
      badgeBg:getComputedStyle(badge).backgroundColor,
      pillText:pill?.textContent.trim()||''
    };
  });
  assert(mobileFinalizedStyle.text.includes('✓ Đã đối soát'),"Mobile finalized LIVE card must show reconciliation check");
  assert(mobileFinalizedStyle.pillText.startsWith('✓ Đã chốt'),"Mobile finalized KPI pill must include green check");
  assert(mobileFinalizedStyle.cardBg!=='rgba(0, 0, 0, 0)'&&mobileFinalizedStyle.fieldBg!=='rgb(250, 247, 249)',"Mobile finalized LIVE card must use finalized green styling instead of the default pink surface");
  await page.click('#menuToggle');
  await page.waitForFunction(()=>document.querySelector('#sidebar')?.classList.contains('open'));
  await sleep(300);
  const mobileNavGroups=await page.$$eval('#nav .nav-group-title',els=>els.map(e=>e.textContent.trim()));
  assert(mobileNavGroups.join('|')==='Báo cáo|Công cụ|Quản trị',"Mobile sidebar groups are missing");
  assert(await page.$('#nav [data-section="manual-kpi"]')!==null,"Mobile KPI thủ công tab missing");
  assert(await page.$('#nav [data-section="reconcile"]')!==null,"Mobile Đối soát đơn LIVE tab missing");
  await page.$eval('#nav [data-section="live"]',e=>e.click());
  await sleep(80);
  await page.click('#section-live [data-range-mode="30d"]');
  assert(await page.$eval('#section-live .mobile-live-card:first-of-type',e=>e.textContent.includes('GMV LIVE tổng')&&e.textContent.includes('GMV từ shopkhangbaby')&&e.textContent.includes('GMV Affiliate')&&!e.textContent.includes('Hoa hồng Affiliate')&&e.textContent.includes('GMV chờ đối soát')&&e.textContent.includes('GMV sau khi hoàn hủy')),"Mobile LIVE card must show Affiliate GMV without commission");
  assert(await page.$('#nav .nav-group:nth-child(3) [data-section="users"]')!==null,"Mobile Quản lý tài khoản must stay inside Quản trị");
  assert(await page.$('#nav .nav-group:nth-child(3) [data-section="staff"]')!==null,"Mobile Quản lý nhân sự must stay inside Quản trị");
  assert(await page.$('#usersDockBtn')===null,"Mobile duplicate Users dock must be removed");
  await page.$eval('#mobileMenuOverlay',e=>e.click());
  await page.waitForFunction(()=>!document.querySelector('#sidebar')?.classList.contains('open'));
  assert(await page.$('#sidebar #userAvatar')===null,"Mobile sidebar must not contain the current-user block");
  assert(await page.$('#topbarAccountBtn #userAvatar')!==null,"Mobile topbar avatar trigger missing");
  assert(await page.$eval('#topbarAccountBtn',e=>e.textContent.trim()===''&&!!e.querySelector('#userAvatar')),"Mobile topbar must show avatar only");
  await page.click('#topbarAccountBtn');
  await page.$eval('#accountPopover', async el => Promise.all(el.getAnimations().map(a => a.finished)));
  assert(!(await page.$eval('#accountModalBackdrop',e=>e.classList.contains('hidden'))),"Mobile account modal did not open");
  assert(await page.$eval('#accountPopover',e=>e.textContent.includes('admin@sellerkbb.demo')&&(e.textContent.includes('Đăng xuất')||e.textContent.includes('Thoát Preview'))),"Mobile account popup information/logout missing");
  const mobilePopup=await page.$eval('#accountPopover',e=>{const r=e.getBoundingClientRect();return {cx:r.left+r.width/2,cy:r.top+r.height/2,width:r.width,vw:innerWidth,vh:innerHeight};});
  assert(mobilePopup.width<=mobilePopup.vw-20&&Math.abs(mobilePopup.cx-mobilePopup.vw/2)<3&&Math.abs(mobilePopup.cy-mobilePopup.vh/2)<3,"Mobile account modal must fit and stay centered");
  await page.$eval('#accountModalBackdrop',e=>e.click());

  await page.$eval('#nav [data-section="reconcile"]',e=>e.click());
  await sleep(100);
  assert(await page.$eval('#section-reconcile',e=>e.classList.contains('active')),"Mobile reconciliation section did not activate");
  await page.click('#section-reconcile [data-range-mode="30d"]');
  const mobileReconcile='#section-reconcile .reconcile-session:first-of-type';
  assert(await page.$eval(mobileReconcile,e=>e.classList.contains('reconciled')&&e.textContent.includes('Đã đối soát')),"Finalized reconciliation session must show green success status");
  const mobileOpenButton=mobileReconcile+' [data-reconcile-open]';
  const pageScrollBefore=await page.evaluate(()=>window.scrollY);
  await page.click(mobileOpenButton);
  await page.$eval('#reconcileModal', async el => Promise.all(el.getAnimations().map(a => a.finished)));
  await page.waitForSelector('#reconcileModalBackdrop:not(.hidden) #reconcileModalBody .reconcile-order-grid');
  const mobileReconLayout=await page.$eval('#reconcileModal',e=>{
    const grid=e.querySelector('.reconcile-order-grid');
    const card=e.querySelector('.reconcile-order-card');
    const body=e.querySelector('#reconcileModalBody');
    const r=e.getBoundingClientRect();
    return {
      columns:getComputedStyle(grid).gridTemplateColumns,
      cardWidth:card?.getBoundingClientRect().width||0,
      rootWidth:r.width,
      rootHeight:r.height,
      vw:innerWidth,
      vh:innerHeight,
      overflow:e.scrollWidth>e.clientWidth+2,
      bodyOverflowY:getComputedStyle(body).overflowY,
      bodyTouchAction:getComputedStyle(body).touchAction,
      text:e.textContent
    };
  });
  assert(!mobileReconLayout.overflow,"Mobile reconciliation popup must not overflow horizontally");
  assert(!mobileReconLayout.columns.includes(' '),"Mobile reconciliation order grid must be one column");
  assert(mobileReconLayout.cardWidth<=mobileReconLayout.rootWidth+1,"Mobile reconciliation card must fit popup width");
  assert(Math.abs(mobileReconLayout.rootWidth-mobileReconLayout.vw)<2&&Math.abs(mobileReconLayout.rootHeight-mobileReconLayout.vh)<3,"Mobile reconciliation popup must fill the viewport");
  assert(mobileReconLayout.bodyOverflowY==='auto'||mobileReconLayout.bodyOverflowY==='scroll',"Mobile popup content must scroll internally");
  assert(mobileReconLayout.text.includes('Chờ đóng hàng')&&mobileReconLayout.text.includes('Đang giao')&&mobileReconLayout.text.includes('Đang hoàn / trả'),"Mobile reconciliation status tags missing");
  assert(await page.$eval('#reconcileModalBody .reconcile-retention-note',e=>e.textContent.includes('60 ngày')),"Mobile reconciliation 60-day protection note missing");
  const noticeGapMobile=await page.$eval('#reconcileModalBody [data-reconcile-notices]',e=>{
    const [first,second]=e.querySelectorAll('.notice');
    return second.getBoundingClientRect().top-first.getBoundingClientRect().bottom;
  });
  assert(noticeGapMobile>=11,"Mobile Affiliate and KPI notices must not stick together");
  assert(await page.$eval('body',e=>getComputedStyle(e).overflow==='hidden'),"Mobile popup must lock page background scrolling");
  assert(await page.$eval(mobileOpenButton,e=>e.classList.contains('hidden')),"Mobile Xem đơn button must hide while popup is open");
  await page.evaluate(()=>{const body=document.querySelector('#reconcileModalBody');body.scrollTop=body.scrollHeight;});
  await sleep(60);
  assert(await page.evaluate(()=>window.scrollY)===pageScrollBefore,"Scrolling reconciliation popup must not move the page behind it");
  await page.click('#reconcileModalClose');
  await page.waitForFunction(()=>document.querySelector('#reconcileModalBackdrop')?.classList.contains('hidden'));
  assert(!(await page.$eval(mobileOpenButton,e=>e.classList.contains('hidden'))),"Mobile Xem đơn button must return after popup closes");

  await page.$eval('#nav [data-section="live"]',e=>e.click());
  await sleep(320);
  await page.click('#section-live [data-range-mode="30d"]');

  await page.click('#menuToggle');
  await page.waitForFunction(()=>document.querySelector('#sidebar')?.classList.contains('open'));
  await page.$eval('#nav [data-section="manual-kpi"]',e=>e.click());
  await page.waitForFunction(()=>!document.querySelector('#sidebar')?.classList.contains('open'));
  await sleep(200);
  await page.click('#section-manual-kpi [data-range-mode="30d"]');
  const mobileManualCard='#section-manual-kpi [data-manual-session="'+manualSessionId+'"]';
  assert(await page.$eval(mobileManualCard+' [data-manual-kpi-session-summary]',e=>getComputedStyle(e).display!=='none'&&e.textContent.includes('Sửa KPI')),"Mobile saved KPI session must start collapsed");
  await page.click(mobileManualCard+' [data-manual-kpi-edit]');
  assert(await page.$eval(mobileManualCard+' [data-manual-kpi-session-editor]',e=>!e.classList.contains('hidden')&&getComputedStyle(e).display!=='none'),"Mobile Sửa KPI must reopen the KPI editor");
  assert(await page.$eval(mobileManualCard+' [data-manual-entry-saved="1"] [data-manual-entry-details]',e=>e.classList.contains('hidden')),"Mobile saved KPI row must start collapsed");
  await page.click(mobileManualCard+' [data-manual-entry-saved="1"] [data-manual-detail-toggle]');
  assert(!(await page.$eval(mobileManualCard+' [data-manual-entry-saved="1"] [data-manual-entry-details]',e=>e.classList.contains('hidden'))),"Mobile Chi tiết must expand KPI row");
  assert(await page.$eval(mobileManualCard+' [data-manual-host-gmv]',e=>parseFloat(getComputedStyle(e).fontSize)>=16),"Mobile Host GMV input must be >=16px to prevent focus zoom");
  const focusBefore=await page.evaluate(()=>document.activeElement?.tagName||'');
  await page.$eval(mobileManualCard+' [data-manual-host-kpi]',e=>e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})));
  await page.$eval(mobileManualCard+' [data-manual-operator-kpi]',e=>e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})));
  const focusAfter=await page.evaluate(()=>document.activeElement?.tagName||'');
  assert(focusAfter===focusBefore||focusAfter==='BODY',"Static KPI outputs must not receive focus on mobile");
  await page.click('#menuToggle');
  await page.waitForFunction(()=>document.querySelector('#sidebar')?.classList.contains('open'));
  await page.$eval('#nav [data-section="live"]',e=>e.click());
  await page.waitForFunction(()=>!document.querySelector('#sidebar')?.classList.contains('open'));
  await sleep(200);

  const mobileId=await page.evaluate(()=>{
    const cards=[...document.querySelectorAll('#section-live .mobile-live-card')];
    const automatic=cards.filter(e=>!e.classList.contains('manual-session'));
    const card=automatic.find(e=>!e.querySelector('[data-assignment-editor]')?.classList.contains('hidden'))||automatic[0];
    return card?.querySelector('[data-save-session]')?.dataset.saveSession||'';
  });
  assert(mobileId,"No automatic mobile LIVE card available for assignment test");
  const mobileCard='#section-live .mobile-live-card:has([data-save-session="'+mobileId+'"])';
  assert(await page.$eval(mobileCard+' .mobile-live-time',e=>/^\d{2}\/\d{2}\/\d{4} Vào lúc \d{2}:\d{2}-/.test(e.textContent.trim())),"Mobile compact LIVE time range not rendered");
  if(await page.$(mobileCard+' [data-edit-assignment]')) await page.click(mobileCard+' [data-edit-assignment]');
  assert(await page.$eval(mobileCard+' [data-assignment-editor]',e=>!e.classList.contains('hidden')&&getComputedStyle(e).display!=='none'),"Mobile Host/Operator editor must be open before assignment");
  await page.select(mobileCard+' select[data-person="host"]','staff-dung');
  await page.select(mobileCard+' select[data-person="operator"]','staff-hung-hh');
  await page.click(mobileCard+' [data-save-session]');
  await sleep(150);
  await assertAssignmentCollapsed(mobileCard,'Dung','Hùng Hiền Hoà');
  const mobileSavedState=await page.evaluate(id=>{try{return JSON.parse(localStorage.getItem('sellerkbb:preview-state:v1')||'{}')?.sessionEdits?.[id]||null}catch{return null}},mobileId);
  assert(mobileSavedState?.hostUid==='staff-dung'&&mobileSavedState?.operatorUid==='staff-hung-hh',"Mobile Host/Operator save did not persist in Preview state");
  assert(await page.$('#actionToast')!==null,"Toast live region must remain mounted for mobile actions");
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
  assert(await page.$eval(mobileSavedCard+' [data-assignment-summary]',e=>getComputedStyle(e).display!=='none'&&e.textContent.includes('Dung')&&e.textContent.includes('Hùng Hiền Hoà')),"Saved mobile Host/Operator must collapse into a readable summary");
  assert(await page.$eval(mobileSavedCard+' [data-assignment-editor]',e=>e.classList.contains('hidden')||getComputedStyle(e).display==='none'),"Saved mobile Host/Operator selectors must stay hidden");
  await page.click(mobileSavedCard+' [data-edit-assignment]');
  assert(await page.$eval(mobileSavedCard+' [data-assignment-summary]',e=>e.classList.contains('hidden')||getComputedStyle(e).display==='none'),"Mobile saved assignment summary must hide while editing");
  assert(await page.$eval(mobileSavedCard+' [data-assignment-editor]',e=>!e.classList.contains('hidden')&&getComputedStyle(e).display!=='none'),"Sửa must reopen the mobile Host/Operator selectors");
  assert(await page.$eval(mobileSavedCard+' select[data-person="host"]',e=>e.value)==='staff-dung',"Mobile Host save read the wrong hidden desktop selector");
  assert(await page.$eval(mobileSavedCard+' select[data-person="operator"]',e=>e.value)==='staff-hung-hh',"Mobile Operator save read the wrong hidden desktop selector");
  await page.select(mobileSavedCard+' select[data-person="host"]','staff-thao-my');
  await page.click(mobileSavedCard+' [data-save-session]');
  await assertAssignmentCollapsed(mobileSavedCard,'Thảo My','Hùng Hiền Hoà');
  // Toggle manual mode directly from the collapsed state on both layouts.

  await page.click(mobileSavedCard+' [data-manual-kpi]');
  assert(await page.$eval(mobileSavedCard+' [data-auto-person-wrap]',e=>getComputedStyle(e).display==='none'),"Mobile Host/Operator block must hide in manual KPI mode");
  assert(await page.$eval(mobileSavedCard+' select[data-person="host"]',e=>e.value)==='',"Mobile Campaign/Mega did not clear Host");
  assert(await page.$eval(mobileSavedCard+' select[data-person="operator"]',e=>e.value)==='',"Mobile Campaign/Mega did not clear Operator");
  assert(!(await page.$eval(mobileSavedCard+' [data-manual-type-wrap]',e=>e.classList.contains('hidden'))),"Mobile Campaign/Mega type selector must appear");
  await page.select(mobileSavedCard+' [data-manual-type]','campaign');
  await page.click(mobileSavedCard+' [data-save-session]');
  await sleep(100);
  assert(await page.$eval('#actionToast',e=>e.textContent.includes('Ngày Campaign')&&e.textContent.includes('KPI thủ công')),"Mobile Campaign classification save toast missing");
  const mobileTypeLayout=await page.$eval(mobileSavedCard+' [data-manual-type-summary]',e=>{
    const button=e.querySelector('[data-edit-manual-type]');
    const copy=e.querySelector('.manual-type-summary-copy');
    const box=e.getBoundingClientRect();
    const buttonBox=button.getBoundingClientRect();
    const copyBox=copy.getBoundingClientRect();
    return {
      display:getComputedStyle(e).display,
      width:box.width,
      buttonWidth:buttonBox.width,
      copyWidth:copyBox.width,
      overflow:e.scrollWidth>e.clientWidth+1,
      buttonInside:buttonBox.right<=box.right+1&&buttonBox.left>=box.left-1
    };
  });
  assert(mobileTypeLayout.display==='grid',"Mobile Campaign/Mega saved summary must use grid layout");
  assert(!mobileTypeLayout.overflow&&mobileTypeLayout.buttonInside,"Mobile Campaign/Mega saved summary must not overflow its card");
  assert(mobileTypeLayout.buttonWidth<mobileTypeLayout.width*.4&&mobileTypeLayout.copyWidth>mobileTypeLayout.buttonWidth,"Mobile Sửa button must stay compact beside the saved type");

  await page.$eval('#section-live [data-range-mode="custom"]',e=>e.click());
  await page.waitForFunction(()=>document.querySelector('#section-live [data-range-mode="custom"]')?.classList.contains('active')&&document.querySelector('#section-live [data-date-calendar="live"] [data-calendar-day]'));
  assert((await page.$$eval('#section-live [data-calendar-day]',els=>els.length))>=28,"Mobile calendar grid missing");
  await page.click('#section-live [data-apply-range="live"]');
  assert(await page.$('#section-live [data-date-calendar="live"]')===null,"Mobile calendar did not collapse after Apply");

  // Smoke test the complete delegated flow with the real preview UI, without Firestore writes.
  const operatorUrl=new URL(previewUrl);
  operatorUrl.searchParams.set('preview_role','operator');
  operatorUrl.searchParams.set('preview_assign','1');
  await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});
  await page.goto(operatorUrl.href,{waitUntil:"domcontentloaded"});
  await page.waitForSelector('#app:not(.hidden)',{timeout:30000});
  assert(await page.$('#nav [data-section="users"]')===null,"Operator must not gain account administration");
  assert(await page.$('#nav [data-section="staff"]')===null,"Operator must not edit staff directory");
  assert(await page.$('#nav [data-section="manual-kpi"]')!==null,"Delegated operator needs KPI draft workspace");
  await page.click('#nav [data-section="live"]');
  await page.click('#section-live [data-range-mode="30d"]');
  const delegatedRow='#section-live .desktop-live-table tbody tr:has(.live-reconciled-badge):not(:has([data-manual-type-summary]))';
  const delegatedId=await page.$eval(delegatedRow,e=>e.dataset.liveSession);
  assert(Boolean(delegatedId),"Need a finalized sample LIVE for delegated role test");
  await page.$eval(delegatedRow+' [data-manual-kpi]',e=>{e.checked=true;e.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.select(delegatedRow+' [data-manual-type]','mega');
  await page.click(delegatedRow+' [data-save-session]');
  assert(await page.$eval('#actionToast',e=>e.textContent.includes('Mega Live')),"Operator must be able to classify a Mega LIVE");
  await page.click('#nav [data-section="manual-kpi"]');
  await page.click('#section-manual-kpi [data-range-mode="30d"]');
  const delegatedCard='#section-manual-kpi [data-manual-session="'+delegatedId+'"]';
  assert(await page.$(delegatedCard+' [data-manual-save]')!==null,"Operator must have a KPI draft save button");
  await page.select(delegatedCard+' [data-manual-host-person]','staff-dung');
  await page.select(delegatedCard+' [data-manual-operator-person]','staff-hung-bg');
  await page.$eval(delegatedCard+' [data-manual-host-gmv]',e=>{e.value='777777';e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.click(delegatedCard+' [data-manual-save]');
  assert(await page.$eval('#actionToast',e=>e.textContent.includes('chờ Admin duyệt')),"Operator draft must await approval");
  assert(await page.$eval(delegatedCard,e=>e.textContent.includes('Chờ Admin duyệt')&&e.textContent.includes('chưa cộng')),"Pending KPI must show warning");
  await page.click('#nav [data-section="kpi"]');
  await page.select('#section-kpi [data-kpi-month-select]','2026-10');
  const manualGmvBeforeApproval=await page.$eval('[data-kpi-table="final"]',e=>[...e.querySelectorAll('tbody tr')].reduce((sum,row)=>sum+(Number((row.cells[3]?.textContent||'').replace(/[^0-9]/g,''))||0),0));

  await page.goto(previewUrl,{waitUntil:"domcontentloaded"});
  await page.waitForSelector('#app:not(.hidden)',{timeout:30000});
  await page.click('#nav [data-section="manual-kpi"]');
  await page.click('#section-manual-kpi [data-range-mode="30d"]');
  assert(await page.$(delegatedCard+' [data-manual-approve]')!==null,"Admin approval button must appear for delegated draft");
  await page.click(delegatedCard+' [data-manual-approve]');
  assert(await page.$eval('#actionToast',e=>e.textContent.includes('Đã duyệt KPI thủ công')),"Admin approval must show success");
  await page.click('#nav [data-section="kpi"]');
  await page.select('#section-kpi [data-kpi-month-select]','2026-10');
  const manualGmvAfterApproval=await page.$eval('[data-kpi-table="final"]',e=>[...e.querySelectorAll('tbody tr')].reduce((sum,row)=>sum+(Number((row.cells[3]?.textContent||'').replace(/[^0-9]/g,''))||0),0));
  assert(manualGmvAfterApproval===manualGmvBeforeApproval+777777*2,"Approved Host and Operator manual GMV allocations must each appear once after approval");

  const noAssignUrl=new URL(previewUrl);
  noAssignUrl.searchParams.set('preview_role','operator');
  await page.goto(noAssignUrl.href,{waitUntil:"domcontentloaded"});
  await page.waitForSelector('#app:not(.hidden)',{timeout:30000});
  assert(await page.$('#nav [data-section="manual-kpi"]')===null,"Operator must lose draft access if permission is disabled");
  await page.click('#nav [data-section="live"]');
  await page.click('#section-live [data-range-mode="30d"]');
  assert(await page.$('#section-live [data-save-session]')===null,"Operator without live.assign must not edit LIVE tags");

  // A Host with the same opt-in permission may tag sessions, create pending
  // KPI allocations, and must still wait for an Admin to approve them.
  const hostUrl=new URL(previewUrl);
  hostUrl.searchParams.set('preview_role','host');
  hostUrl.searchParams.set('preview_assign','1');
  await page.goto(hostUrl.href,{waitUntil:"domcontentloaded"});
  await page.waitForSelector('#app:not(.hidden)',{timeout:30000});
  assert(await page.$('#nav [data-section="users"]')===null,"Host must not gain account administration");
  assert(await page.$('#nav [data-section="staff"]')===null,"Host must not edit personnel directory");
  assert(await page.$('#nav [data-section="manual-kpi"]')!==null,"Authorized Host must see manual KPI drafts");
  await page.click('#nav [data-section="live"]');
  await page.click('#section-live [data-range-mode="30d"]');
  const hostRow='#section-live .desktop-live-table tbody tr:has(.live-reconciled-badge):not(:has([data-manual-type-summary]))';
  const hostSessionId=await page.$eval(hostRow,e=>e.dataset.liveSession);
  assert(Boolean(hostSessionId),"Host permission test needs a finalized untagged session");
  await page.select(hostRow+' select[data-person="host"]','staff-thao-my');
  await page.select(hostRow+' select[data-person="operator"]','staff-hung-hh');
  await page.click(hostRow+' [data-save-session]');
  assert(await page.$eval('#actionToast',e=>e.textContent.includes('Đã lưu nhân sự')),"Host must be allowed to tag Host/Operator");
  const hostSavedRow='#section-live .desktop-live-table tbody tr[data-live-session="'+hostSessionId+'"]';
  await page.$eval(hostSavedRow+' [data-manual-kpi]',e=>{e.checked=true;e.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.select(hostSavedRow+' [data-manual-type]','campaign');
  await page.click(hostSavedRow+' [data-save-session]');
  assert(await page.$eval('#actionToast',e=>e.textContent.includes('Ngày Campaign')),"Host must be able to tag Campaign LIVE");
  await page.click('#nav [data-section="manual-kpi"]');
  await page.click('#section-manual-kpi [data-range-mode="30d"]');
  const hostCard='#section-manual-kpi [data-manual-session="'+hostSessionId+'"]';
  await page.select(hostCard+' [data-manual-host-person]','staff-thao-my');
  await page.select(hostCard+' [data-manual-operator-person]','staff-hung-hh');
  await page.$eval(hostCard+' [data-manual-host-gmv]',e=>{e.value='555555';e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.click(hostCard+' [data-manual-save]');
  assert(await page.$eval('#actionToast',e=>e.textContent.includes('chờ Admin duyệt')),"Host manual KPI must save only a draft");
  assert(await page.$eval(hostCard,e=>e.textContent.includes('Chờ Admin duyệt')),"Host manual KPI must show pending approval");

  const hostDeniedUrl=new URL(previewUrl);
  hostDeniedUrl.searchParams.set('preview_role','host');
  await page.goto(hostDeniedUrl.href,{waitUntil:"domcontentloaded"});
  await page.waitForSelector('#app:not(.hidden)',{timeout:30000});
  assert(await page.$('#nav [data-section="manual-kpi"]')===null,"Host without live.assign must lose draft access");
  await page.click('#nav [data-section="live"]');
  await page.click('#section-live [data-range-mode="30d"]');
  assert(await page.$('#section-live [data-save-session]')===null,"Host without live.assign must not tag sessions");

  // Profile editor verification in isolated Preview: upload compressed image,
  // change own display name, restore after reload, and close on logout.
  await page.goto(previewUrl,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#app:not(.hidden)',{timeout:30000});
  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  await page.click('#topbarAccountBtn');
  await page.click('#accountProfileEdit');
  assert(await page.$eval('#accountProfileEditor',e=>!e.classList.contains('hidden')),"Profile edit form must open inside account popup");
  const profileBounds=await page.$eval('#accountPopover',e=>({width:e.getBoundingClientRect().width,screen:innerWidth}));
  assert(profileBounds.width<=profileBounds.screen-10,"Editable profile popup must fit mobile viewport");
  await page.$eval('#accountAvatarUpload',async input=>{
    const canvas=document.createElement('canvas');
    canvas.width=48;canvas.height=48;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#e7a3c0';ctx.fillRect(0,0,48,48);
    ctx.fillStyle='#fff';ctx.fillRect(12,12,24,24);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const transfer=new DataTransfer();
    transfer.items.add(new File([blob],'avatar.png',{type:'image/png'}));
    input.files=transfer.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.waitForFunction(()=>document.querySelector('#accountPhotoPreview')?.src.startsWith('data:image/jpeg;base64,'),{timeout:10000});
  await page.$eval('#accountProfileName',e=>{e.value='Hồ Sơ Mới';e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.click('#accountProfileSave');
  await page.waitForFunction(()=>document.querySelector('#accountPopover')?.textContent.includes('Hồ Sơ Mới'));
  const savedPhoto=await page.$eval('#userAvatar',e=>e.src);
  assert(savedPhoto.startsWith('data:image/jpeg;base64,')&&savedPhoto.length<160000,"Uploaded image must be compressed and shown in topbar");
  await page.goto(previewUrl,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#app:not(.hidden)',{timeout:30000});
  await page.click('#topbarAccountBtn');
  assert(await page.$eval('#accountPopover',e=>e.textContent.includes('Hồ Sơ Mới')),"Edited display name must persist after reloading");
  assert(await page.$eval('#userAvatar',e=>e.src===document.querySelector('#accountPopover img[data-user-avatar]')?.src&&e.src.startsWith('data:image/jpeg;base64,')),"Saved avatar must persist in account popup and topbar");
  await page.click('#accountProfileEdit');
  await page.click('#accountGoogleAvatar');
  await page.click('#accountProfileSave');
  assert(await page.$eval('#userAvatar',e=>!e.src.startsWith('data:image/jpeg;base64,')),"Restore Google photo must remove the uploaded override");
  assert(await page.$eval('#accountModalBackdrop',e=>!e.classList.contains('hidden')),"Saving profile must not unexpectedly close modal");

  // Signout: record overlay state at beforeunload, then intercept the root
  // route with a tiny signed-out document. Production login loads Firebase CDN
  // scripts, which are not available in this isolated browser test.
  await page.evaluate(()=>{
    addEventListener('beforeunload',()=>{
      const backdrop=document.querySelector('#accountModalBackdrop');
      const closed=backdrop.classList.contains('hidden')&&backdrop.getAttribute('aria-hidden')==='true'
        && !document.body.classList.contains('account-modal-open')&&!document.querySelector('#app').inert;
      sessionStorage.setItem('sellerkbb:test:logout-closed',String(closed));
    });
  });
  await page.setRequestInterception(true);
  page.on('request',req=>{
    const url=new URL(req.url());
    if(req.isNavigationRequest()&&url.pathname==='/'&&url.origin===new URL(previewUrl).origin){
      return req.respond({status:200,contentType:'text/html',body:'<!doctype html><title>Signed out</title><div id="accountModalBackdrop" class="hidden" aria-hidden="true"></div>'});
    }
    return req.continue();
  });
  await Promise.all([
    page.waitForNavigation({waitUntil:'domcontentloaded',timeout:15000}),
    page.click('#accountLogoutBtn')
  ]);
  assert(await page.evaluate(()=>sessionStorage.getItem('sellerkbb:test:logout-closed')==='true'),
    "Signout must immediately dismiss and unlock popup before leaving the page");
  assert(await page.$eval('#accountModalBackdrop',e=>e.classList.contains('hidden')),"Signed-out screen must not retain account popup");

  console.log("Desktop/mobile browser smoke tests, profile image/name persistence and signout popup cleanup passed");
} catch(error) {
  fs.mkdirSync('../verification',{recursive:true});
  for(const page of await browser.pages()) {
    if(page.url().includes('/preview')) {
      await page.screenshot({path:'../verification/smoke-failure.png'});
      console.error(await page.evaluate(()=>({section:document.querySelector('.section.active')?.id,inert:document.querySelector('#app')?.inert,focus:document.activeElement?.outerHTML.slice(0,250)})));
    }
  }
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
