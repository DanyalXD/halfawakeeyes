const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root=path.resolve(__dirname,'..'),origin='https://hae-notification-preview.test';
const fixture=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/css/admin-notifications.css"></head><body><button id="refresh-data">Refresh</button><script type="module">
import {setupNotificationBell} from '/assets/js/admin-notification-bell.js';
const feeds=new Map();window.opened=[];window.stopped=0;
window.bell=setupNotificationBell({db:{},collection:(_db,name)=>name,doc:(_db,c,id)=>c+'/'+id,query:ref=>ref,orderBy:()=>{},limit:()=>{},
onSnapshot:(ref,next)=>{feeds.set(ref,next);next(ref==='mailing-list-signups'?{docs:[]}:{data:()=>null});return()=>{feeds.delete(ref);window.stopped++;};},onOpen:item=>window.opened.push(item)});
window.notice=(views,day=new Date().toISOString().slice(0,10))=>feeds.get('analytics-page-views/current')?.({data:()=>({views,day,timestamp:new Date().toISOString(),page:'/private',sessionId:'hidden-session'})});
bell.start('synthetic-admin');window.ready=true;
</script></body></html>`;
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {for(const width of [1280,390]) {
  const context=await browser.newContext({viewport:{width,height:850}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:fixture});
   const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep))return route.abort();
   return route.fulfill({path:file,contentType:file.endsWith('.js')?'text/javascript':'text/css'});
  });
  await page.goto(origin);await page.waitForFunction(()=>window.ready);
  await page.evaluate(()=>window.notice(24));
  await page.getByRole('button',{name:'Notifications, 1 unread'}).click();
  assert.match(await page.locator('#notification-list').innerText(),/24 page views today \(UTC\)/);
  assert.doesNotMatch(await page.locator('#notification-list').innerText(),/private|hidden-session/);
  await page.getByRole('button',{name:'Mark all read'}).click();
  assert.equal(await page.locator('#notification-badge').isVisible(),false);
  await page.evaluate(()=>window.notice(25));
  assert.equal(await page.locator('#notification-badge').innerText(),'1');
  assert.equal(await page.locator('.notification-item').count(),1);
  await page.locator('.notification-item').click();
  assert.equal(await page.evaluate(()=>window.opened[0].page),'analytics');
  await page.evaluate(()=>document.dispatchEvent(new Event('hae-admin-account-changing')));
  assert.equal(await page.locator('#notification-bell').isDisabled(),true);
  assert.equal(await page.evaluate(()=>window.stopped),3);assert.deepEqual(errors,[]);
  console.log('Aggregate bell update, unread state, navigation and logout passed at '+width+'px.');
  await context.close();
 }} finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
