import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('assets/js/public-site-utils.js','utf8');
const {createSiteAnalytics,isOwnVisitExcluded}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('browser exclusion stops writes and does not consume a page view when re-enabled',async()=>{
  const originals=Object.fromEntries(['localStorage','sessionStorage','window','document'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const store=new Map();const storage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};
  try {
    for(const [key,value] of Object.entries({localStorage:storage,sessionStorage:storage,window:{innerWidth:1000,innerHeight:800},document:{referrer:''}})) Object.defineProperty(globalThis,key,{value,configurable:true});
    let writes=0; const analytics=createSiteAnalytics({db:{},doc:()=>({}),setDoc:async()=>writes++,pagePath:'/links',minEventIntervalMs:0});
    storage.setItem('hae-exclude-own-analytics','1');await analytics.logEvent('click');await analytics.logPageViewOnce();assert.equal(writes,0);
    storage.setItem('hae-exclude-own-analytics','0');await analytics.logPageViewOnce();assert.equal(writes,1);
    await analytics.logPageViewOnce();assert.equal(writes,1);
    Object.defineProperty(globalThis,'localStorage',{value:{getItem:()=>{throw Error('blocked');}},configurable:true});
    assert.equal(isOwnVisitExcluded(),false);
  } finally { for(const [key,descriptor] of Object.entries(originals)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];} }
});
