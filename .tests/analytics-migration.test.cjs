const test=require('node:test'),assert=require('node:assert/strict');
const {migrateAnalytics}=require('../functions/scripts/migrate-analytics.cjs');const {database}=require('./analytics-db.cjs');
const now=Date.now();const seed=()=>({'site-actions':{'email-in-document-id':{action:'page_view',page:'/links',sessionId:'private-session',userId:'fan@example.com',timestamp:new Date(now-86400000)},expired:{timestamp:new Date(now-91*86400000)},undated:{},'old-schema':{consentVersion:'2026-10-07'},'new-statistics':{statisticsVersion:'2026-10-07',timestamp:new Date(now)}},'ad-tracking':{'legacy-ad':{timestamp:new Date(now)}}});
test('legacy migration dry-run does not write',async()=>{
 const db=database(seed());const result=await migrateAnalytics(db,{now});assert.deepEqual(result,{retained:1,removed:4,unchanged:1,applied:false});assert.equal(db.writes.length,0);
});
test('migration saves only daily historical counts and deletes legacy identities atomically',async()=>{
 const db=database(seed());await migrateAnalytics(db,{now,apply:true});const rows=[...db.rows].filter(([key])=>key.startsWith('analytics-daily/'));
 assert.ok(rows.length>1);const total=rows.find(([,data])=>data.kind==='total')[1];assert.equal(total.views,1);assert.equal(total.schemaVersion,3);assert.equal(total.sessions,undefined);
 assert.doesNotMatch(JSON.stringify(rows),/email-in-document-id|private-session|fan@|sessionId|userId/);
 assert.equal(db.rows.has('site-actions/email-in-document-id'),false);assert.equal(db.rows.has('site-actions/new-statistics'),true);assert.equal(db.rows.has('ad-tracking/legacy-ad'),false);
 const again=await migrateAnalytics(db,{now,apply:true});assert.equal(again.retained,0);assert.equal([...db.rows.values()].find(data=>data.kind==='total').views,1);
 assert.equal(total.expiresAt.getTime(),Date.parse(total.timestamp)+90*86400000);
});
test('failed historical aggregation is recoverable without duplicated totals',async()=>{
 const db=database(seed());db.failCommit=true;await assert.rejects(migrateAnalytics(db,{now,apply:true}));assert.equal(db.rows.has('site-actions/email-in-document-id'),true);
 db.failCommit=false;await migrateAnalytics(db,{now,apply:true});assert.equal([...db.rows.values()].find(data=>data.kind==='total').views,1);
});

test('historical migration paginates deleted records and remains idempotent',async()=>{
 const rows=Object.fromEntries(Array.from({length:83},(_,i)=>[String(i).padStart(3,'0'),{action:'page_view',page:'/links',timestamp:new Date(now-86400000)}]));
 const db=database({'site-actions':rows});await migrateAnalytics(db,{now,apply:true});assert.equal([...db.rows.values()].find(e=>e.kind==='total').views,83);assert.equal([...db.rows.keys()].filter(key=>key.startsWith('site-actions/')).length,0);
 await migrateAnalytics(db,{now,apply:true});assert.equal([...db.rows.values()].find(e=>e.kind==='total').views,83);
});
