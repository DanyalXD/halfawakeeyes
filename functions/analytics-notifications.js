'use strict';

async function notifyPageViewTotals(db, send, now=Date.now()) {
  const today=new Date(now).toISOString().slice(0,10);
  const notice=await db.runTransaction(async transaction=>{
    const ref=db.collection('analytics-page-views').doc('current');
    const stateRef=db.collection('admin-analytics-push-state').doc('current');
    const [snapshot,state]=await Promise.all([transaction.get(ref),transaction.get(stateRef)]);
    const data=snapshot.exists ? snapshot.data() : {};
    const previous=state.exists ? state.data() : {};
    if(data.day!==today || !Number.isSafeInteger(data.views) || data.views<1 || previous.day===today && previous.views>=data.views) return null;
    // Claim before sending so duplicate/out-of-order deliveries do not repeatedly alert devices.
    // Push is best effort: a failed send after this claim waits for the next total increase.
    transaction.set(stateRef,{day:today,views:data.views,expiresAt:new Date(Date.parse(today)+90*86400000)});
    return {day:today,views:data.views};
  });
  if(!notice) return;
  return send({title:'New page view',body:`${notice.views} page ${notice.views===1?'view':'views'} today (UTC).`,
    tag:'hae-page-views',data:{type:'site-action',action:'page_view',day:notice.day,views:String(notice.views)},
    isEnabled:settings=>settings.siteActions?.page_view===true});
}
module.exports={notifyPageViewTotals};
