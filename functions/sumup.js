'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore } = require('firebase-admin/firestore');
const key = defineSecret('SUMUP_API_KEY');
const merchant = defineSecret('SUMUP_MERCHANT_CODE');
const fields = ['id','timestamp','transaction_code','product_summary','amount','currency','status','payment_type','refunded_amount'];
const pick = (item, names) => Object.fromEntries(names.map(name => [name, typeof item?.[name] === 'number' ? item[name] : String(item?.[name] ?? '').slice(0,600)]));
const identifier = value => { if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{6,80}$/.test(value)) throw new HttpsError('invalid-argument','Invalid transaction reference.'); return value; };
module.exports = function buildSumUp(assertAdmin) {
  function callable(fn) { return onCall({region:'us-central1',maxInstances:2,timeoutSeconds:40,secrets:[key,merchant]}, async request => {
    assertAdmin(request);
    const mid = merchant.value().trim(), apiKey = key.value().trim();
    if (!apiKey || !/^[A-Z0-9]{6,32}$/.test(mid)) throw new HttpsError('failed-precondition','Configure the SumUp API key and merchant code on the server.');
    async function api(path, body) {
      let response;
      try { response = await fetch(`https://api.sumup.com${path}`, {method:body ? 'POST':'GET',headers:{Authorization:`Bearer ${apiKey}`,Accept:'application/json',...(body ? {'Content-Type':'application/json'} : {})},...(body ? {body:JSON.stringify(body)} : {}),signal:AbortSignal.timeout(12000),redirect:'error'}); }
      catch { throw new HttpsError('unavailable',body ? 'Refund outcome unknown. Check SumUp before making another refund.' : 'SumUp could not be reached. Try again.'); }
      if (!response.ok) throw new HttpsError('failed-precondition',body ? 'Refund not confirmed. Check the payment in SumUp before trying again.' : 'SumUp could not return records. Check API permissions and try again.');
      if (body) return {accepted:true};
      try { return await response.json(); } catch { throw new HttpsError('unavailable','SumUp returned an invalid response.'); }
    }
    async function transaction(id) {
      const value = await api(`/v2.1/merchants/${mid}/transactions?id=${identifier(id)}`);
      if (value?.merchant_code !== mid || value.id !== id) throw new HttpsError('permission-denied','The payment does not belong to this merchant.');
      return value;
    }
    return fn(request.data || {}, {mid,api,transaction,uid:request.auth.uid});
  }); }
  return {
    getAdminStorePayments:callable(async (data,{mid,api}) => {
      const today = new Date().toISOString().slice(0,10);
      const start = data.start || new Date(Date.now()-29*86400000).toISOString().slice(0,10), end=data.end || today;
      const valid = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v;
      if (!valid(start) || !valid(end) || start>end || end>today || Date.parse(end)-Date.parse(start)>365*86400000) throw new HttpsError('invalid-argument','Choose a valid date range of up to one year, ending today or earlier.');
      const query = new URLSearchParams({limit:'50',order:'descending','types[]':'PAYMENT',oldest_time:`${start}T00:00:00Z`,newest_time:new Date(Date.parse(end)+86400000).toISOString()});
      if(data.cursor) query.set('newest_ref',identifier(data.cursor));
      const [history,payouts]=await Promise.allSettled([
        api(`/v2.1/merchants/${mid}/transactions/history?${query}`),
        data.cursor ? Promise.resolve([]) : api(`/v1.0/merchants/${mid}/payouts?${new URLSearchParams({start_date:start,end_date:end,limit:'50',order:'desc'})}`)
      ]);
      if(history.status==='rejected') throw history.reason;
      if(!Array.isArray(history.value?.items)) throw new HttpsError('unavailable','SumUp returned an invalid transaction list.');
      const link=history.value.links?.find(link=>link.rel==='next');
      let nextCursor='';
      if(link) { const href=String(link.href); const params=new URLSearchParams(href.includes('?') ? href.split('?')[1] : href); nextCursor=identifier(params.get('newest_ref')); }
      const payoutOk=payouts.status==='fulfilled' && Array.isArray(payouts.value);
      return {merchantCode:mid,start,end,nextCursor,transactions:history.value.items.slice(0,50).map(item=>pick(item,fields)),payouts:payoutOk ? payouts.value.slice(0,50).map(item=>pick(item,['date','reference','type','amount','currency','fee','status'])):[],payoutError:payoutOk ? '':'Payouts unavailable. Check payout-read permissions and refresh to try again.'};
    }),
    getAdminStorePayment:callable(async (data,{mid,api,transaction}) => {
      const value=await transaction(identifier(data.id));
      const refund=value.links?.find(link=>link.rel==='refund');
      let receipt=null,receiptError='';
      try { const raw=await api(`/v1.1/receipts/${value.id}?mid=${mid}`); if(raw.transaction_data?.merchant_code !== mid) throw Error(); receipt={...pick(raw.transaction_data,['transaction_code','amount','currency','vat_amount','tip_amount','timestamp']),products:(raw.transaction_data.products || []).slice(0,100).map(item=>pick(item,['name','quantity','total_price','total_with_vat','price']))}; }
      catch { receiptError='Receipt details unavailable for this payment.'; }
      return {...pick(value,[...fields,'simple_status','fee_amount']),events:(value.transaction_events || value.events || []).slice(0,100).map(item=>({...pick(item,['status','amount']),type:String(item.event_type || item.type || ''),date:String(item.timestamp || item.date || '')})),refund:refund && Number.isFinite(refund.max_amount) && Number.isFinite(refund.min_amount) ? {max:refund.max_amount,min:refund.min_amount}:null,receipt,receiptError};
    }),
    refundAdminStorePayment:callable(async (data,{mid,api,transaction,uid}) => {
      const id=identifier(data.id), requestId=identifier(data.requestId);
      if(data.confirmed !== true || typeof data.amount !== 'number' || !Number.isFinite(data.amount) || data.amount<=0) throw new HttpsError('invalid-argument','Confirm a valid refund amount.');
      const value=await transaction(id), limit=value.links?.find(link=>link.rel==='refund');
      const digits=new Intl.NumberFormat('en',{style:'currency',currency:value.currency}).resolvedOptions().maximumFractionDigits;
      const scaled=data.amount * 10**digits;
      if(!limit || !Number.isFinite(limit.max_amount) || !Number.isFinite(limit.min_amount) || data.expectedMax!==limit.max_amount || data.amount<limit.min_amount || data.amount>limit.max_amount || Math.abs(scaled-Math.round(scaled))>0.000001) throw new HttpsError('failed-precondition','Refund availability changed or the amount is invalid. Reopen the payment details.');
      const db=getFirestore(), ref=db.collection('admin-sumup-refunds').doc(`${mid}-${id}`);
      // A pending/uncertain submission stays locked until reconciled in SumUp; never retry a financial POST blindly.
      await db.runTransaction(async tx=>{const prior=(await tx.get(ref)).data(); if(prior && (prior.state!=='accepted' || prior.requestId===requestId || prior.expectedMax===limit.max_amount)) throw new HttpsError('failed-precondition','A refund was already submitted. Check SumUp before submitting another.'); tx.set(ref,{requestId,amount:data.amount,expectedMax:limit.max_amount,uid:uid || '',state:'pending',createdAt:new Date().toISOString()});});
      await api(`/v1.0/merchants/${mid}/payments/${id}/refunds`,{amount:data.amount});
      await ref.update({state:'accepted'});
      return {accepted:true};
    })
  };
};
