import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
const source = fs.readFileSync('assets/js/public-site-utils.js', 'utf8');
const utils = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('explicit opt-out creates no identifier, storage or analytics traffic', async () => {
  let accesses = 0, writes = 0;
  globalThis.sessionStorage = {getItem: () => { accesses++; return null; }, setItem: () => accesses++};
  globalThis.localStorage = {getItem: () => JSON.stringify({analytics:false})};
  globalThis.window = {location: {search: '', href: 'https://halfawakeeyes.co.uk/'}};
  globalThis.document = {referrer: ''};
  const client = utils.createSiteAnalytics({pagePath: '/', setDoc: async () => writes++, doc: () => ({})});
  await client.logPageViewOnce(); await client.logEvent('click');
  assert.equal(accesses, 0); assert.equal(writes, 0); assert.equal(client.sessionId, '');
});
test('tracking parameters discard recipient identifiers', () => {
  const params = utils.getTrackingParams(new URLSearchParams('id=person@example.com&utm_source=instagram'));
  assert.equal(Object.hasOwn(params, 'userId'), false);
  assert.equal(params.source, 'instagram');
});
function browser(analytics = true) {
  const values = new Map([['hae-privacy-choice', JSON.stringify({version:'2026-10-07', savedAt:Date.now(), analytics, marketing:false})]]);
  const storage = {getItem:key=>values.get(key) ?? null, setItem:(key,value)=>values.set(key,value), removeItem:key=>values.delete(key)};
  Object.defineProperty(globalThis,'crypto',{value:webcrypto, configurable:true});
  Object.defineProperty(globalThis,'navigator',{value:{userAgent:'Mozilla Windows Chrome/120.0', doNotTrack:'0'}, configurable:true});
  globalThis.localStorage = storage; globalThis.sessionStorage = storage;
  globalThis.window = {location:{search:'',href:'https://halfawakeeyes.co.uk/'}};
  globalThis.document = {referrer:'https://social.example/post?email=fan@example.com#private'};
  return values;
}
test('statistical payload minimises URLs and identifiers while retaining coarse dimensions', async () => {
  browser(); const writes=[];
  const client=utils.createSiteAnalytics({pagePath:'/links',pageName:'Links',doc:(_db,collection,id)=>({collection,id}),setDoc:async(ref,data)=>writes.push({ref,data}),
    getContext:()=>({userId:'fan@example.com',source:'instagram',campaign:'fan@example.com'})});
  await client.logEvent('click',{href:'https://tickets.example/order?token=secret#buy',label:'fan@example.com',target:'1234567890'});
  assert.equal(writes.length,1);
  const {ref,data}=writes[0];
  assert.equal(data.href,'https://tickets.example'); assert.equal(data.referrer,'https://social.example');
  assert.equal(data.label,''); assert.equal(data.target,''); assert.equal(data.campaign,'');
  assert.equal(data.browser,'Chrome'); assert.equal(data.os,'Windows'); assert.equal(data.device,'desktop');
  assert.ok(Math.abs(data.expiresAt.getTime()-data.timestamp.getTime()-2*60*60000)<10);
  assert.match(ref.id,/^[a-f0-9-]{36}$/); assert.doesNotMatch(JSON.stringify(writes),/fan@|secret|viewport|userId|Chrome\/120/);
});
test('session rotates after inactivity and a consent refusal blocks later events', async () => {
  const values=browser(); const first=utils.getSessionId();
  const session=JSON.parse(values.get('hae-analytics-session-v3'));
  session.lastAt=Date.now()-30*60000; values.set('hae-analytics-session-v3',JSON.stringify(session));
  assert.notEqual(utils.getSessionId(),first);
  values.set('hae-privacy-choice',JSON.stringify({version:'2026-10-07',savedAt:Date.now(),analytics:false,marketing:true}));
  assert.equal(utils.getSessionId(),''); assert.equal(utils.hasTrackingConsent(),false); assert.equal(utils.hasTrackingConsent('marketing'),true);
});
test('expired choices and browser privacy signals fail closed', () => {
  const values=browser(); assert.equal(utils.hasTrackingConsent(),true);
  values.set('hae-privacy-choice',JSON.stringify({version:'2026-10-07',savedAt:Date.now()-181*86400000,analytics:true}));
  assert.equal(utils.hasTrackingConsent(),true); assert.equal(utils.hasTrackingConsent('marketing'),false);
  browser(); navigator.globalPrivacyControl=true; assert.equal(utils.hasTrackingConsent(),false);
  browser(); navigator.doNotTrack='1'; assert.equal(utils.hasTrackingConsent(),false);
});

