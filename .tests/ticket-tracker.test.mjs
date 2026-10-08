import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../assets/js/ticket-tracker.js', import.meta.url), 'utf8');
const {validateTracker, summarizeTracker, ticketAmounts, saveTracker} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const settings = {price:2250, promoter:1600, capacity:30, feeBps:250};
const row = (name, method='sumup', status='pending') => ({id:name || 'blank', name, method, status, transactionRef:'', payoutRef:'', notes:''});
test('ticket price drives splits; fees round per ticket; blank names are excluded', () => {
  const totals = summarizeTracker({settings, tickets:[row('Andrea'),row('Mark','bank','paid'),row('Corrie','sumup','paid'),row('')]});
  assert.equal(totals.count,3); assert.equal(totals.value,6750);
  assert.equal(totals.paid,4500); assert.equal(totals.pending,2250);
  assert.equal(totals.fees,112); assert.equal(totals.ours,1950);
  assert.equal(totals.net,1838); assert.equal(totals.promoter,4800);
  assert.equal(totals.paidPromoter,3200); assert.equal(totals.sumupNet,2194);
  assert.deepEqual(ticketAmounts(settings,row('A')), {value:2250,fee:56,ours:650,net:594,promoter:1600});
});
test('reject invalid money, over-capacity, duplicate IDs and unsupported values', () => {
  const valid = {settings,tickets:[row('A')]};
  assert.deepEqual(validateTracker(valid),valid);
  for (const patch of [{price:22.5},{promoter:2251},{capacity:-1},{feeBps:10001},{price:NaN}]) assert.throws(()=>validateTracker({...valid,settings:{...settings,...patch}}));
  assert.throws(()=>validateTracker({...valid,settings:{...settings,capacity:0}}));
  assert.throws(()=>validateTracker({...valid,tickets:[row('A'),row('A')]}));
  assert.throws(()=>validateTracker({...valid,tickets:[{...row('A'),status:'refunded'}]}));
  assert.throws(()=>validateTracker({...valid,tickets:[{...row('A'),method:'crypto'}]}));
  assert.throws(()=>validateTracker({...valid,tickets:[{...row('A'),name:'A'.repeat(201)}]}));
});
test('cash and bank have no fee; empty tracker has zero totals', () => {
  assert.equal(ticketAmounts(settings,row('A','cash')).fee,0);
  assert.equal(summarizeTracker({settings,tickets:[]}).net,0);
  assert.equal(summarizeTracker({settings,tickets:[row('   ')]}).count,0);
});
test('save checks gig existence and revision before committing; stale edits cannot overwrite', async () => {
  const records = new Map([['gigs/show-1',{}]]);
  const api={db:{},doc:(_db,collection,id)=>`${collection}/${id}`,runTransaction:async (_db,action)=>action({get:async ref=>({exists:()=>records.has(ref),data:()=>records.get(ref)}),set:(ref,value)=>records.set(ref,value)})};
  const value={settings,tickets:[row('A')]};
  assert.equal(await saveTracker(api,'show-1',value,0),1);
  await assert.rejects(saveTracker(api,'show-1',{...value,tickets:[]},0),/Another admin/);
  assert.equal(records.get('admin-ticket-trackers/show-1').tickets.length,1);
  assert.equal(await saveTracker(api,'show-1',value,1),2);
  records.delete('gigs/show-1');
  await assert.rejects(saveTracker(api,'show-1',value,2),/no longer exists/);
  assert.equal(records.get('admin-ticket-trackers/show-1').revision,2);
});
test('SumUp references stay attached only to SumUp rows; negative band net stays visible', () => {
  assert.throws(()=>validateTracker({settings,tickets:[{...row('A','cash'),payoutRef:'P123'}]}),/SumUp/);
  assert.equal(ticketAmounts({...settings,promoter:2250},row('A')).net,-56);
});
