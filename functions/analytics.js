'use strict';

const crypto = require('node:crypto');
const RETENTION_DAYS = 90;
const millis = value => value?.toMillis?.() ?? (value?.seconds != null ? value.seconds * 1000 : new Date(value).getTime());
const text = value => {
  const raw = String(value || '').trim();
  return /@|https?:|\d{7,}|[a-f0-9]{24,}|[a-z0-9_-]{40,}/i.test(raw) ? '' : raw.replace(/[^a-zA-Z0-9 _.,!()'&+-]/g, '').slice(0,100);
};
const origin = value => {
  try {const url = new URL(value); return ['http:','https:'].includes(url.protocol) && !url.username && !url.password && /^https?:\/\/[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z0-9-]+)+$/.test(url.origin) ? url.origin : '';} catch {return '';}
};
const page = value => !/\d{7,}|[a-f0-9]{24,}|[a-z0-9_-]{40,}/i.test(value || '') && /^\/(?:|(?:index|links|tickets|smartlink|privacy|epk)(?:\.html)?\/?|(?:join|join-us|store|shows|live-dates)\/?|(?:shows|smartlink)\/[a-zA-Z0-9_-]{1,60}\/?|404\.html|other)$/.test(value || '') ? value : '/other';
const actions = new Set(['page_view','click','email_signup','video_play','ticket_redirect_continue','ticket_redirect_unavailable','page_exit']);

function sanitiseLegacyEvent(data) {
  const result = {action: actions.has(data.action) ? data.action : '', page: page(data.page),
    href: origin(data.href), referrer: origin(data.referrer), outbound: data.outbound === true};
  for (const key of ['pageName','target','label','elementType','actionSubtype','platform','section','campaign','campaignSlug','source','medium']) result[key] = text(data[key]);
  result.browser = ['Chrome','Firefox','Safari','Edge'].includes(data.browser) ? data.browser : 'Other';
  result.os = ['Windows','macOS','Linux','Android','iOS'].includes(data.os) ? data.os : 'Other';
  result.device = ['mobile','desktop','tablet'].includes(data.device) ? data.device : 'unknown';
  result.durationSeconds = Math.max(0, Math.min(1800, Math.round(Number(data.durationSeconds) || 0)));
  result.timestamp = Number.isFinite(millis(data.timestamp)) ? new Date(millis(data.timestamp)) : null;
  return result;
}

// Each bucket contains a date and ONE breakdown. No source/page/device cross-products.
const RAW_RETENTION_MS = 2 * 60 * 60000;
const SESSION_IDLE_MS = 30 * 60000;
const MIN_BREAKDOWN_COUNT = 5;
const day = timestamp => new Date(millis(timestamp)).toISOString().slice(0,10) + 'T00:00:00.000Z';
function trafficSource(event) {
  const source = event.source.toLowerCase();
  if (/^(email|newsletter|mail)$/.test(source) || event.medium.toLowerCase() === 'email') return 'Email campaign';
  const known = {google:'Google',bing:'Bing',instagram:'Instagram',facebook:'Facebook',spotify:'Spotify'};
  if (known[source]) return known[source];
  let host = ''; try { host = new URL(event.referrer).hostname.toLowerCase(); } catch {}
  for (const [name,label] of Object.entries(known)) if (host === name + '.com' || host.endsWith('.' + name + '.com') || name === 'google' && /^([a-z]+\.)?google\.[a-z.]+$/.test(host)) return label;
  return source || host ? 'Other referral' : 'Direct';
}
function eventCounts(event) {
  const redirect = event.action === 'ticket_redirect_continue' && event.actionSubtype !== 'auto';
  const click = event.action === 'click' || redirect;
  return {count:Number(event.action !== 'page_exit'), views:Number(event.action === 'page_view'), clicks:Number(click),
    tickets:Number(redirect || event.action === 'click' && (/ticket/i.test(event.section + ' ' + event.label) || event.section === 'Shows')),
    signups:Number(event.action === 'email_signup'), outboundClicks:Number(click && event.outbound)};
}
function aggregateAnalytics(records, {includeEvents=true, includeSessions=true}={}) {
  const buckets = new Map(), sessions = new Map();
  const add = (timestamp, kind, value, counts) => {
    const key = JSON.stringify([timestamp,kind,value]);
    if (!buckets.has(key)) buckets.set(key, {id:crypto.createHash('sha256').update(key).digest('hex'), timestamp, kind, value, count:0});
    const bucket=buckets.get(key);
    for (const [field,amount] of Object.entries(counts)) bucket[field]=(bucket[field] || 0)+amount;
  };
  for (const raw of records) {
    const event=sanitiseLegacyEvent(raw); if (!event.timestamp || !event.action) continue;
    const timestamp=day(event.timestamp), counts=eventCounts(event);
    if (includeEvents && raw.analyticsCounted !== true && counts.count) {
      add(timestamp,'total','',counts);
      add(timestamp,'event',event.action,counts);
      add(timestamp,'page',event.page,counts);
      add(timestamp,'source',trafficSource(event),counts);
      const campaign=event.campaignSlug || event.campaign;
      if (campaign) add(timestamp,'campaign',campaign,counts);
      if (counts.clicks) add(timestamp,'link',event.label || event.href || 'Unlabelled link',counts);
      if (counts.views) for (const kind of ['browser','os','device']) add(timestamp,kind,event[kind],{count:1,views:1});
    }
    if (includeSessions && raw.sessionId) {
      if (!sessions.has(raw.sessionId)) sessions.set(raw.sessionId,[]);
      sessions.get(raw.sessionId).push(event);
    }
  }
  for (const events of sessions.values()) {
    events.sort((a,b)=>a.timestamp-b.timestamp);
    const views=events.filter(e=>e.action==='page_view'); if (!views.length) continue;
    const timestamp=day(views[0].timestamp);
    add(timestamp,'total','',{sessions:1,clickingSessions:Number(events.some(e=>eventCounts(e).clicks)),bounces:Number(views.length===1),
      sessionSeconds:Math.min(3600,Math.max(0,(events.at(-1).timestamp-events[0].timestamp)/1000))});
    add(timestamp,'entry',views[0].page,{count:1}); add(timestamp,'exit',views.at(-1).page,{count:1});
    for(let i=1;i<views.length;i++) add(day(views[i].timestamp),'navigation',views[i-1].page+' -> '+views[i].page,{count:1});
  }
  return [...buckets.values()];
}
const aggregateKinds = new Set(['total','event','page','source','campaign','link','browser','os','device','entry','exit','navigation']);
const counterFields = ['count','views','clicks','tickets','signups','outboundClicks','sessions','clickingSessions','bounces','sessionSeconds'];
function publicAggregates(records, now=Date.now()) {
  return records.flatMap(raw=>{
    if (!aggregateKinds.has(raw.kind) || typeof raw.timestamp!=='string' || !/^\d{4}-\d{2}-\d{2}T00:00:00.000Z$/.test(raw.timestamp)) return [];
    const stamp=Date.parse(raw.timestamp); if (!Number.isFinite(stamp) || stamp < now-RETENTION_DAYS*86400000 || stamp>now) return [];
    if (raw.kind !== 'total' && !(raw.count >= MIN_BREAKDOWN_COUNT)) return [];
    const result={kind:raw.kind,timestamp:raw.timestamp,value:String(raw.value || '')};
    for (const field of counterFields) if (Number.isFinite(raw[field]) && raw[field]>=0) result[field]=raw[field];
    if (raw.kind==='total' && !(raw.sessions>=MIN_BREAKDOWN_COUNT)) for (const field of ['sessions','clickingSessions','bounces','sessionSeconds']) delete result[field];
    return [result];
  });
}
async function writeBuckets(db, transaction, buckets) {
  const refs=buckets.map(bucket=>db.collection('analytics-daily').doc(bucket.id));
  const previous=await Promise.all(refs.map(ref=>transaction.get(ref)));
  buckets.forEach((bucket,index)=>{
    const {id,...data}=bucket, old=previous[index].exists ? previous[index].data() : {};
    for(const field of counterFields) if (field in data || field in old) data[field]=(data[field] || 0)+(old[field] || 0);
    data.schemaVersion=3; data.expiresAt=new Date(Date.parse(data.timestamp)+RETENTION_DAYS*86400000);
    transaction.set(refs[index],data);
  });
  // This admin-only signal contains no visitor data or unsuppressed breakdowns.
  if (buckets.length) transaction.set(db.collection('analytics-status').doc('current'),{revision:crypto.randomUUID()});
}
function retained(record, now) {
  const stamp=millis(record.timestamp); return stamp>=now-RETENTION_DAYS*86400000 && stamp<=now;
}
async function countAnalyticsEvent(db, ref, now=Date.now()) {
  return db.runTransaction(async transaction=>{
    const snapshot=await transaction.get(ref);
    if (!snapshot.exists || snapshot.data().analyticsCounted===true) return false;
    const record=snapshot.data();
    await writeBuckets(db,transaction,aggregateAnalytics(retained(record,now)?[record]:[],{includeSessions:false}));
    transaction.set(ref,{...record,analyticsCounted:true});
    return true;
  });
}
// The marker, counters and final deletion are transactional, including races with the live trigger.
async function storeAndDelete(db, docs, {now=Date.now(), historical=false}={}) {
  if (!docs.length) return false;
  return db.runTransaction(async transaction=>{
    const snapshots=await Promise.all(docs.map(doc=>transaction.get(doc.ref)));
    const current=snapshots.filter(doc=>doc.exists);
    if (!current.length) return false;
    const records=current.map(doc=>historical ? {...sanitiseLegacyEvent(doc.data()),analyticsCounted:doc.data().analyticsCounted===true} : doc.data());
    if (!historical && records.some(record=>millis(record.timestamp)>now-SESSION_IDLE_MS)) return false;
    await writeBuckets(db,transaction,aggregateAnalytics(records.filter(record=>retained(record,now))));
    current.forEach(doc=>transaction.delete(doc.ref)); return true;
  });
}
async function processAnalytics(db, now=Date.now()) {
  const groups=new Map(); let scanned=0;
  let query=db.collection('site-actions').orderBy('timestamp').limit(1000);
  while(true) {
    const snapshot=await query.get(); scanned+=snapshot.size;
    if(scanned>20000) throw new Error('Analytics processing capacity exceeded');
    for(const doc of snapshot.docs) {
      const raw=doc.data(); const key=raw.sessionId || doc.id;
      if (!groups.has(key)) groups.set(key,[]); groups.get(key).push(doc);
    }
    if(snapshot.size<1000) break; query=query.startAfter(snapshot.docs.at(-1));
  }
  let processed=0;
  for(const docs of groups.values()) {
    if(docs.some(doc=>millis(doc.data().timestamp)>now-SESSION_IDLE_MS) || docs.length>40) {
      // Recovery for missed triggers; fresh visits need not wait for session finalization.
      for(const doc of docs) if(doc.data().analyticsCounted!==true) await countAnalyticsEvent(db,doc.ref,now);
      continue;
    }
    // Honest clients send at most 40 events; oversized hostile sessions are dropped by expiry cleanup.
    if(await storeAndDelete(db,docs,{now})) processed++;
  }
  return processed;
}
function buildAnalyticsFunctions(db, assertAdmin) {
  const {onCall,HttpsError}=require('firebase-functions/v2/https');
  const {onSchedule}=require('firebase-functions/v2/scheduler');
  const {onDocumentCreated}=require('firebase-functions/v2/firestore');
  const {Timestamp}=require('firebase-admin/firestore');
  const getAdminAnalytics=onCall({region:'us-central1',maxInstances:2,timeoutSeconds:120,memory:'512MiB'},async request=>{
    assertAdmin(request);
    let query=db.collection('analytics-daily').where('timestamp','>=',new Date(Date.now()-RETENTION_DAYS*86400000).toISOString()).orderBy('timestamp').limit(1000);
    const entries=[]; let scanned=0;
    while(true) {
      const snapshot=await query.get(); scanned+=snapshot.size;
      if(scanned>50000) throw new HttpsError('resource-exhausted','The analytics report exceeds its size limit.');
      entries.push(...snapshot.docs.map(doc=>doc.data()));
      if(snapshot.size<1000) break; query=query.startAfter(snapshot.docs.at(-1));
    }
    return {entries:publicAggregates(entries),retentionDays:RETENTION_DAYS,rawRetentionHours:2,aggregated:true};
  });
  const aggregateSiteAnalytics=onSchedule({schedule:'every 15 minutes',region:'us-central1',timeoutSeconds:540,memory:'512MiB',maxInstances:1},async()=>processAnalytics(db));
  const countSiteAnalytics=onDocumentCreated({document:'site-actions/{eventId}',region:'us-central1',retry:true,maxInstances:2},async event=>{
    if(event.data) await countAnalyticsEvent(db,event.data.ref);
  });
  const cleanupAnalytics=onSchedule({schedule:'every 15 minutes',region:'us-central1',timeoutSeconds:540,maxInstances:1},async()=>{
    await processAnalytics(db);
    for(const name of ['site-actions','ad-tracking','analytics-daily']) {
      const cutoff=Timestamp.fromMillis(Date.now()-(name==='analytics-daily'?RETENTION_DAYS*86400000:RAW_RETENTION_MS));
      for(const [field,before] of [['expiresAt',Timestamp.now()], ...(name==='analytics-daily'?[]:[['timestamp',cutoff]])]) {
        while(true) {
          const snapshot=await db.collection(name).where(field,'<=',before).limit(400).get();
          if(snapshot.empty) break;
          const batch=db.batch(); snapshot.docs.forEach(doc=>batch.delete(doc.ref)); await batch.commit();
        }
      }
    }
  });
  return {getAdminAnalytics,countSiteAnalytics,aggregateSiteAnalytics,cleanupAnalytics};
}
module.exports={RETENTION_DAYS,RAW_RETENTION_MS,MIN_BREAKDOWN_COUNT,sanitiseLegacyEvent,aggregateAnalytics,publicAggregates,countAnalyticsEvent,storeAndDelete,processAnalytics,buildAnalyticsFunctions};
