// Isolated Chromium checks. Set PLAYWRIGHT_MODULE_PATH if Playwright is outside node_modules.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const preview = 'https://hae-preview.test';
const fixture = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module" src="/assets/js/privacy-controls.js"></script></head><body><h1>Analytics privacy preview</h1><button id="tracked-action">Ticket action</button><script type="module">
import {createSiteAnalytics,hasTrackingConsent} from '/assets/js/public-site-utils.js?v=20261008-privacy-anchor';
import {trackGigPixel} from '/assets/js/ticket-pixels.js?v=20261008-privacy-anchor';
window.analyticsWrites=[];
const client=createSiteAnalytics({pagePath:'/links',pageName:'Links',doc:(_db,_collection,id)=>id,setDoc:async(id,data)=>window.analyticsWrites.push({id,data})});
client.logPageViewOnce();
const gig={id:'test-show',event:'Synthetic show',metaPixelId:'123'};
trackGigPixel(gig,'GigTicketView');
window.addEventListener('hae-consent-change',()=>trackGigPixel(gig,'GigTicketView'));
document.querySelector('#tracked-action').addEventListener('click',()=>{client.logEvent('click',{label:'Ticket',section:'tickets',href:'https://tickets.example/order?email=fan@example.test'});trackGigPixel(gig);});
window.previewReady=true;
</script></body></html>`;
const aggregateFixture=`<!doctype html><html><body>${fs.readFileSync(path.join(root,'assets/components/admin/pages/analytics.html'),'utf8')}<script type="module">
import {renderAnalyticsInsights} from '/assets/js/analytics-insights.js';
import {createLiveAnalytics} from '/assets/js/analytics-live.js';
const rows=[
{kind:'total',value:'',count:13,views:8,clicks:5,tickets:5,sessions:8,clickingSessions:5,bounces:2,sessionSeconds:240,timestamp:'2026-10-07'},
{kind:'page',value:'/links',views:8,count:8,timestamp:'2026-10-07'},
{kind:'device',value:'mobile',views:8,count:8,timestamp:'2026-10-07'}
 ];
