const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {aggregateAnalytics,sanitiseLegacyEvent,publicAggregates,processAnalytics,storeAndDelete}=require('../functions/analytics');
const {database}=require('./analytics-db.cjs');
const now=Date.now();const stamp=new Date(now-45*60000);
const event=(extra={})=>({action:'page_view',page:'/links',sessionId:'temporary',timestamp:stamp,statisticsVersion:'2026-10-07',...extra});
function serverHarness(db) {
 const module={exports:{}};class HttpsError extends Error {constructor(code,message){super(message);this.code=code;}}
 vm.runInNewContext(fs.readFileSync('functions/analytics.js','utf8'),{module,URL,Date,require:name=>({
 'node:crypto':require('node:crypto'),'firebase-functions/v2/https':{onCall:(_o,h)=>h,HttpsError},
 'firebase-functions/v2/scheduler':{onSchedule:(_o,h)=>h},'firebase-admin/firestore':{Timestamp:{fromMillis:n=>new Date(n),now:()=>new Date()}}
 }[name])});
 return module.exports.buildAnalyticsFunctions(db,r=>{if(r.auth?.token?.email!=='admin@example.test')throw new HttpsError('permission-denied','Denied');});
}
test('marginal daily statistics preserve counts without linked visitor dimensions',()=>{
 const result=aggregateAnalytics([event({source:'instagram',campaign:'tour',device:'mobile'}),event({action:'page_view',page:'/tickets',timestamp:new Date(+stamp+60000)}),event({action:'click',timestamp:new Date(+stamp+120000)}),event({sessionId:'another'})]);
 const total=result.find(e=>e.kind==='total');assert.equal(total.views,3);assert.equal(result.find(e=>e.kind==='event' && e.value==='page_view').count,3);assert.equal(total.sessions,2);assert.equal(total.bounces,1);assert.equal(total.clickingSessions,1);
 assert.equal(result.find(e=>e.kind==='navigation').value,'/links -> /tickets');
 assert.doesNotMatch(JSON.stringify(result),/temporary|another|sessionId|userId/);
 for(const bucket of result) assert.deepEqual(Object.keys(bucket).filter(k=>['page','source','campaign','browser','os','device','referrer'].includes(k)),[]);
});
test('legacy sanitisation strips PII, private paths, full URLs and exact device data',()=>{
 const data=sanitiseLegacyEvent({action:'click',page:'/profile/person@example.com',label:'person@example.com',target:'1234567890',referrer:'https://social.example/post?email=person',href:'mailto:person@example.com',ip:'192.0.2.1',latitude:55.8,viewport:'1920x1080',timestamp:new Date()});
 assert.equal(data.page,'/other');assert.equal(data.label,'');assert.equal(data.target,'');assert.equal(data.referrer,'https://social.example');assert.equal(data.href,'');
 assert.doesNotMatch(JSON.stringify(data),/person|1920|latitude|192.0/);
});
test('report requires admin and reads only durable aggregates',async()=>{
 const db=database({'analytics-daily':{total:{kind:'total',timestamp:new Date().toISOString().slice(0,10)+'T00:00:00.000Z',value:'',count:3,views:3,sessionId:'injected',email:'fan@example.test'}},'site-actions':{raw:event()}});
 const tools=serverHarness(db);await assert.rejects(tools.getAdminAnalytics({}),e=>e.code==='permission-denied');assert.equal(db.reads.length,0);
 const report=await tools.getAdminAnalytics({auth:{token:{email:'admin@example.test'}}});assert.equal(report.entries[0].views,3);assert.deepEqual(db.reads,['analytics-daily']);assert.doesNotMatch(JSON.stringify(report),/sessionId|fan@|temporary/);
});
test('small breakdowns and small session summaries are withheld',()=>{
 const timestamp=new Date().toISOString().slice(0,10)+'T00:00:00.000Z';const result=publicAggregates([{kind:'page',timestamp,value:'/links',count:1,views:1},{kind:'total',timestamp,value:'',count:1,views:1,sessions:1,bounces:1,sessionSeconds:127}]);
 assert.equal(result.length,1);assert.equal(result[0].views,1);assert.equal(result[0].sessions,undefined);assert.equal(result[0].sessionSeconds,undefined);
});
test('idle sessions are aggregated and removed while active sessions wait',async()=>{
 const db=database({'site-actions':{closed:event(),active:event({sessionId:'active',timestamp:new Date(now-5*60000)})}});
 assert.equal(await processAnalytics(db,now),1);assert.equal(db.rows.has('site-actions/closed'),false);assert.equal(db.rows.has('site-actions/active'),true);
 assert.equal([...db.rows].find(([key])=>key.startsWith('analytics-daily/') && db.rows.get(key).kind==='total')[1].views,1);
 await processAnalytics(db,now);assert.equal([...db.rows.values()].find(e=>e.kind==='total').views,1);
});
test('aggregation failure leaves raw data available without partial totals',async()=>{
 const db=database({'site-actions':{closed:event()}});db.failCommit=true;await assert.rejects(processAnalytics(db,now));assert.equal(db.rows.has('site-actions/closed'),true);assert.equal(db.rows.size,1);
 db.failCommit=false;await processAnalytics(db,now);assert.equal(db.rows.has('site-actions/closed'),false);
});
test('expired raw records are deleted but durable totals remain reportable',async()=>{
 const timestamp=new Date().toISOString().slice(0,10)+'T00:00:00.000Z';const db=database({'site-actions':{expired:event({timestamp:new Date(now-3*3600000),expiresAt:new Date(now-3600000)})},'ad-tracking':{old:{timestamp:new Date(0)}},'analytics-daily':{daily:{kind:'total',timestamp,value:'',count:8,views:8,expiresAt:new Date(now+86400000)}}});
 await serverHarness(db).cleanupAnalytics();assert.equal([...db.rows.keys()].filter(k=>k.startsWith('site-actions/')).length,0);assert.equal(db.rows.has('ad-tracking/old'),false);
 const report=await serverHarness(db).getAdminAnalytics({auth:{token:{email:'admin@example.test'}}});assert.equal(report.entries[0].views,8);
});
test('session metrics include only a temporary session and totals survive deletion',async()=>{
 const db=database({'site-actions':{a:event(),b:event({action:'page_view',page:'/tickets',timestamp:new Date(+stamp+1000)}),c:event({action:'click',timestamp:new Date(+stamp+2000)})}});
 await processAnalytics(db,now);const rows=[...db.rows.values()];const total=rows.find(e=>e.kind==='total');assert.equal(total.sessions,1);assert.equal(total.bounces,0);assert.equal(total.sessionSeconds,2);assert.doesNotMatch(JSON.stringify(rows),/sessionId|temporary/);
});
test('weekly traffic API reads totals and aggregates signup counts without personal context',async()=>{
 const timestamp=new Date().toISOString().slice(0,10)+'T00:00:00.000Z';const reads=[];
 const query=name=>{const q={where:()=>q,get:async()=>{reads.push(name);return {docs:name==='analytics-daily'?[{data:()=>({kind:'total',timestamp,value:'',count:8,tickets:8})}]:[1,2].map(()=>({createTime:new Date(),data:()=>({email:'fan@example.test',source:'instagram',referrer:'https://social.example/private?email=fan'})}))};}};return q;};
 const module={exports:{}};vm.runInNewContext(fs.readFileSync('functions/admin-tools.js','utf8'),{module,Buffer,process:{env:{}},require:name=>({crypto:require('node:crypto'),'./analytics':require('../functions/analytics'),'firebase-functions/v2/https':{onCall:(_o,h)=>h,HttpsError:Error},'firebase-functions/v2/firestore':{onDocumentWritten:(_o,h)=>h},'firebase-admin/storage':{getStorage:()=>{}},'firebase-admin/firestore':{Timestamp:{fromMillis:n=>new Date(n)}}}[name])});
 const result=await module.exports({collection:query},()=>{}).getAdminTrafficComparison({});assert.equal(result.signups[0].count,2);assert.equal(result.events[0].tickets,8);assert.ok(!reads.includes('site-actions'));assert.doesNotMatch(JSON.stringify(result),/fan@|private|referrer|sessionId/);
});

