const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
function harness() {
  const data = new Map(), writes=[];
  const timestamp = n => ({toMillis:()=>n,toDate:()=>new Date(n)});
  const snapshot = path => ({exists:data.has(path),data:()=>data.get(path),ref:{path},updateTime:timestamp(100),createTime:timestamp(100)});
  const tx = {get:async ref=>snapshot(ref.path),set:(ref,value)=>{writes.push(ref.path);data.set(ref.path,value);}};
  const db = {doc:path=>({path}),runTransaction:fn=>fn(tx),collection:name=>({doc:id=>({path:`${name}/${id}`})}),batch:()=>({...tx,commit:async()=>{}})};
  class HttpsError extends Error { constructor(code,msg){super(msg);this.code=code;} }
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync('functions/admin-tools.js','utf8'), {module,Buffer,process:{env:{}},require:name=>({
    crypto,'firebase-functions/v2/https':{onCall:(_,fn)=>fn,HttpsError},
    'firebase-functions/v2/firestore':{onDocumentWritten:(_,fn)=>fn},
    'firebase-admin/storage':{getStorage:()=>{throw Error('Storage should not be called');}},
    'firebase-admin/firestore':{Timestamp:{now:()=>timestamp(200),fromDate:d=>timestamp(d.getTime()),fromMillis:timestamp}}
  }[name])});
  const tools=module.exports(db,request=>{if(!request.auth)throw new HttpsError('permission-denied','Not admin');return 'admin';});
  return {tools,data,writes};
}
test('admin tools reject unauthenticated uploads and restores',async()=>{
  const {tools}=harness();
  await assert.rejects(tools.uploadAdminArtwork({data:{}}),{code:'permission-denied'});
  await assert.rejects(tools.restoreContentVersion({data:{}}),{code:'permission-denied'});
});
test('restore preview is read-only; stale preview cannot overwrite changes',async()=>{
  const {tools,data,writes}=harness(); const id='a'.repeat(64);
  data.set(`content-history/${id}`,{path:'gigs/show',content:{event:'Previous',date:'2026-10-01'},title:'Show'});
  data.set('gigs/show',{event:'Current'});
  const preview=await tools.restoreContentVersion({auth:true,data:{versionId:id,preview:true}});
  assert.equal(preview.content.event,'Previous'); assert.equal(writes.length,0);
  data.set('gigs/show',{event:'New edit'});
  await assert.rejects(tools.restoreContentVersion({auth:true,data:{versionId:id,expected:preview.expected}}),{code:'failed-precondition'});
  assert.equal(writes.length,0);
});
test('restore updates the public mirror and retains unrelated shows',async()=>{
  const {tools,data}=harness(); const id='b'.repeat(64);
  data.set(`content-history/${id}`,{path:'gigs/show',content:{event:'Restored',status:'sold_out',date:'2026-10-01'},title:'Show'});
  data.set('gigs/show',{event:'Current'});
  data.set('gigs/public-index',{items:[{id:'show',event:'Current'},{id:'other',event:'Other',date:'2026-11-01'}]});
  const preview=await tools.restoreContentVersion({auth:true,data:{versionId:id,preview:true}});
  await tools.restoreContentVersion({auth:true,data:{versionId:id,expected:preview.expected}});
  assert.equal(data.get('gigs/show').status,'sold_out');
  assert.equal(data.get('gigs/public-index').items.find(i=>i.id==='show').event,'Restored');
  assert.equal(data.get('gigs/public-index').items.find(i=>i.id==='other').event,'Other');
  assert.ok([...data.values()].some(v=>v.stage==='Before restore'));
});
test('invalid artwork never reaches storage',async()=>{
  const {tools}=harness();
  await assert.rejects(tools.uploadAdminArtwork({auth:true,data:{type:'image/webp',data:Buffer.from('<script>bad</script>').toString('base64')}}),{code:'invalid-argument'});
});
