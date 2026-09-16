const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('functions/index.js','utf8');
const renderer=source.slice(source.indexOf('function escapePublicHtml'),source.indexOf('const IONOS_EMAIL'));
async function render(status,event='Test show',overrides={}) {
  const exports={};let html='';
  const gig={id:'test',date:'2099-10-01',event,venue:'Venue',city:'Glasgow',status,ticketUrl:'https://tickets.example/show',metaPixelId:'123',doorsTime:'19:30',ageRestriction:'18+',...overrides};
  vm.runInNewContext(renderer,{exports,onRequest:(_,fn)=>fn,db:{doc:path=>{assert.equal(path,'gigs/test');return {get:async()=>({exists:true,data:()=>gig})};}},ADMIN_SITE_URL:'https://halfawakeeyes.co.uk',URL});
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
test('gig page shows artwork, pricing, canonical social URL and view tracking',async()=>{
 const html=await render('available','Autumn show',{imageUrl:'https://example.com/poster.jpg',ticketPrice:'12.50',doorPrice:'15',ticketPriceIncludesFee:true,autoRedirect:true});
 assert.match(html,/class="gig-artwork" src="https:\/\/example.com\/poster.jpg"/);
 assert.match(html,/Advance .*12\.50 \(includes booking fee\)/);
 assert.match(html,/On the door .*15\.00/);
 assert.match(html,/property="og:url" content="https:\/\/halfawakeeyes.co.uk\/shows\/test"/);
 assert.match(html,/data-gig-page=/);
 assert.doesNotMatch(html,/location.replace|http-equiv="refresh"/);
});
test('past gigs retain their details without selling tickets',async()=>{
 const html=await render('available','Past show',{date:'2020-01-01'});
 assert.match(html,/This show has ended/);assert.match(html,/Past show/);
 assert.doesNotMatch(html,/data-gig-ticket=/);
});
test('missing ticket links and hidden gigs have no purchase actions',async()=>{
 assert.match(await render('available','Future show',{ticketUrl:''}),/Ticket information will be announced soon/);
 assert.match(await render('available','Hidden show',{hideFromLinks:true}),/Show not found/);
 assert.doesNotMatch(await render('available','Unsafe URL',{ticketUrl:'javascript:alert(1)'}),/data-gig-ticket=/);
});
test('ad pages have focused copy and a mobile action only when tickets are available',async()=>{
 const html=await render('available');
 assert.match(html,/With Half Awake Eyes/);
 assert.match(html,/>Get tickets<\/a>/);
 assert.match(html,/id="gig-sticky-action" hidden/);
 assert.doesNotMatch(html,/href="\/tickets\/"/);
 for(const status of ['sold_out','cancelled','postponed']) {
   assert.doesNotMatch(await render(status),/id="gig-sticky-action"/);
 }
 assert.doesNotMatch(await render('available','Past show',{date:'2020-01-01'}),/id="gig-sticky-action"/);
});
test('poster themes are opt-in, validated and choose contrasting button text',async()=>{
 assert.doesNotMatch(await render('available','Standard',{posterAccent:'#ccaa66'}),/--gig-accent:/);
 const light=await render('available','Light',{matchPosterColors:true,posterAccent:'#ccaa66'});
 assert.match(light,/--gig-accent:#ccaa66/);assert.match(light,/--gig-button-text:#000000/);
 const dark=await render('available','Dark',{matchPosterColors:true,posterAccent:'#ccaa66',posterAccentOverride:'#112233'});
 assert.match(dark,/--gig-accent:#112233/);assert.match(dark,/--gig-button-text:#ffffff/);
 assert.doesNotMatch(await render('available','Invalid',{matchPosterColors:true,posterAccent:'#fff;display:none'}),/--gig-accent:/);
});
test('full poster themes keep headings readable on light and dark backgrounds',async()=>{
 const luminance=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 for(const background of ['#ffffff','#080a0c','#888888']){
   const html=await render('available','Full palette',{matchPosterColors:true,posterAccent:'#d4b97d',posterBackground:background});
   assert.ok(html.includes('--gig-background:'+background));
   for(const token of ['heading','text','muted']){
     const color=html.match(new RegExp('--gig-'+token+':(#[a-f0-9]{6})'))[1];
     const a=luminance(color),b=luminance(background);
     assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,token+' contrast');
   }
 }
});
