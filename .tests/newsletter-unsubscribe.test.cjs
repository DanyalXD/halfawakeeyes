const test = require('node:test');
const assert = require('node:assert/strict');
const {emailKey,tokenKey,withUnsubscribe,sendNewsletterBatch,createUnsubscribeHandler} = require('../functions/newsletter');

function database(initial = {}) {
  const rows = new Map(Object.entries(initial));
  const snapshot = path => ({exists:rows.has(path),id:path.split('/').pop(),data:()=>rows.get(path)});
  const db = {rows, doc:path=>({path,get:async()=>snapshot(path),set:async value=>rows.set(path,value)}),
    collection:name=>({get:async()=>({docs:[...rows.keys()].filter(path=>path.startsWith(name+'/')).map(snapshot)})}),
    runTransaction:async run=>{const writes=[];await run({get:async ref=>snapshot(ref.path),set:(ref,value)=>writes.push(()=>rows.set(ref.path,value)),update:(ref,value)=>writes.push(()=>rows.set(ref.path,{...rows.get(ref.path),...value}))});writes.forEach(write=>write());}
  };
  return db;
}
function response() { return {headers:{},set(k,v){this.headers[k]=v;return this;},status(code){this.code=code;return this;},send(body){this.body=body;return this;}}; }
const message = {to:'band@example.com',bcc:'unused@example.com',subject:'News',text:'Our new release',html:'<html><body><p>New release</p></body></html>'};

test('each subscriber receives a distinct private unsubscribe button', async () => {
  const db = database({'mailing-list-signups/a':{email:'a@example.com'},'mailing-list-signups/b':{email:'b@example.com'}});
  const sent=[];
  const result=await sendNewsletterBatch({db,recipients:['a@example.com','B@example.com','a@example.com'],message,origin:'https://example.com',send:async mail=>sent.push(mail)});
  assert.deepEqual(result.sent,['a@example.com','b@example.com']);
  assert.equal(sent.length,2);
  assert.equal(sent[0].bcc,undefined);
  assert.notEqual(sent[0].headers['List-Unsubscribe'],sent[1].headers['List-Unsubscribe']);
  assert.match(sent[0].html,/Unsubscribe from the mailing list/);
  assert.ok(sent[0].html.indexOf('Unsubscribe')<sent[0].html.indexOf('</body>'));
  assert.ok(!sent[0].html.includes('b@example.com'));
});
test('GET is a confirmation only; POST opts out and repeated POST is safe', async () => {
  const token='a'.repeat(64), hash=emailKey('a@example.com');
  const db=database({[`mailing-list-unsubscribe-tokens/${tokenKey(token)}`]:{emailHash:hash,contactIds:['a']},'mailing-list-signups/a':{email:'a@example.com'},'mailing-list-signups/b':{email:'b@example.com'}});
  const handler=createUnsubscribeHandler(db), get=response();
  await handler({method:'GET',query:{token}},get);
  assert.equal(get.code,200); assert.match(get.body,/method="post"/);
  assert.equal(db.rows.get('mailing-list-signups/a').unsubscribed,undefined);
  for(let i=0;i<2;i++){const post=response();await handler({method:'POST',query:{token}},post);assert.equal(post.code,200);}
  assert.equal(db.rows.get('mailing-list-signups/a').unsubscribed,true);
  assert.ok(db.rows.has(`mailing-list-suppressions/${hash}`));
  assert.equal(db.rows.get('mailing-list-signups/b').unsubscribed,undefined);
});
test('unknown links cannot change a subscription', async () => {
  const db=database({'mailing-list-signups/a':{email:'a@example.com'}}), handler=createUnsubscribeHandler(db);
  for(const token of ['bad','b'.repeat(64)]) {const res=response();await handler({method:'POST',query:{token}},res);assert.equal(res.code,400);}
  assert.equal(db.rows.size,1);
});
test('unsubscribed and suppressed addresses are excluded even when requested by the client', async () => {
  const db=database({'mailing-list-signups/a':{email:'a@example.com',unsubscribed:true},'mailing-list-signups/b':{email:'b@example.com'},[`mailing-list-suppressions/${emailKey('b@example.com')}`]:{}});
  const result=await sendNewsletterBatch({db,recipients:['a@example.com','b@example.com','unknown@example.com'],message,origin:'https://example.com',send:async()=>assert.fail('Must not send')});
  assert.equal(result.skipped.length,3);assert.equal(result.sent.length,0);
});
test('partial delivery reports only the failed recipients for retry', async () => {
  const db=database({'mailing-list-signups/a':{email:'a@example.com'},'mailing-list-signups/b':{email:'b@example.com'}});
  const result=await sendNewsletterBatch({db,recipients:['a@example.com','b@example.com'],message,origin:'https://example.com',send:async mail=>{if(mail.to==='b@example.com')throw Error('SMTP failed');}});
  assert.deepEqual(result.sent,['a@example.com']);assert.deepEqual(result.failed,['b@example.com']);
});
test('test email preview does not read or mutate subscriptions',async()=>{
  const res=response();await createUnsubscribeHandler({})({method:'GET',query:{preview:'1'}},res);
  assert.equal(res.code,200);assert.match(res.body,/No subscription has been changed/);
});
test('plain-text newsletters also receive an HTML button and text fallback',()=>{
  const result=withUnsubscribe({text:'Music & news'},'https://example.com/unsubscribe?token=abc');
  assert.match(result.html,/Music &amp; news/);assert.match(result.html,/href=/);assert.match(result.text,/https:\/\/example.com\/unsubscribe/);
});