test('overview requests aggregate totals and cannot fall back to raw browsing records',async()=>{
 const source=fs.readFileSync('assets/js/admin-workflows.js','utf8');
 const start=source.indexOf('  async function loadOverview()'),end=source.indexOf('  async function loadHomepage()',start);
 const elements={'overview-status':{},'overview-cards':{}},reads=[];
 const context=vm.createContext({overviewLoading:false,state:{authUser:{},activePage:'overview'},$:id=>elements[id],Date,Promise,escape:String,normalizeEmailMessage:x=>x,api:{updateHeroMeta(){}},
 collection:(_db,name)=>name,db:{},getDocs:async name=>{reads.push(name);assert.ok(['gigs','mailing-list-signups'].includes(name));return {docs:[]};},
 callAdminEmailFunction:async name=>name==='getAdminAnalytics'?{entries:[{kind:'total',timestamp:new Date(Date.now()-86400000).toISOString(),tickets:7},{kind:'page',timestamp:new Date().toISOString(),tickets:7}]}:{messages:[]}});
 vm.runInContext(source.slice(start,end),context);await context.loadOverview();
 assert.match(elements['overview-cards'].innerHTML,/Ticket clicks[\s\S]*?<h3>7<\/h3>/);assert.deepEqual(reads,['gigs','mailing-list-signups']);
});
