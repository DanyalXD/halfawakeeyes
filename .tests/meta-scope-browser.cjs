// Verify page-specific Meta choices without sending any third-party events.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const origin = 'https://hae-meta-preview.test';
const preferenceKey = 'hae-privacy-choice';
const gig = {id:'synthetic-show',event:'Synthetic show',metaPixelId:'123'};
function fixture(show = false) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
  <h1>Privacy scope check</h1>${show ? `<main data-gig-page='${JSON.stringify(gig)}'></main>` : ''}
  <script type="module">
  import * as utils from '/assets/js/public-site-utils.js?v=20261008-privacy-anchor';
  ${show ? "import '/assets/js/public-ticket-actions.js?v=20261008-privacy-anchor';" : ''}
  window.privacyUtils=utils; window.scopeReady=true;
  </script></body></html>`;
}
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    for (const viewport of [{width:1280,height:900},{width:390,height:844}]) {
      const context = await browser.newContext({viewport});
      const external = [], errors = [];
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin === 'https://firestore.googleapis.com' && /\/gigs\/synthetic-(show|no-pixel)$/.test(url.pathname)) {
          const values = {event:'Synthetic show',date:'2026-11-07',venue:'Test venue',city:'Glasgow',ticketUrl:'https://tickets.example/show',metaPixelId:url.pathname.endsWith('no-pixel')?'':'123'};
          const fields = Object.fromEntries(Object.entries(values).map(([key,value]) => [key,{stringValue:value}]));
          await route.fulfill({contentType:'application/json',body:JSON.stringify({fields})});return;
        }
        if (url.origin !== origin) {external.push(url.href);await route.abort();return;}
        if (url.pathname === '/plain' || url.pathname === '/show') {
          await route.fulfill({contentType:'text/html',body:fixture(url.pathname === '/show')});return;
        }
        const file = path.resolve(root, '.' + url.pathname + (url.pathname.endsWith('/')?'index.html':''));
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {await route.fulfill({status:404,body:''});return;}
        await route.fulfill({path:file,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':undefined});
      });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      const metaRequests = () => external.filter(url => /facebook\.net|facebook\.com/.test(url));
      const panel = page.locator('#hae-privacy-controls');
      const marketing = page.locator('input[name=marketing]');
      const analytics = page.locator('input[name=analytics]');
      const save = page.getByRole('button',{name:'Save choices',exact:true});
      const open = async () => page.getByRole('button',{name:'Privacy settings',exact:true}).click();
      const choice = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), preferenceKey);
      await page.goto(origin + '/plain'); await page.waitForFunction(() => window.scopeReady);
      assert.equal(await marketing.isVisible(), false, 'Ordinary pages only show statistical analytics');
      assert.equal(await analytics.isChecked(), true);
      assert.equal(metaRequests().length, 0);
      await save.click();
      assert.equal((await choice()).marketingSavedAt, 0, 'Analytics-only save does not record a Meta refusal');
      // A pixel configured after an analytics-only save must still offer a separate decision.
      await page.evaluate(() => window.privacyUtils.enableMetaPrivacy('123'));
      assert.equal(await panel.isVisible(), true);
      assert.equal(await marketing.isVisible(), true);
      assert.equal(await marketing.isChecked(), false);
      assert.equal(metaRequests().length, 0);
      await save.click();
      assert.equal((await choice()).marketing, false);
      assert.ok((await choice()).marketingSavedAt > 0);
      await page.goto(origin + '/show'); await page.waitForFunction(() => window.scopeReady);
      assert.equal(await panel.isVisible(), false, 'Configured pages respect an explicit Meta refusal');
      assert.equal(metaRequests().length, 0);
      await open(); await analytics.uncheck(); await marketing.check(); await save.click();
      await page.waitForFunction(() => Boolean(window.fbq));
      assert.equal(metaRequests().length, 1);
      const consentTimestamp = (await choice()).marketingSavedAt;
      assert.equal((await choice()).analytics, false);
      // Saving or rejecting analytics on a non-pixel page must preserve marketing permission.
      await page.goto(origin + '/plain'); await page.waitForFunction(() => window.scopeReady);
      await open(); assert.equal(await marketing.isVisible(), false);
      await analytics.check(); await save.click();
      assert.equal((await choice()).marketing, true);
      assert.equal((await choice()).marketingSavedAt, consentTimestamp);
      await open(); await page.locator('[data-reject]').click();
      assert.equal((await choice()).analytics, false);
      assert.equal((await choice()).marketing, true);
      assert.equal((await choice()).marketingSavedAt, consentTimestamp);
      await open(); await page.evaluate(() => window.privacyUtils.enableMetaPrivacy('invalid'));
      assert.equal(await marketing.isVisible(), false, 'Invalid pixel IDs do not expose Meta choices');
      assert.equal(metaRequests().length, 1);
      // The real Privacy page provides an explicit route to withdrawal.
      await page.goto(origin + '/privacy.html');
      await page.getByRole('button',{name:'Manage privacy choices',exact:true}).click();
      assert.equal(await marketing.isVisible(), true);
      assert.equal(await marketing.isChecked(), true);
      await marketing.uncheck(); await save.click();
      await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).marketing === false, preferenceKey);
      await page.goto(origin + '/show'); await page.waitForFunction(() => window.scopeReady);
      assert.equal(await page.evaluate(() => Boolean(window.fbq)), false);
      assert.equal(metaRequests().length, 1, 'Withdrawal prevents subsequent Meta loading');
      // An analytics objection must not suppress the first decision on a configured page.
      await page.evaluate(key => localStorage.setItem(key, JSON.stringify({version:'2026-10-07',savedAt:Date.now(),analytics:false,marketing:false,marketingSavedAt:0})), preferenceKey);
      await page.reload(); await page.waitForFunction(() => window.scopeReady);
      assert.equal(await panel.isVisible(), true);
      assert.equal(await analytics.isChecked(), false);
      assert.equal(await marketing.isChecked(), false);
      assert.equal(metaRequests().length, 1);
      // The actual show loader replaces the body; its preferences must survive that render.
      await page.goto(origin + '/shows/?gig=synthetic-show');
      await page.locator('[data-gig-page]').waitFor();
      await page.locator('[data-meta-option]').waitFor({state:'visible'});
      assert.equal(await panel.count(), 1);
      assert.equal(await analytics.isChecked(), false);
      assert.equal(await marketing.isChecked(), false);
      assert.equal(metaRequests().length, 1);
      await page.goto(origin + '/shows/?gig=synthetic-no-pixel');
      await page.locator('[data-gig-page]').waitFor();
      await page.getByRole('button',{name:'Privacy settings',exact:true}).waitFor();
      await open(); assert.equal(await marketing.isVisible(), false);
      assert.equal(metaRequests().length, 1);
      assert.deepEqual(errors, []);
      console.log(`Meta scope, late configuration, preserved choices and Privacy-page withdrawal pass at ${viewport.width}px.`);
      await context.close();
    }
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode = 1;});
