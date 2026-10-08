import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {createLiveAnalytics}=await import('data:text/javascript;base64,'+fs.readFileSync('assets/js/analytics-live.js').toString('base64'));
test('live reports coalesce changes, recover after errors and discard responses after stopping',async()=>{
  const requests=[],reports=[],errors=[],loading=[];let changed,failed,unsubscribed=0;
  const live=createLiveAnalytics({subscribe:(next,error)=>{changed=next;failed=error;return()=>unsubscribed++;},
    fetchReport:()=>new Promise((resolve,reject)=>requests.push({resolve,reject})),
    onReport:r=>reports.push(r),onError:e=>errors.push(e.message),onLoading:v=>loading.push(v)});
  const first=live.start();changed();changed();assert.equal(requests.length,1);
  requests[0].resolve('first');await Promise.resolve();assert.equal(requests.length,2);
  requests[1].resolve('latest');await first;assert.deepEqual(reports,['first','latest']);
  const oldChanged=changed,pending=live.refresh();live.stop();requests[2].resolve('stale');await pending;
  assert.deepEqual(reports,['first','latest']);assert.equal(unsubscribed,1);
  const restarted=live.start();oldChanged();requests[3].reject(Error('offline'));await restarted;
  assert.equal(requests.length,4);assert.deepEqual(errors,['offline']);
  failed(Error('listener closed'));assert.equal(unsubscribed,2);
  const retry=live.start();requests[4].resolve('reconnected');await retry;
  assert.equal(reports.at(-1),'reconnected');assert.equal(loading.at(-1),false);live.stop();
});