test('no preference enables statistics and does not enable Meta', async () => {
  const values=browser(); values.delete('hae-privacy-choice'); let writes=0;
  const client=utils.createSiteAnalytics({pagePath:'/privacy',doc:()=>({}),setDoc:async()=>writes++});
  await client.logPageViewOnce(); assert.equal(writes,1);
  assert.equal(utils.hasTrackingConsent('marketing'),false);
  assert.equal(values.has('hae-visitor-id'),false);
});
test('previous explicit objections survive expired and old preference versions',()=>{
  const values=browser();
  for (const version of ['2026-10-07','old-version',undefined]) {
    values.set('hae-privacy-choice',JSON.stringify({version,savedAt:0,analytics:false,marketing:true}));
    assert.equal(utils.hasTrackingConsent(),false); assert.equal(utils.getSessionId(),'');
    assert.equal(utils.hasTrackingConsent('marketing'),false);
  }
});
test('session is bounded to one hour even with continuous activity',()=>{
  const values=browser(); const first=utils.getSessionId();
  const session=JSON.parse(values.get('hae-analytics-session-v3')); session.startedAt=Date.now()-60*60000;
  values.set('hae-analytics-session-v3',JSON.stringify(session)); assert.notEqual(utils.getSessionId(),first);
});
test('opt-out is immediate, persists, and marketing changes preserve analytics',async()=>{
  const values=browser(); globalThis.CustomEvent=class {}; utils.getSessionId();
  utils.saveTrackingConsent({analytics:false}); assert.equal(utils.getSessionId(),'');
  assert.equal(values.has('hae-analytics-session-v3'),false);
  utils.saveTrackingConsent({marketing:true}); assert.equal(utils.hasTrackingConsent(),false);
  assert.equal(utils.hasTrackingConsent('marketing'),true);
  assert.equal(JSON.parse(values.get('hae-privacy-choice')).analytics,false);
  const reloaded=await import('data:text/javascript;base64,'+Buffer.from(source+'\n// reload').toString('base64'));
  assert.equal(reloaded.getSessionId(),'');
});

test('analytics-only changes do not extend an existing marketing consent',()=>{
 const values=browser();globalThis.CustomEvent=class {};
 const savedAt=Date.now()-100*86400000;
 values.set('hae-privacy-choice',JSON.stringify({version:'2026-10-07',analytics:true,marketing:true,savedAt}));
 utils.saveTrackingConsent({analytics:false});
 assert.equal(JSON.parse(values.get('hae-privacy-choice')).marketingSavedAt,savedAt);
 assert.equal(utils.hasTrackingConsent('marketing'),true);
});
test('storage failure still applies the objection immediately',()=>{
 browser();globalThis.CustomEvent=class {};
 localStorage.setItem=()=>{throw Error('Storage blocked');};
 assert.equal(utils.saveTrackingConsent({analytics:false}),false);
 assert.equal(utils.hasTrackingConsent(),false);assert.equal(utils.getSessionId(),'');
});

test('recognised routes discard queries and fragments, and token-like paths are discarded',()=>{
 assert.equal(utils.analyticsPage('/links?email=fan@example.test#private'),'/links');
 assert.equal(utils.analyticsPage('/shows/1234567890/'),'/other');
 assert.equal(utils.analyticsPage('/smartlink/abcdef0123456789abcdef0123456789/'),'/other');
 assert.equal(utils.analyticsPage('/shows/YWm5A0ZIUh1UBYqoDMVk/'),'/shows/YWm5A0ZIUh1UBYqoDMVk/');
});

test('session timers clear expired storage and never reuse the previous session key',async()=>{
 const values=browser();values.set('hae-analytics-session-v2','unused-old-id');let pending;
 window.setTimeout=(callback,delay)=>{pending={callback,delay};return 1;};window.clearTimeout=()=>{};
 const fresh=await import('data:text/javascript;base64,'+Buffer.from(source+'\n// expiry test').toString('base64'));
 fresh.getSessionId();assert.equal(values.has('hae-analytics-session-v2'),false);assert.ok(pending.delay<=30*60000);
 const state=JSON.parse(values.get('hae-analytics-session-v3'));state.startedAt=Date.now()-60*60000+100;
 values.set('hae-analytics-session-v3',JSON.stringify(state));fresh.getSessionId();assert.ok(pending.delay<=100);pending.callback();assert.equal(values.has('hae-analytics-session-v3'),false);
});
