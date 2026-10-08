import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('assets/js/admin-notification-bell.js','utf8');
const {buildBellNotifications,waitForNotificationPage}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('bell combines product feeds and excludes raw browsing events and unsubscribed contacts',()=>{
 const items=buildBellNotifications({actions:[{id:'a',action:'ticket_redirect_continue',actionSubtype:'auto',timestamp:'2026-09-06'},{id:'b',action:'click',section:'tickets',timestamp:{seconds:1788652800}}],signups:[{id:'c',createdAt:'2026-09-05',email:'fan@example.com'},{id:'d',unsubscribed:true,createdAt:'2026-09-05'}],messages:[{id:'1',date:'2026-09-07',subject:'Booking'}]});
 assert.equal(items.length,2);assert.equal(items[0].recordId,'1');assert.equal(items[0].id,'email:1');assert.equal(items.find(i=>i.id==='signup:c').page,'subscribers');
});
test('notification waits for destination data and paint before opening',async()=>{
 const events=[];let loaded;const load=new Promise(resolve=>loaded=()=>{events.push('loaded');resolve();});
 const next=waitForNotificationPage(load,()=>true,async()=>events.push('paint')).then(ready=>{if(ready)events.push('dialog');});
 assert.deepEqual(events,[]);loaded();await next;assert.deepEqual(events,['loaded','paint','dialog']);
});
test('navigation or account changes cancel a pending notification dialog',async()=>{
 assert.equal(await waitForNotificationPage(Promise.resolve(),()=>false,()=>{throw Error('must not paint');}),false);
 let current=true;assert.equal(await waitForNotificationPage(Promise.resolve(),()=>current,async()=>{current=false;}),false);
});
test('bell deduplicates identifiers, ignores invalid dates and limits recent results',()=>{
 const messages=Array.from({length:80},(_,id)=>({id:String(id),date:new Date(2026,8,1,0,id).toISOString()}));
 const result=buildBellNotifications({messages:[...messages,messages[79],{id:'bad',date:'invalid'}]});
 assert.equal(result.length,50);assert.equal(result[0].id,'email:79');assert.equal(new Set(result.map(i=>i.id)).size,50);
});

 test('page-view totals expose only a daily count and become unread when the count rises',()=>{
 const notice={day:new Date().toISOString().slice(0,10),views:24,timestamp:new Date(),sessionId:'private',page:'/links'};
 const first=buildBellNotifications({pageViews:notice})[0];
 assert.equal(first.body,'24 page views today (UTC).');assert.equal(first.page,'analytics');
 assert.doesNotMatch(JSON.stringify(first),/private|sessionId|\/links/);
 assert.notEqual(first.id,buildBellNotifications({pageViews:{...notice,views:25}})[0].id);
 assert.equal(buildBellNotifications({pageViews:{...notice,day:'2020-01-01'}}).length,0);
 });
