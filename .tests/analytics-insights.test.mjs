import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('assets/js/analytics-insights.js','utf8');
const {buildAnalytics,eventMetrics,analyticsDate,analyticsReports,matchesAnalyticsReport,compareAnalytics,buildCampaignLink,matchesAnalyticsSource,normalizePromotionMarkers}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('normalises cached and Firestore timestamps without treating missing dates as epoch',()=>{
  assert.equal(analyticsDate(null),null); assert.equal(analyticsDate({}),null);
  assert.equal(analyticsDate({seconds:100}).getTime(),100000);
  assert.equal(analyticsDate({_seconds:100}).getTime(),100000);
  assert.equal(analyticsDate({toDate:()=>new Date(100000)}).getTime(),100000);
});
test('manual actions count while automatic ticket redirects do not',()=>{
  assert.equal(eventMetrics({action:'ticket_redirect_continue',actionSubtype:'auto'}).tickets,false);
  assert.equal(eventMetrics({action:'ticket_redirect_continue',actionSubtype:'manual'}).tickets,true);
  assert.equal(eventMetrics({action:'click',section:'tickets'}).tickets,true);
  assert.equal(eventMetrics({action:'click',section:'Shows',label:'Glasgow'}).tickets,true);
  assert.equal(eventMetrics({action:'page_view',section:'tickets'}).tickets,false);
});
test('zero fills local calendar dates across year boundary and deduplicates sessions',()=>{
  const data=buildAnalytics([{action:'page_view',sessionId:'a',timestamp:'2025-12-31T12:00:00'},{action:'click',sessionId:'a',timestamp:'2026-01-02T12:00:00'}],{from:'2025-12-31',to:'2026-01-02'});
  assert.equal(data.sessions,1);assert.equal(data.bins.length,3);assert.equal(data.bins[1].views,0);assert.equal(data.bins[2].clicks,1);
});
test('source and page rankings measure views while campaign rankings measure clicks',()=>{
  const data=buildAnalytics([{action:'page_view',page:'/links',source:'instagram'},{action:'click',source:'instagram',label:'Spotify',campaign:'release'},{action:'email_signup',sessionId:'unknown'}]);
  assert.deepEqual(data.ranked.sources,[['instagram',1]]);assert.deepEqual(data.ranked.campaigns,[['release',1]]);
  assert.equal(data.totals.signups,1);assert.equal(data.sessions,0);assert.equal(data.undated,3);
});
test('empty and inverted ranges are explicit and long ranges stay bounded',()=>{
  assert.equal(buildAnalytics([]).bins.length,0);
  assert.equal(buildAnalytics([],{from:'2026-09-06',to:'2026-09-01'}).invalidRange,true);
  const data=buildAnalytics([],{from:'2020-01-01',to:'2026-09-06'});assert.ok(data.bins.length<=60);
});
test('unique clicks count sessions once and disclose missing session identifiers',()=>{
  const data=buildAnalytics([{action:'click',sessionId:'a'},{action:'click',sessionId:'a'},{action:'click',sessionId:'b'},{action:'click',sessionId:'unknown'},{action:'click'},{action:'page_view',sessionId:'c'}]);
  assert.equal(data.totals.clicks,5);assert.equal(data.uniqueClicks,2);assert.equal(data.untrackedClicks,2);
});
test('reports match exact release IDs and gig labels without leaking unrelated activity',()=>{
  const entries=[{action:'click',section:'Shows',label:'Glasgow'},{action:'page_view',campaignSlug:'death',campaign:'The Taste of Death'},{action:'click',campaign:'tour'}];
  assert.equal(analyticsReports(entries).length,3);
  assert.equal(matchesAnalyticsReport(entries[0],JSON.stringify(['gig','Glasgow'])),true);
  assert.equal(matchesAnalyticsReport({label:'Glasgow',section:'music'},JSON.stringify(['gig','Glasgow'])),false);
  assert.equal(matchesAnalyticsReport(entries[1],JSON.stringify(['release','death'])),true);
  assert.equal(matchesAnalyticsReport(entries[1],JSON.stringify(['release','dea'])),false);
  assert.equal(matchesAnalyticsReport(entries[1],'broken'),false);
});
test('comparison uses the adjacent equal calendar window with exclusive current boundary',()=>{
  const entries=['2026-03-27','2026-03-28','2026-03-29','2026-03-30'].map(date=>({action:'click',timestamp:date+'T12:00:00'}));
  const comparison=compareAnalytics(entries,'2026-03-30','2026-03-31');
  assert.equal(comparison.totals.clicks,2);assert.equal(comparison.count,2);
  assert.equal(compareAnalytics(entries,'',''),null);
  assert.equal(compareAnalytics(entries,'2026-04-01','2026-03-01'),null);
});
test('campaign links preserve destinations and safely replace legacy tracking aliases',()=>{
  const url=new URL(buildCampaignLink('https://example.com/tickets?id=abc&source=old&utm_medium=old#buy','instagram','social','Autumn & winter'));
  assert.equal(url.searchParams.get('id'),'abc');assert.equal(url.hash,'#buy');assert.equal(url.searchParams.has('source'),false);
  assert.equal(url.searchParams.get('utm_campaign'),'Autumn & winter');assert.equal(url.searchParams.get('utm_medium'),'social');
  assert.throws(()=>buildCampaignLink('javascript:alert(1)','a','b','c'));
  assert.throws(()=>buildCampaignLink('https://user:password@example.com','a','b','c'));
  assert.throws(()=>buildCampaignLink('https://example.com',' ','b','c'));
});

test('source filters match recorded sources or referring hosts without substring matches',()=>{
 assert.equal(matchesAnalyticsSource({source:'Instagram'},'instagram'),true);
 assert.equal(matchesAnalyticsSource({referrer:'https://facebook.com/post'},'facebook.com'),true);
 assert.equal(matchesAnalyticsSource({source:'instagram-ad'},'instagram'),false);
 assert.equal(matchesAnalyticsSource({},'direct / unrecorded'),true);
});
test('promotion markers validate calendar dates, trim labels and bound saved data',()=>{
 assert.deepEqual(normalizePromotionMarkers([{date:'2026-02-30',label:'Bad'},{date:'2026-09-01',label:' Launch '}]),[{date:'2026-09-01',label:'Launch'}]);
 assert.deepEqual(normalizePromotionMarkers(null),[]);
 assert.equal(normalizePromotionMarkers(Array.from({length:150},()=>({date:'2026-09-01',label:'A'}))).length,100);
});
