// Compare the real public pages, with synthetic show data and all third parties blocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const origin = 'https://hae-footer-preview.test';
// Links has a dedicated sticky footer, covered by privacy-panel-browser.cjs.
const pages = ['index.html','epk.html','smartlink.html','404.html','tickets.html','tickets/index.html','store/index.html','join-us/index.html','privacy.html','shows/index.html?gig=synthetic-footer','shows/NdwHYTIzYcVyqHAXyMHI/index.html'];
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    for (const viewport of [{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:841,height:463},{width:1440,height:900}]) {
      const context = await browser.newContext({viewport});
      await context.addInitScript(() => {
        localStorage.setItem('hae-privacy-choice',JSON.stringify({version:'2026-10-07',savedAt:Date.now(),marketingSavedAt:Date.now(),analytics:false,marketing:false}));
      });
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin === 'https://firestore.googleapis.com' && url.pathname.endsWith('/gigs/synthetic-footer')) {
          const values = {event:'Synthetic show',date:'2026-11-07',venue:'Test venue',city:'Glasgow',ticketUrl:'https://tickets.example/show',imageUrl:origin+'/assets/images/slay-hero-640.jpg',metaPixelId:'123'};
          const fields = Object.fromEntries(Object.entries(values).map(([key,value]) => [key,{stringValue:value}]));
          await route.fulfill({contentType:'application/json',body:JSON.stringify({fields})});return;
        }
        if (url.origin !== origin) {await route.abort();return;}
        const file = path.resolve(root, '.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
        if (!file.startsWith(root+path.sep) || !fs.existsSync(file)) {await route.fulfill({status:404,body:''});return;}
        const types = {'.js':'text/javascript','.css':'text/css','.html':'text/html','.ttf':'font/ttf','.otf':'font/otf'};
        await route.fulfill({path:file,contentType:types[path.extname(file)]});
      });
      let baseline;
      for (const route of pages) {
        const page = await context.newPage();
        await page.goto(origin+'/'+route);
        if (route.includes('synthetic-footer')) await page.locator('[data-gig-page]').waitFor();
        const footer = page.locator('#hae-site-footer');
        const settings = page.getByRole('button',{name:'Privacy settings',exact:true});
        await settings.waitFor(); await footer.scrollIntoViewIfNeeded();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(() => document.body.classList.contains('hae-footer-visible'));
        assert.equal(await page.locator('footer, .footer, .footer-links').count(), 1, route+' has one footer');
        const links = footer.locator('[data-public-footer-links]');
        assert.equal(await links.getByRole('link').count(), 3);
        assert.deepEqual(await links.getByRole('link').allTextContents(), ['Home','Press & bookings','Privacy']);
        assert.equal(await footer.locator('.hae-footer-brand').isVisible(), viewport.width > 800);
        assert.equal(await settings.evaluate(el => !!el.closest('#hae-site-footer')), true);
        assert.equal(await settings.evaluate(el => getComputedStyle(el).position), 'static');
        const details = await footer.evaluate(el => {
          const style = getComputedStyle(el), rect = el.getBoundingClientRect();
          const controls = Array.from(el.querySelectorAll('[data-public-footer-links] a,[data-public-footer-links] button')).map(control => {
            const bounds = control.getBoundingClientRect(), css = getComputedStyle(control);
            return {y:Math.round((bounds.y-rect.y)*100)/100,height:bounds.height,width:bounds.width,font:css.font,color:css.color,decoration:css.textDecorationLine};
          });
          return {height:rect.height,width:rect.width,background:style.backgroundColor,padding:style.padding,border:style.borderTop,controls};
        });
        assert.equal(details.width, viewport.width, route+' footer spans the viewport');
        assert.ok(details.height <= 80, route+' footer stays compact');
        assert.equal(new Set(details.controls.map(control => control.y)).size, 1, route+' controls share one row');
        for (const control of details.controls) {
          assert.ok(control.width>=44 && control.height>=44, route+' controls are easy to tap');
          assert.equal(control.font, details.controls[0].font);
          assert.equal(control.color, details.controls[0].color);
          assert.equal(control.decoration, 'none');
        }
        if (!baseline) baseline = details;
        else assert.deepEqual(details, baseline, route+' matches the homepage footer');
        if (viewport.width > 800) {
          const alignment = await footer.evaluate(el => {
            const links = el.querySelector('[data-public-footer-links]').getBoundingClientRect();
            const copyright = el.querySelector('.hae-footer-copyright').getBoundingClientRect();
            const brand = el.querySelector('.hae-footer-brand').getBoundingClientRect();
            return {right:links.right,left:brand.left,brandRight:brand.right,copyrightLeft:copyright.left,brandHeight:brand.height};
          });
          assert.equal(alignment.right, viewport.width - 24, route+' desktop links align right');
          assert.equal(alignment.left, 24, route+' desktop logo aligns left');
          assert.equal(alignment.copyrightLeft, alignment.brandRight+16, route+' copyright follows the logo');
          assert.ok(alignment.brandHeight>=44, route+' logo is an accessible home link');
        }
        for (const control of await footer.locator('a,button').all()) {
          if (!await control.isVisible()) continue;
          assert.equal(await control.evaluate(el => {const rect=el.getBoundingClientRect();return el.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2));}), true, route+' footer controls remain unobstructed');
        }
        if (viewport.width===390) await footer.screenshot({path:path.join(__dirname,'footer-'+route.split('/')[0].replace('.html','')+'.png')});
        if (viewport.width===1440 && route==='index.html') await footer.screenshot({path:path.join(__dirname,'footer-desktop.png')});
        await settings.click();
        assert.equal(await page.locator('#hae-privacy-controls').isVisible(), true);
        assert.equal(await settings.isVisible(), true, route+' keeps the privacy button visible');
        const popup = await page.locator('#hae-privacy-controls').boundingBox();
        const trigger = await settings.boundingBox();
        assert.ok(Math.abs(popup.y+popup.height+8-trigger.y)<=1, route+' opens preferences above its button');
        assert.equal(await settings.evaluate(el => {const rect=el.getBoundingClientRect();return el.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2));}), true, route+' privacy button remains clickable');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#hae-privacy-controls').isVisible(), false);
        await page.close();
      }
      console.log(`All ${pages.length} public-page footers match at ${viewport.width}px; links and privacy controls are unobstructed.`);
      await context.close();
    }
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