const live=createLiveAnalytics({subscribe:next=>{window.analyticsChanged=next;return()=>{};},fetchReport:async()=>rows,onReport:rows=>{renderAnalyticsInsights(rows,{from:'2026-10-07',to:'2026-10-07'});window.aggregateReady=true;},onError:error=>{throw error;},onLoading:()=>{}});
window.nextAnalyticsEvent=()=>{rows[0].views++;rows[0].count++;window.analyticsChanged();};
await live.start();
</script></body></html>`;

(async()=>{
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    for (const viewport of [{width:1280,height:900},{width:390,height:844}]) {
      const context = await browser.newContext({viewport});
      const page = await context.newPage(); const external = [], errors = [];
      page.on('pageerror', error=>errors.push(error.message));
      await context.route('**/*', async route=>{
        const url=new URL(route.request().url());
        if(url.origin!==preview){external.push(url.href);await route.abort();return;}
        if(url.pathname==='/fixture'){await route.fulfill({contentType:'text/html',body:fixture});return;}
        if(url.pathname==='/aggregate'){await route.fulfill({contentType:'text/html',body:aggregateFixture});return;}
        const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
        if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){await route.fulfill({status:404,body:''});return;}
        const type=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':undefined;
        await route.fulfill({path:file,contentType:type});
      });
      await page.goto(preview+'/fixture'); await page.waitForFunction(()=>window.previewReady);
      assert.equal(await page.locator('#hae-privacy-controls').isVisible(),false);
      await page.getByRole('button',{name:'Privacy settings',exact:true}).click();
      assert.equal(await page.locator('#hae-privacy-controls').isVisible(),true);
      assert.equal(await page.locator('input[name=analytics]').isChecked(),true);
      assert.equal(await page.locator('input[name=marketing]').isChecked(),false);
      assert.equal(await page.evaluate(()=>window.analyticsWrites.length),1);
      assert.ok(await page.evaluate(()=>sessionStorage.getItem('hae-analytics-session-v3')));
      assert.equal(external.length,0);
      const bounds=await page.locator('#hae-privacy-controls').boundingBox();
      assert.ok(bounds.x>=0 && bounds.x+bounds.width<=viewport.width && bounds.y+bounds.height<=viewport.height);
      await page.getByRole('button',{name:'Turn both off (analytics and marketing)'}).click();
      assert.equal(await page.locator('#hae-privacy-controls').isVisible(),false);
      await page.locator('#tracked-action').click(); assert.equal(await page.evaluate(()=>window.analyticsWrites.length),1);
      await page.evaluate(()=>localStorage.setItem('hae-privacy-choice',JSON.stringify({version:'old-version',savedAt:0,analytics:false,marketing:false})));
      await page.reload(); await page.waitForFunction(()=>window.previewReady);
      assert.equal(await page.evaluate(()=>window.analyticsWrites.length),0);
      assert.equal(await page.evaluate(()=>sessionStorage.getItem('hae-analytics-session-v3')),null);
      if (!await page.locator('#hae-privacy-controls').isVisible()) await page.getByRole('button',{name:'Privacy settings',exact:true}).click();
      await page.locator('input[name=analytics]').check();
      await page.getByRole('button',{name:'Save choices',exact:true}).click();
      await page.waitForFunction(()=>window.analyticsWrites.length===1);
      const payload=await page.evaluate(()=>window.analyticsWrites[0].data);
      assert.equal(payload.action,'page_view'); assert.equal(payload.browser,'Chrome');
      assert.equal(external.length,0);
      await page.getByRole('button',{name:'Privacy settings',exact:true}).click();
      const peer=await context.newPage(); peer.on('pageerror',error=>errors.push(error.message));
      await peer.goto(preview+'/fixture'); await peer.waitForFunction(()=>window.previewReady);
      assert.equal(await peer.evaluate(()=>window.analyticsWrites.length),1);
      await page.locator('input[name=analytics]').uncheck();
      await peer.waitForFunction(()=>sessionStorage.getItem('hae-analytics-session-v3')===null);
      await peer.locator('#tracked-action').click(); assert.equal(await peer.evaluate(()=>window.analyticsWrites.length),1);
      await peer.close();
      await page.locator('input[name=marketing]').check();
      await page.getByRole('button',{name:'Save choices',exact:true}).click();
      await page.waitForFunction(()=>Boolean(window.fbq));
      assert.equal(await page.evaluate(()=>sessionStorage.getItem('hae-analytics-session-v3')),null);
      assert.ok(external.some(url=>url.includes('connect.facebook.net')));
      await page.locator('#tracked-action').click();
      assert.equal(await page.evaluate(()=>window.analyticsWrites.length),1);
      await page.getByRole('button',{name:'Privacy settings',exact:true}).click();
      await page.locator('input[name=marketing]').uncheck();
      await page.getByRole('button',{name:'Save choices',exact:true}).click();
      await page.waitForFunction(()=>window.previewReady && !window.fbq);
      assert.equal(await page.evaluate(()=>window.analyticsWrites.length),0);
      assert.deepEqual(errors,[]);
      console.log(`Privacy controls, separate choices, collection and withdrawal passed at ${viewport.width}px.`);
      await page.goto(preview+'/aggregate'); await page.waitForFunction(()=>window.aggregateReady);
      const cards=await page.locator('#stats-grid').innerText();
      assert.match(cards,/Page views\s+8/); assert.match(cards,/Approximate visits\s+8/);
      assert.match(cards,/30s/); assert.match(cards,/25%/);
      await page.evaluate(()=>window.nextAnalyticsEvent());
      await page.waitForFunction(()=>/Page views\s+9/.test(document.querySelector('#stats-grid').innerText));
      assert.equal(await page.getByRole('button',{name:'Sessions',exact:true}).count(),0);
      assert.deepEqual(errors,[]);
      console.log(`Aggregate dashboard renders weighted metrics and session estimates at ${viewport.width}px.`);
      await context.close();
    }
    const context = await browser.newContext(); const page=await context.newPage(); const media=[];
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!==preview){if(url.href.includes('spotify'))media.push(url.href);await route.abort();return;}
      const file=path.resolve(root,'.'+url.pathname);
      if(file.startsWith(root+path.sep)&&fs.existsSync(file))await route.fulfill({path:file,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':undefined});
      else await route.fulfill({status:404,body:''});
    });
    for (const name of ['index.html', 'epk.html']) {
      await page.goto(preview+'/'+name);
      assert.equal(await page.locator('iframe').count(),0);
      assert.ok(await page.locator('a[href^="https://open.spotify.com/album/"]').count() > 0);
      assert.equal(media.length,0);
    }
    console.log('Homepage and EPK retain Spotify links without loading Spotify embeds. All external requests were intercepted.');
    await context.close();
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
