const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('functions/index.js','utf8');
const renderer=source.slice(source.indexOf('function escapePublicHtml'),source.indexOf('const IONOS_EMAIL'));
async function render(status,event='Test show') {
  const exports={};let html='';
  const gig={id:'test',date:'2026-10-01',event,venue:'Venue',city:'Glasgow',status,ticketUrl:'https://tickets.example/show',metaPixelId:'123',doorsTime:'19:30',ageRestriction:'18+'};
  vm.runInNewContext(renderer,{exports,onRequest:(_,fn)=>fn,db:{doc:()=>({get:async()=>({data:()=>({items:[gig]})})})},ADMIN_SITE_URL:'https://halfawakeeyes.co.uk',URL});
  const response={set:()=>response,status:()=>response,type:()=>response,send:value=>{html=value;return response;}};
  await exports.getPublicEventPage({method:'GET',path:'/shows/test'},response);return html;
}
test('public show buttons carry gig-specific pixel details',async()=>{
 const html=await render('available'); assert.match(html,/data-gig-ticket=/);assert.match(html,/public-ticket-actions.js/);assert.match(html,/Doors 19:30/);assert.match(html,/18\+/);
});
test('unavailable shows never render a ticket purchase button',async()=>{
 for(const status of ['sold_out','cancelled','postponed']){const html=await render(status);assert.doesNotMatch(html,/data-gig-ticket=/);assert.doesNotMatch(html,/href="https:\/\/tickets.example/);}
 assert.match(await render('cancelled'),/EventCancelled/);assert.match(await render('postponed'),/EventPostponed/);
});
test('show names cannot break HTML or tracking attributes',async()=>{
 const html=await render('available','"><script>alert(1)</script>');assert.doesNotMatch(html,/<script>alert/);assert.match(html,/&lt;script&gt;/);
});
