// Real public page layout checks, with all third-party requests blocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1';
const viewports = [
  {width:1440,height:900,name:'desktop'},
  {width:390,height:844,name:'mobile'},
  {width:841,height:463,name:'short-desktop'},
  {width:320,height:568}, {width:768,height:1024}, {width:1024,height:768}
];
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    for (const pageName of ['index.html', 'links.html']) for (const viewport of viewports) {
      const context = await browser.newContext({viewport});
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin || !url.pathname.startsWith('/HAE/')) {await route.abort(); return;}
        const file = path.resolve(root, url.pathname.slice('/HAE/'.length));
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {await route.fulfill({status:404,body:''}); return;}
        const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf','.otf':'font/otf'};
        await route.fulfill({path:file,contentType:types[path.extname(file)]});
      });
      const page = await context.newPage();
      await page.goto(origin + '/HAE/' + pageName);
      const panel = page.locator('#hae-privacy-controls');
      await panel.waitFor({state:'attached'});
      assert.equal(await panel.isVisible(), false, 'Preferences never cover the page on arrival');
      assert.equal(await page.locator('#hae-privacy-settings').getAttribute('aria-expanded'), 'false');
      if (pageName === 'links.html') {
        const note = page.locator('.links-privacy-note');
        assert.equal(await note.evaluate(el => getComputedStyle(el).position), 'static');
        assert.equal(await note.getByRole('button',{name:'Turn analytics off',exact:true}).isVisible(), true);
        assert.equal(await note.evaluate(el => !!el.closest('#hae-site-footer')), true);
        const footer = page.locator('#hae-site-footer');
        assert.equal(await footer.evaluate(el => getComputedStyle(el).position), 'fixed');
        await page.evaluate(() => {
          const stack = document.querySelector('#main-links');
          for (let i=0;i<20;i++) {
            const link=document.createElement('a');
            link.href='#links-signup-title'; link.textContent='Test link '+i;
            link.style.cssText='display:block;min-height:44px'; stack.append(link);
          }
        });
        for (const atEnd of [false, true]) {
          await page.evaluate(end => window.scrollTo(0,end?document.body.scrollHeight:0), atEnd);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const bounds=await footer.boundingBox();
          assert.ok(Math.abs(bounds.y+bounds.height-viewport.height)<1, 'Footer stays at viewport bottom');
          assert.ok(bounds.height <= 105, 'Sticky footer stays compact');
          if (atEnd) {
            const content=await page.locator('main').boundingBox();
            assert.ok(content.y+content.height<=bounds.y+1, 'Reserved space keeps the page end above the footer');
          }
        }
        if (viewport.name === 'mobile' || viewport.name === 'desktop') await page.screenshot({path:path.join(__dirname,'links-sticky-footer-'+viewport.name+'.png')});
        await page.evaluate(() => window.scrollTo(0,0));
      }
      await page.getByRole('button',{name:'Privacy settings',exact:true}).click();
      await page.evaluate(() => document.fonts.ready);
      const layout = await panel.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return {x:rect.x,y:rect.y,right:rect.right,bottom:rect.bottom,overflow:el.scrollWidth>el.clientWidth,background:getComputedStyle(el).backgroundColor};
      });
      assert.ok(layout.x >= 0 && layout.y >= 0 && layout.right <= viewport.width && layout.bottom <= viewport.height);
      assert.equal(layout.overflow, false);
      assert.equal(layout.background, 'rgb(20, 20, 20)');
      assert.equal(await page.locator('[data-hae-privacy-styles]').count(), 1);
      assert.equal(await page.getByRole('button',{name:'Privacy settings',exact:true}).isVisible(), true);
      assert.equal(await page.getByRole('switch',{name:'Statistical analytics',exact:true}).isChecked(), true);
      assert.equal(await page.getByRole('switch',{name:'Marketing / Meta',exact:true}).count(), 0);
      assert.equal(await panel.getByRole('link',{name:'Privacy policy',exact:true}).getAttribute('href'), origin + '/HAE/privacy.html');
      for (const selector of ['.hae-privacy-save','[data-reject]','[data-close]']) {
        assert.ok((await page.locator(selector).boundingBox()).height >= 44);
      }
      if (viewport.name) await page.screenshot({path:path.join(__dirname,'privacy-panel-'+viewport.name+'.png')});
      // Closing preferences keeps the page position and leaves choices unsaved.
      await page.getByRole('button',{name:'Close privacy preferences',exact:true}).focus();
      assert.equal(await page.evaluate(() => localStorage.getItem('hae-privacy-choice')), null);
      const scrollBeforeClose = await page.evaluate(() => window.scrollY);
      await page.keyboard.press('Escape');
      assert.equal(await panel.isVisible(), false);
      assert.equal(await page.evaluate(() => window.scrollY), scrollBeforeClose);
      const settings = page.getByRole('button',{name:'Privacy settings',exact:true});
      if (viewport.width <= 800 && pageName !== 'links.html') {
        assert.equal(await settings.evaluate(el => getComputedStyle(el).position), 'static');
        assert.equal(await settings.evaluate(el => !!el.closest('footer')), true);
        const settingsBounds = await settings.boundingBox();
        assert.ok(settingsBounds.height >= 44);
        const footerLinks = page.locator('#hae-site-footer [data-public-footer-links] > a');
        for (const link of await footerLinks.all()) {
          const bounds = await link.boundingBox();
          assert.ok(Math.abs(bounds.y - settingsBounds.y) < 1, 'Footer links and settings share one row');
        }
        const copyright = await page.locator('#hae-site-footer .hae-footer-copyright').boundingBox();
        assert.ok(copyright.y >= settingsBounds.y + settingsBounds.height, 'Copyright sits below the link row');
        for (const action of await page.locator('.hero-actions a').all()) {
          const bounds = await action.boundingBox();
          assert.ok(bounds.y + bounds.height <= settingsBounds.y);
        }
        if (viewport.name === 'mobile') {
          await page.screenshot({path:path.join(__dirname,'privacy-settings-mobile.png')});
          await page.locator('body > footer').screenshot({path:path.join(__dirname,'privacy-settings-mobile-footer.png')});
        }
      } else {
        assert.equal(await settings.evaluate(el => getComputedStyle(el).position), 'static');
        assert.equal(await settings.evaluate(el => !!el.closest('#hae-site-footer')), true);
      }
      await settings.scrollIntoViewIfNeeded();
      await settings.focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.name), 'analytics');
      const checkAnchor = async () => {
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const box = await panel.boundingBox(), trigger = await settings.boundingBox();
        assert.equal(await settings.isVisible(), true, 'The footer button stays visible while preferences are open');
        assert.equal(await settings.getAttribute('aria-expanded'), 'true');
        assert.ok(Math.abs(box.y + box.height + 8 - trigger.y) <= 1, 'Preferences open above the footer button: '+JSON.stringify({box,trigger}));
        assert.ok(box.x >= 0 && box.y >= 0 && box.x+box.width <= page.viewportSize().width && box.y+box.height <= page.viewportSize().height);
        assert.equal(await settings.evaluate(el => {const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}), true, 'The popup does not cover its button');
      };
      await checkAnchor();
      if (viewport.name === 'desktop' || viewport.name === 'mobile') {
        await page.screenshot({path:path.join(__dirname,'privacy-anchored-'+viewport.name+'.png')});
        await page.evaluate(() => window.scrollBy(0,-8));
        await checkAnchor();
        await page.setViewportSize({width:viewport.width===1440?1024:320,height:viewport.height});
        await settings.scrollIntoViewIfNeeded();
        await checkAnchor();
        await page.setViewportSize({width:viewport.width,height:viewport.height});
        await settings.scrollIntoViewIfNeeded();
        await checkAnchor();
      }
      await settings.click();
      assert.equal(await panel.isVisible(), false, 'The visible button can close the popup');
      await settings.click();
      assert.equal(await panel.isVisible(), true);
      await checkAnchor();
      assert.equal(await page.getByRole('switch',{name:'Marketing / Meta',exact:true}).count(), 0);
      await page.getByRole('switch',{name:'Statistical analytics',exact:true}).focus();
      await page.keyboard.press('Space');
      assert.equal(await page.locator('[data-state="analytics"]').textContent(), 'Off');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('hae-privacy-choice')).analytics), false);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('hae-privacy-choice')).marketing), false);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Save choices');
      await page.keyboard.press('Enter');
      assert.equal(await panel.isVisible(), false);
      await page.reload();
      await panel.waitFor({state:'attached'});
      assert.equal(await panel.isVisible(), false, 'Saved choices do not reopen the panel');
      await page.evaluate(async () => {
        const utils = await import('/HAE/assets/js/public-site-utils.js?v=20261008-privacy-anchor');
        utils.enableMetaPrivacy('1234567890');
      });
      assert.equal(await panel.isVisible(), false, 'Late Meta configuration does not interrupt browsing');
      await settings.click();
      assert.equal(await page.getByRole('switch',{name:'Marketing / Meta',exact:true}).isChecked(), false);
      if (pageName === 'links.html') {
        await page.getByRole('switch',{name:'Statistical analytics',exact:true}).check();
        await page.getByRole('button',{name:'Save choices',exact:true}).click();
        await page.getByRole('button',{name:'Turn analytics off',exact:true}).click();
        assert.equal(await panel.isVisible(), false, 'Inline objection never opens an overlay');
        assert.equal(await page.locator('[data-analytics-status]').textContent(), 'Analytics are off.');
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('hae-privacy-choice')).analytics), false);
        await page.reload();
        await panel.waitFor({state:'attached'});
        assert.equal(await page.locator('[data-analytics-status]').textContent(), 'Analytics are off.');
      }
      console.log(`${pageName} privacy stays closed on arrival; ${viewport.width}x${viewport.height} layout, keyboard and choices pass.`);
      await context.close();
    }
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode = 1;});
