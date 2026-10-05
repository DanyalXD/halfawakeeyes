const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class HttpsError extends Error { constructor(code,message) { super(message); this.code=code; } }
function harness(respond, secrets = {SUMUP_API_KEY:'test-secret', SUMUP_MERCHANT_CODE:'M1234567'}) {
  const module = {exports:{}}; const calls = []; const records=new Map(); let queue=Promise.resolve();
  const db={collection:()=>({doc:id=>({id,update:async data=>records.set(id,{...records.get(id),...data})})}),runTransaction:fn=>{const next=queue.then(()=>fn({get:async ref=>({data:()=>records.get(ref.id)}),set:(ref,data)=>records.set(ref.id,data)}));queue=next.catch(()=>{});return next;}};
  vm.runInNewContext(fs.readFileSync('functions/sumup.js','utf8'), {module, URLSearchParams, AbortSignal,
    fetch:async (url,options) => {calls.push({url,options}); return respond(url,options);},
    require:name => ({'firebase-functions/v2/https':{onCall:(_,fn)=>fn,HttpsError},'firebase-functions/params':{defineSecret:name=>({value:()=>secrets[name]})},'firebase-admin/firestore':{getFirestore:()=>db}}[name])});
  const handlers=module.exports(request => {if(request.auth?.admin !== true) throw new HttpsError('permission-denied','Admin required');});
  return {calls,records,read:handlers.getAdminStorePayments,detail:handlers.getAdminStorePayment,refund:handlers.refundAdminStorePayment};
}
test('payment history requires admin before any network access', async () => {
  const h=harness(()=>{throw Error('Must not fetch');});
  await assert.rejects(h.read({auth:{admin:false}}),{code:'permission-denied'}); assert.equal(h.calls.length,0);
});
test('reports only allowlisted fields, fixed merchant and bounded results',async()=>{
  const h=harness(url=>({ok:true,json:async()=>url.includes('/payouts?') ? [{date:'2026-10-01',amount:18,reference:'P1',bank_account:'private'}] : {items:Array(60).fill({amount:20,transaction_code:'T1',card:{last_4_digits:'1234'},user:'private'})}}));
  const result=await h.read({auth:{admin:true},data:{merchantCode:'OTHER',url:'https://evil.test'}});
  assert.equal(result.transactions.length,50); assert.equal(result.payouts.length,1);
  assert.equal(result.merchantCode,'M1234567'); assert.equal(result.payoutError,'');
  assert.equal(JSON.stringify(result).includes('private'),false); assert.equal(JSON.stringify(result).includes('test-secret'),false);
  assert.ok(h.calls.every(c=>c.url.startsWith('https://api.sumup.com/') && c.url.includes('/M1234567/') && c.options.redirect==='error'));
});
test('payout permission failure preserves transactions; upstream failures never reveal response bodies',async()=>{
  const h=harness(url=>url.includes('/payouts?') ? {ok:false,status:403} : {ok:true,json:async()=>({items:[]})});
  const result=await h.read({auth:{admin:true}}); assert.match(result.payoutError,/permissions/); assert.equal(result.transactions.length,0);
  const denied=harness(()=>({ok:false,status:401,text:async()=> 'test-secret'}));
  await assert.rejects(denied.read({auth:{admin:true}}), error=>error.code==='failed-precondition' && !error.message.includes('test-secret'));
  const malformed=harness(()=>({ok:true,json:async()=>({unexpected:true})}));
  await assert.rejects(malformed.read({auth:{admin:true}}),{code:'unavailable'});
});

const auth={admin:true,uid:'admin'};
const id='12345678-abcd-abcd-abcd-123456789012';
const payment={id,merchant_code:'M1234567',amount:25,currency:'GBP',transaction_code:'TX123456',links:[{rel:'refund',min_amount:0.01,max_amount:25}],transaction_events:[{event_type:'PAYOUT',amount:25,status:'PAID_OUT'}]};
const ok=value=>({ok:true,json:async()=>value});
const refundData={id,amount:10,expectedMax:25,requestId:'request-123456',confirmed:true};
test('every payment endpoint requires admin',async()=>{
 const h=harness(()=>{throw Error('network');});
 for(const fn of [h.detail,h.refund])await assert.rejects(fn({auth:{},data:{}}),{code:'permission-denied'});
 assert.equal(h.calls.length,0);
});
test('date ranges and cursors are validated and next links never become network destinations',async()=>{
 const h=harness(url=>url.includes('/payouts?') ? ok([]):ok({items:[],links:[{rel:'next',href:'https://evil.test/?newest_ref=cursor-123456'}]}));
 await assert.rejects(h.read({auth,data:{start:'2026-02-30',end:'2026-03-01'}}),{code:'invalid-argument'});
 assert.equal(h.calls.length,0);
 const result=await h.read({auth,data:{start:'2026-01-01',end:'2026-01-31'}});
 assert.equal(result.nextCursor,'cursor-123456');
 await h.read({auth,data:{start:'2026-01-01',end:'2026-01-31',cursor:result.nextCursor}});
 assert.ok(h.calls.every(call=>call.url.startsWith('https://api.sumup.com/')));
 assert.ok(h.calls.at(-1).url.includes('newest_ref=cursor-123456'));
});
test('details strip private receipt fields and reject a different merchant',async()=>{
 const h=harness(url=>ok(url.includes('/receipts/') ? {transaction_data:{merchant_code:'M1234567',amount:'25',currency:'GBP',card:{secret:'private'},products:[{name:'Shirt',quantity:1,total_price:'25',secret:'private'}]}} : {...payment,username:'private'}));
 const data=await h.detail({auth,data:{id}});assert.equal(data.refund.max,25);assert.equal(data.events[0].type,'PAYOUT');assert.equal(data.receipt.products[0].name,'Shirt');assert.ok(!JSON.stringify(data).includes('private'));
 const wrong=harness(()=>ok({...payment,merchant_code:'M7654321'}));await assert.rejects(wrong.detail({auth,data:{id}}),{code:'permission-denied'});assert.equal(wrong.calls.length,1);
});
test('refund validates confirmation, precision, current availability and bounds before POST',async()=>{
 const h=harness(()=>ok(payment));
 for(const changes of [{confirmed:false},{amount:-1},{amount:26},{amount:0.001},{amount:1.234},{expectedMax:30}])await assert.rejects(h.refund({auth,data:{...refundData,...changes}}));
 assert.ok(h.calls.every(c=>c.options.method==='GET'));assert.equal(h.records.size,0);
});
test('concurrent refund submissions only POST once and successful replay is blocked',async()=>{
 const h=harness((url,options)=>options.method==='POST' ? {ok:true,status:204}:ok(payment));
 const outcomes=await Promise.allSettled([h.refund({auth,data:refundData}),h.refund({auth,data:refundData})]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(h.calls.filter(c=>c.options.method==='POST').length,1);
 const post=h.calls.find(c=>c.options.method==='POST');assert.deepEqual(JSON.parse(post.options.body),{amount:10});
 await assert.rejects(h.refund({auth,data:refundData}),{code:'failed-precondition'});
});
test('uncertain refunds remain locked across retries',async()=>{
 const h=harness((url,options)=>{if(options.method==='POST')throw Error('timeout secret');return ok(payment);});
 await assert.rejects(h.refund({auth,data:refundData}),/outcome unknown/);
 await assert.rejects(h.refund({auth,data:{...refundData,requestId:'another-request'}}),/already submitted/);
 assert.equal(h.calls.filter(c=>c.options.method==='POST').length,1);assert.equal([...h.records.values()][0].state,'pending');
});
