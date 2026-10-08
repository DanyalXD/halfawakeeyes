// Run only via the isolated demo-project Firestore emulator (see ANALYTICS_PRIVACY.md).
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const host=process.env.FIRESTORE_EMULATOR_HOST;
if(!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host))throw Error('A localhost Firestore emulator is required.');
const base=`http://${host}/v1/projects/demo-hae-analytics/databases/(default)/documents`;
const valid={sessionId:randomUUID(),statisticsVersion:'2026-10-07',action:'page_view',page:'/links',pageName:'Links',target:'',label:'',href:'',elementType:'',actionSubtype:'',platform:'',section:'',outbound:false,campaign:'Autumn tour',campaignSlug:'',source:'instagram',medium:'social',referrer:'https://instagram.com',browser:'Chrome',os:'Windows',device:'desktop',durationSeconds:0,expiresAt:new Date(Date.now()+2*60*60000)};
function field(value){return value instanceof Date?{timestampValue:value.toISOString()}:typeof value==='boolean'?{booleanValue:value}:typeof value==='number'?(Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value}):{stringValue:value};}
async function create(changes={},collection='site-actions') {
  const id=randomUUID(),payload={...valid,...changes};
  for(const [key,value] of Object.entries(payload))if(value===undefined)delete payload[key];
  const fields=Object.fromEntries(Object.entries(payload).map(([key,value])=>[key,field(value)]));
  const write={update:{name:`projects/demo-hae-analytics/databases/(default)/documents/${collection}/${id}`,fields}};
  if(!fields.timestamp)write.updateTransforms=[{fieldPath:'timestamp',setToServerValue:'REQUEST_TIME'}];
  const response=await fetch(base+':commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({writes:[write]})});
  return {response,id};
}
(async()=>{
  const allowed=await create();
  if(!allowed.response.ok)throw Error(`Valid statistical event was rejected: ${await allowed.response.text()}`);
  for(const changes of [
    {analyticsCounted:true}, {userId:'fan@example.test'}, {viewport:'1920x1080'}, {ip:'192.0.2.1'}, {latitude:55.8},
    {statisticsVersion:undefined}, {sessionId:'persistent-person'},
    {href:'https://tickets.example/order?email=fan'}, {referrer:'https://social.example/private'},
    {label:'fan@example.test'}, {page:'/account/fan@example.test'},
    {page:'/links?email=fan@example.test'}, {page:'/shows/1234567890/'}, {page:'/smartlink/abcdef0123456789abcdef0123456789/'} ,
    {expiresAt:new Date(Date.now()+3*60*60000)}, {timestamp:new Date(0)}
  ]) {
    const denied=await create(changes);assert.equal(denied.response.status,403,`Unsafe payload was accepted: ${Object.keys(changes).join(',')}`);
  }
  const raw=await fetch(base+'/site-actions/'+allowed.id);assert.equal(raw.status,403);
  const ads=await create({},'ad-tracking');assert.equal(ads.response.status,403);
  const aggregates=await create({},'analytics-daily');assert.equal(aggregates.response.status,403);
  const statusWrite=await create({},'analytics-status');assert.equal(statusWrite.response.status,403);
  const statusRead=await fetch(base+'/analytics-status/current');assert.equal(statusRead.status,403);
  const noticeWrite=await create({},'analytics-page-views');assert.equal(noticeWrite.response.status,403);
  assert.equal((await fetch(base+'/analytics-page-views/current')).status,403);
  assert.equal((await fetch(base+'/admin-analytics-push-state/current')).status,403);
  const aggregateRead=await fetch(base+'/analytics-daily/private');assert.equal(aggregateRead.status,403);
  const oldSchema=await create({statisticsVersion:undefined,consentVersion:'2026-10-07'});assert.equal(oldSchema.response.status,403);
  const extra=await create({page:'/shows/YWm5A0ZIUh1UBYqoDMVk/'});assert.equal(extra.response.status,200);
  // Admin SDK writes bypass rules only in this localhost demo emulator.
  const requireFunctions=require('node:module').createRequire(require('node:path').resolve(__dirname,'../functions/package.json'));
  const {initializeApp}=requireFunctions('firebase-admin/app');
  const {getFirestore}=requireFunctions('firebase-admin/firestore');
  const {countAnalyticsEvent,processAnalytics,buildAnalyticsFunctions}=require('../functions/analytics');
  const db=getFirestore(initializeApp({projectId:'demo-hae-analytics'}));
  const old=new Date(Date.now()-45*60000);
  const seeds=Array.from({length:5},()=>({ref:db.collection('site-actions').doc(randomUUID()),data:{...valid,timestamp:old,sessionId:randomUUID()}}));
  await Promise.all(seeds.map(seed=>seed.ref.set(seed.data)));
  await Promise.all([countAnalyticsEvent(db,seeds[0].ref),countAnalyticsEvent(db,seeds[0].ref),processAnalytics(db)]);
  await Promise.all([processAnalytics(db),processAnalytics(db)]);
  await processAnalytics(db);
  const tokenPart=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const adminToken=tokenPart({alg:'none',typ:'JWT'})+'.'+tokenPart({iss:'https://securetoken.google.com/demo-hae-analytics',aud:'demo-hae-analytics',sub:'test-admin',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,email:'danyal1995@hotmail.co.uk'})+'.';
  const adminStatus=await fetch(base+'/analytics-status/current',{headers:{Authorization:'Bearer '+adminToken}});
  assert.equal(adminStatus.status,200,'An authorized admin can subscribe to the revision');
  assert.deepEqual(Object.keys((await adminStatus.json()).fields),['revision']);
  const noticeResponse=await fetch(base+'/analytics-page-views/current',{headers:{Authorization:'Bearer '+adminToken}});
  assert.equal(noticeResponse.status,200);
  const noticeFields=(await noticeResponse.json()).fields;
  assert.deepEqual(Object.keys(noticeFields).sort(),['day','expiresAt','timestamp','views']);
  assert.equal(noticeFields.views.integerValue,'7');
  const {notifyPageViewTotals}=require('../functions/analytics-notifications');const sent=[];
  await Promise.all([notifyPageViewTotals(db,async notice=>sent.push(notice)),notifyPageViewTotals(db,async notice=>sent.push(notice))]);
  assert.equal(sent.length,1);assert.equal(sent[0].body,'7 page views today (UTC).');
  for(const seed of seeds)assert.equal((await seed.ref.get()).exists,false);
  const tools=buildAnalyticsFunctions(db,request=>assert.equal(request.auth?.token?.email,'admin@example.test'));
  const report=await tools.getAdminAnalytics.run({auth:{token:{email:'admin@example.test'}}});
  assert.ok(report.entries.some(e=>e.kind==='total' && e.views===7 && e.sessions===5));
  assert.doesNotMatch(JSON.stringify(report),/sessionId|statisticsVersion|12:|userId/);
  console.log('Emulator aggregation: transaction saved 7 immediate views and 5 finalized sessions, deleted raw input and callable returned durable statistics.');
  console.log('Firestore rules: valid reduced events accepted; 16 unsafe schemas, raw reads and legacy advertising writes rejected.');
})().catch(error=>{console.error(error);process.exitCode=1;});
