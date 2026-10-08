// Only run against a localhost demo Firestore emulator, never the live project.
const assert=require('node:assert/strict');
const host=process.env.FIRESTORE_EMULATOR_HOST;
if(!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host))throw Error('A localhost Firestore emulator is required.');
const project='demo-hae-tickets',prefix=`projects/${project}/databases/(default)/documents`,base=`http://${host}/v1/${prefix}`;
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
function token(email) {return `${encode({alg:'none',typ:'JWT'})}.${encode({iss:`https://securetoken.google.com/${project}`,aud:project,sub:'synthetic-admin',user_id:'synthetic-admin',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,email,firebase:{sign_in_provider:'password'}})}.`;}
const admin=token('danyalc95@gmail.com'),stranger=token('outsider@example.test');
function field(value) {
  if(Array.isArray(value))return {arrayValue:{values:value.map(field)}};
  if(value && typeof value==='object')return {mapValue:{fields:fields(value)}};
  if(typeof value==='number')return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
  return {stringValue:value};
}
const fields=value=>Object.fromEntries(Object.entries(value).map(([key,value])=>[key,field(value)]));
async function request(method,path,body,auth) {
  return fetch(base+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
}
const write=(path,data,auth)=>request('PATCH','/'+path,{fields:fields(data)},auth);
const value={settings:{price:2250,promoter:1600,capacity:30,feeBps:250},tickets:[{id:'ticket-1',name:'Synthetic guest',method:'sumup',status:'pending',transactionRef:'TX123',payoutRef:'PAYOUT123',notes:''}],revision:1};
(async()=>{
  await request('DELETE','/admin-ticket-trackers/show-1',null,admin);
  let response=await write('gigs/show-1',{event:'Synthetic show'},admin);assert.equal(response.status,200,await response.text());
  response=await write('admin-ticket-trackers/show-1',value,admin);assert.equal(response.status,200,await response.text());
  for(const auth of [undefined,stranger]) {
    assert.equal((await request('GET','/admin-ticket-trackers/show-1',null,auth)).status,403);
    assert.equal((await request('GET','/admin-ticket-trackers',null,auth)).status,403);
    assert.equal((await write('admin-ticket-trackers/show-1',{...value,revision:2},auth)).status,403);
    assert.equal((await request('DELETE','/admin-ticket-trackers/show-1',null,auth)).status,403);
  }
  assert.equal((await request('GET','/admin-ticket-trackers/show-1',null,admin)).status,200);
  assert.equal((await write('admin-ticket-trackers/show-1',value,admin)).status,403);
  for(const settings of [{...value.settings,price:1.5},{...value.settings,promoter:2251},{...value.settings,feeBps:10001},{...value.settings,capacity:501}]) assert.equal((await write('admin-ticket-trackers/show-1',{...value,settings,revision:2},admin)).status,403);
  assert.equal((await write('admin-ticket-trackers/missing',value,admin)).status,403);
  assert.equal((await write('admin-ticket-trackers/show-1',{...value,revision:2},admin)).status,200);
  const publicGig=await (await request('GET','/gigs/show-1')).json();assert.doesNotMatch(JSON.stringify(publicGig.fields),/Synthetic guest|PAYOUT123|tickets/);
  response=await request('POST',':commit',{writes:[{delete:`${prefix}/admin-ticket-trackers/show-1`},{delete:`${prefix}/gigs/show-1`}]},admin);assert.equal(response.status,200,await response.text());
  assert.equal((await request('GET','/admin-ticket-trackers/show-1',null,admin)).status,404);
  console.log('Tracker rules: admin save/read/delete pass; public and non-admin access denied; stale revisions, invalid settings and orphan trackers rejected; gig deletion removes both records atomically.');
})().catch(error=>{console.error(error);process.exitCode=1;});
