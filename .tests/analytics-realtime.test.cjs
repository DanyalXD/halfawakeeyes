const test=require('node:test'),assert=require('node:assert/strict');
const {countAnalyticsEvent,processAnalytics}=require('../functions/analytics');
const {database}=require('./analytics-db.cjs');
const now=Date.now();
const event={action:'page_view',page:'/links',sessionId:'temporary',timestamp:new Date(now)};
test('fresh events count immediately, retries and finalization never count them twice',async()=>{
  const db=database({'site-actions':{view:event,click:{...event,action:'click'}}});
  const ref=db.collection('site-actions').doc('view');
  assert.equal(await countAnalyticsEvent(db,ref,now),true);
  assert.equal(await countAnalyticsEvent(db,ref,now),false);
  assert.equal([...db.rows.values()].find(r=>r.kind==='total').views,1);
  await processAnalytics(db,now);
  let total=[...db.rows.values()].find(r=>r.kind==='total');
  assert.equal(total.views,1);assert.equal(total.clicks,1);assert.equal(total.sessions,undefined);
  assert.ok(db.rows.has('analytics-status/current'));
  await processAnalytics(db,now+31*60000);
  total=[...db.rows.values()].find(r=>r.kind==='total');
  assert.equal(total.views,1);assert.equal(total.clicks,1);assert.equal(total.sessions,1);
  assert.equal(db.rows.has(ref.path),false);
  assert.equal(await countAnalyticsEvent(db,ref,now),false);
});
test('failed live aggregation leaves both marker and totals uncommitted',async()=>{
  const db=database({'site-actions':{view:event}});db.failCommit=true;
  await assert.rejects(countAnalyticsEvent(db,db.collection('site-actions').doc('view'),now));
  assert.equal(db.rows.size,1);assert.equal(db.rows.get('site-actions/view').analyticsCounted,undefined);
});
