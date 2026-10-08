const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root=path.resolve(__dirname,'..'),origin='https://hae-preview.test';
const gigs=[
  {id:'glasgow',event:'Half Awake Eyes',date:'2030-11-14',venue:'Slay',city:'Glasgow',ticketUrl:'https://tickets.example/glasgow',status:'available'},
  {id:'edinburgh',event:'The Five Hundred',date:'2030-10-18',venue:'The Banshee Labyrinth',city:'Edinburgh',ticketUrl:'https://tickets.example/edinburgh',status:'sold_out'},
  {id:'old',event:'Past show',date:'2020-01-01'},
  {id:'hidden',event:'Hidden show',date:'2030-12-01',hideFromLinks:true}
];
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    for(const width of [1440,390,320]) {
      const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[];
      let mode='shows';page.on('pageerror',error=>errors.push(error.message));
      await context.route('**/*',async route=>{
        const url=new URL(route.request().url());
        const js=body=>route.fulfill({contentType:'text/javascript',body});
        if(url.pathname.endsWith('/firebase-app.js'))return js('export const initializeApp=()=>({}),getApps=()=>[];');
        if(url.pathname.endsWith('/firebase-firestore.js'))return js(`export const getFirestore=()=>({}),doc=()=>({}),getDoc=async()=>{${mode==='error'?"throw Error('Synthetic unavailable');":`return {data:()=>({items:${JSON.stringify(mode==='empty'?[]:gigs)}})};`}};`);
        if(url.origin!==origin)return route.abort();
        if(url.pathname.endsWith('/public-analytics.js'))return js('');
        if(url.pathname.endsWith('/public-ticket-actions.js'))return js('export const bindTicketAction=()=>{};');
        const pathname=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname;
        const file=path.resolve(root,'.'+decodeURIComponent(pathname));
        if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
        return route.fulfill({path:file,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':undefined});
      });
      await page.goto(origin+'/live-dates/');await page.waitForSelector('.show-row');await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.locator('.show-row').count(),2);
      assert.match(await page.locator('.show-row').first().innerText(),/The Five Hundred/);
      assert.equal(await page.locator('.show-row').first().getByRole('link',{name:'Tickets',exact:true}).count(),0);
      assert.equal(await page.locator('.show-row').last().getByRole('link',{name:'Tickets',exact:true}).getAttribute('href'),'https://tickets.example/glasgow');
      assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(8, 8, 8)');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://halfawakeeyes.co.uk/live-dates/');
      if(width<800){await page.getByRole('button',{name:'Open menu',exact:true}).click();assert.equal(await page.locator('#site-nav a[aria-current=page]').textContent(),'Live dates');await page.keyboard.press('Escape');assert.equal(await page.locator('.nav-toggle').getAttribute('aria-expanded'),'false');}
      await page.screenshot({path:path.join(root,`.tests/live-dates-${width}.png`),fullPage:true});
      mode='empty';await page.reload();await page.getByText('No upcoming dates announced. Check back soon.').waitFor();
      mode='error';await page.reload();await page.getByText('Upcoming dates are unavailable right now. Please check again soon.').waitFor();
      mode='shows';await page.goto(origin+'/tickets/?utm_source=poster#dates');await page.waitForURL('**/live-dates/?utm_source=poster#dates');await page.waitForSelector('.show-row');
      assert.deepEqual(errors,[]);
      console.log(`Live dates: theme, upcoming/sold-out/hidden shows, mobile menu, empty/error states and legacy redirect passed at ${width}px.`);
      await context.close();
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
