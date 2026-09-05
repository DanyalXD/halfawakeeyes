import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../assets/js/gig-tools.js', import.meta.url),'utf8');
const tools = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('legacy gigs remain available; unavailable statuses block ticket actions', () => {
  assert.equal(tools.canBuyTickets({}), true);
  for (const status of ['sold_out','cancelled','postponed']) assert.equal(tools.canBuyTickets({status}), false);
  assert.deepEqual(tools.normalizeGigDetails({status:'bogus',doorsTime:'27:00',ageRestriction:'  14+ '}), {status:'available',doorsTime:'',ageRestriction:'14+'});
  assert.equal(tools.gigDetailLabel({status:'sold_out',doorsTime:'19:30',ageRestriction:'18+'}), 'Sold out · Doors 19:30 · 18+');
});
test('campaign links preserve destinations and set distinct attribution', () => {
  const url = new URL(tools.campaignTrackingUrl('https://example.com/smartlink.html?keep=1','autumn','poster'));
  assert.equal(url.searchParams.get('campaign'),'autumn');
  assert.equal(url.searchParams.get('utm_source'),'poster');
  assert.equal(url.searchParams.get('utm_medium'),'qr');
  assert.equal(url.searchParams.get('keep'),'1');
});
test('comparison excludes auto redirects and separates the two weeks', () => {
  const now = Date.UTC(2026,8,5), day = 86400000;
  const result = tools.summarizeTraffic([
    {action:'click',section:'tickets',source:'instagram',timestamp:now-day},
    {action:'ticket_redirect_continue',actionSubtype:'auto',timestamp:now-day},
    {action:'ticket_redirect_continue',actionSubtype:'manual',source:'__proto__',timestamp:now-day},
    {action:'click',label:'Tickets',timestamp:now-8*day},
    {action:'click',label:'Tickets',timestamp:now-16*day}
  ], [{createdAt:now-2*day,source:'instagram'}],now);
  assert.deepEqual(result.clicks,[2,1]); assert.deepEqual(result.signups,[1,0]);
  assert.deepEqual(result.sources.instagram,{clicks:1,signups:1});
  assert.equal(result.sources.__proto__.clicks,1);
});
test('pixel calls are scoped by gig and disabled in local previews', async () => {
  const pixelSource = await readFile(new URL('../assets/js/ticket-pixels.js',import.meta.url),'utf8');
  const {trackGigPixel} = await import(`data:text/javascript;base64,${Buffer.from(pixelSource).toString('base64')}`);
  const calls=[]; globalThis.window={fbq:(...args)=>calls.push(args)};
  globalThis.location={hostname:'halfawakeeyes.co.uk',pathname:'/tickets/'};
  trackGigPixel({id:'a',metaPixelId:'123'}); trackGigPixel({id:'b',metaPixelId:'456'}); trackGigPixel({id:'a',metaPixelId:'123'});
  assert.equal(calls.filter(c=>c[0]==='init').length,2);
  assert.deepEqual(calls.filter(c=>c[0]==='trackSingleCustom').map(c=>c.slice(1,3)),[['123','GigTicketClick'],['456','GigTicketClick'],['123','GigTicketClick']]);
  location.hostname='localhost'; assert.equal(trackGigPixel({metaPixelId:'123'}),false);
  assert.equal(trackGigPixel({metaPixelId:'<script>'}),false);
  delete globalThis.window; delete globalThis.location;
});
