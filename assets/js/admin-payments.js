const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = (value,currency) => {
  if(value === '' || value == null || !Number.isFinite(Number(value))) return '\u2014';
  try { return new Intl.NumberFormat('en-GB',{style:'currency',currency}).format(Number(value)); } catch { return `${value} ${currency || ''}`; }
};
const date = value => Number.isNaN(Date.parse(value)) ? String(value || '\u2014') : new Date(value).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'});
const label = value => String(value || '\u2014').toLowerCase().replaceAll('_',' ');
export function csv(rows,fields) {
  const cell=value=>'"'+String(value ?? '').replace(/^[\s]*[=+@-]/,match=>"'"+match).replaceAll('"','""')+'"';
  return [fields.map(([name])=>name),...rows.map(row=>fields.map(([,key])=>row[key]))].map(row=>row.map(cell).join(',')).join('\r\n');
}
export function setupPayments({state,callAdminEmailFunction}) {
  const panel=$('store-finances');
  panel.querySelector('.store-finance-records').insertAdjacentHTML('beforebegin',`
    <form id="payment-range" class="payment-toolbar"><label>From (UTC)<input class="form-control" id="payment-start" type="date" required></label><label>To (UTC)<input class="form-control" id="payment-end" type="date" required></label><button class="btn ghost-button">Apply dates</button></form>
    <div id="payment-summary" class="payment-summary" aria-live="polite"></div>
    <div class="payment-toolbar"><label class="payment-search">Find a payment<input class="form-control" id="payment-search" type="search" placeholder="Reference or description"></label><label>Status<select class="form-control" id="payment-filter"><option value="">All statuses</option>${['SUCCESSFUL','REFUNDED','FAILED','CANCELLED','PENDING'].map(v=>`<option value="${v}">${label(v)}</option>`).join('')}</select></label><button type="button" class="btn ghost-button" id="payment-export" disabled>Export payments CSV</button></div>`);
  $('store-payments').before($('payment-search').closest('.payment-toolbar'));
  $('store-payouts-title').innerHTML='Payouts <span>Selected dates</span>';
  $('store-payouts').insertAdjacentHTML('afterend','<button type="button" id="payout-export" class="btn ghost-button" disabled>Export payouts CSV</button>');
  panel.insertAdjacentHTML('beforeend',`<dialog id="payment-dialog" aria-labelledby="payment-dialog-title"><header class="store-finance-header"><h3 id="payment-dialog-title">Payment details</h3><button type="button" class="btn ghost-button" id="payment-close">Close</button></header><div id="payment-detail"></div><p id="payment-detail-status" role="status"></p></dialog>`);
  panel.querySelector('details ol').innerHTML='<li>Configure Firebase secrets <code>SUMUP_API_KEY</code> and <code>SUMUP_MERCHANT_CODE</code>.</li><li>Enable transaction-history, payout-read and receipt-read access on the API key. Refunds also require <code>refunds.write</code> or <code>payments</code> access.</li><li>Deploy <code>getAdminStorePayments</code>, <code>getAdminStorePayment</code> and <code>refundAdminStorePayment</code>.</li>';
  let generation=0, busy=false, detailGeneration=0, rows=[],payouts=[],complete=false, refundBusy=false;
  const today=new Date().toISOString().slice(0,10);
  $('payment-end').value=today; $('payment-end').max=today; $('payment-start').max=today;
  $('payment-start').value=new Date(Date.now()-29*86400000).toISOString().slice(0,10);
  const paymentFields=[['Date (UTC)','timestamp'],['Reference','transaction_code'],['Description','product_summary'],['Amount','amount'],['Currency','currency'],['Status','status'],['Payment type','payment_type'],['Refunded amount','refunded_amount']];
  const payoutFields=[['Date','date'],['Reference','reference'],['Type','type'],['Amount','amount'],['Currency','currency'],['Fee','fee'],['Status','status']];
  const filtered=()=>rows.filter(row=>(!$('payment-filter').value || row.status===$('payment-filter').value) && `${row.transaction_code} ${row.product_summary}`.toLowerCase().includes($('payment-search').value.trim().toLowerCase()));
  function table(items,head,cells) { return items.length ? `<table class="store-table" role="table"><thead role="rowgroup"><tr role="row">${head.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody role="rowgroup">${items.map(row=>`<tr role="row">${cells(row).map((cell,index)=>`<td role="cell" data-label="${escape(head[index])}"><span>${cell}</span></td>`).join('')}</tr>`).join('')}</tbody></table>`:'<p>No matching records.</p>'; }
  function render() {
    const visible=filtered();
    $('payment-count').textContent=`${visible.length} of ${rows.length} payments${complete ? '' : ' loaded so far'}. Includes in-person sales. Dates are UTC.`;
    $('store-payments').innerHTML=table(visible,['Payment','Date (UTC)','Amount','Status',''],row=>[
      `<strong>${escape(row.product_summary || 'Payment')}</strong><small>${escape(row.transaction_code)}</small>`,escape(date(row.timestamp)),escape(money(row.amount,row.currency)),escape(label(row.status)),row.id ? `<button type="button" class="btn ghost-button" data-payment="${escape(row.id)}">Details</button>`:''
    ]);
    $('payment-export').disabled=busy || !visible.length;
    $('payment-summary').replaceChildren();
    if(!complete) { $('payment-summary').textContent=busy ? 'Loading the full date range before calculating totals...' : 'Totals unavailable until the full date range loads.'; return; }
    const groups=new Map();
    for(const row of rows) {
      if(!['SUCCESSFUL','REFUNDED'].includes(row.status)) continue;
      if(!Number.isFinite(Number(row.amount)) || row.amount==='') continue;
      const group=groups.get(row.currency) || {amount:0,count:0};group.amount+=Math.round(Number(row.amount)*100);group.count++;groups.set(row.currency,group);
    }
    $('payment-summary').innerHTML=`<div><span>Payments in period</span><strong>${rows.length}</strong></div>`+[...groups].map(([currency,value])=>`<div><span>Gross payments &middot; ${escape(currency)}</span><strong>${escape(money(value.amount/100,currency))}</strong><small>${value.count} successful / refunded payments</small></div>`).join('')+'<p>Original payment values before refunds and fees. Totals cover the full date range, regardless of the filters below.</p>';
  }
  async function load() {
    if(busy || !state.authUser)return;
    const start=$('payment-start').value,end=$('payment-end').value;
    if(!start || !end || start>end || end>today || Date.parse(end)-Date.parse(start)>365*86400000){$('store-payment-status').textContent='Choose a valid date range of up to one year.';return;}
    const current=++generation;busy=true;complete=false;rows=[];payouts=[];
    $('store-refresh-payments').disabled=true;$('payout-export').disabled=true;$('store-payouts').replaceChildren();render();
    $('store-payment-status').textContent='Loading SumUp...';
    let cursor='',merchantCode='',seen=new Set();
    try {
      // Bound work on large accounts; never present a partial range as a complete total.
      for(let page=0;page<100;page++) {
        const data=await callAdminEmailFunction('getAdminStorePayments',{start,end,cursor});
        if(current!==generation || !state.authUser)return;
        if(typeof data.nextCursor !== 'string' || !Array.isArray(data.transactions))throw Error('Deploy the updated SumUp payment functions to load complete date ranges.');
        merchantCode=data.merchantCode;
        rows.push(...data.transactions.filter(row=>{const id=row.id || `${row.transaction_code}-${row.timestamp}`;if(seen.has(id))return false;seen.add(id);return true;}));
        if(!cursor){payouts=data.payouts;$('store-payouts').innerHTML=data.payoutError ? `<p>${escape(data.payoutError)}</p>` : table(payouts,['Date','Reference / type','Amount','Fee','Status'],row=>[escape(row.date),`${escape(row.reference)}<small>${escape(label(row.type))}</small>`,escape(money(row.amount,row.currency)),escape(money(row.fee,row.currency)),escape(label(row.status))]);$('payout-export').disabled=!payouts.length;}
        const next=data.nextCursor || '';
        if(!next){complete=true;break;}
        if(next===cursor)throw Error('Pagination stalled. Select a shorter date range.');
        cursor=next;render();$('store-payment-status').textContent=`Loading ${rows.length} payments...`;
      }
      $('store-payment-status').textContent=complete ? `Updated ${new Date().toLocaleTimeString()} \u00b7 ${merchantCode}`:'Range too large. Select a shorter date range to see complete totals.';
    } catch(error){if(current===generation)$('store-payment-status').textContent=`Payments unavailable. ${error.message || 'Check Connect SumUp below.'}`;}
    finally{if(current===generation){busy=false;$('store-refresh-payments').disabled=false;render();}}
  }
  function download(items,fields,name){const url=URL.createObjectURL(new Blob(['\ufeff'+csv(items,fields)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('payment-export').onclick=()=>download(filtered(),paymentFields,`sumup-payments-${complete ? 'complete':'partial'}.csv`);
  $('payout-export').onclick=()=>download(payouts,payoutFields,'sumup-payouts-latest-50.csv');
  $('payment-search').oninput=render;$('payment-filter').onchange=render;
  $('payment-range').onsubmit=event=>{event.preventDefault();load();};$('store-refresh-payments').onclick=load;
  const dialog=$('payment-dialog');
  $('payment-close').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{if(dialog.open)return;detailGeneration++;$('payment-detail').replaceChildren();$('payment-detail-status').textContent='';});
  dialog.addEventListener('cancel',event=>{if(refundBusy)event.preventDefault();});
  $('store-payments').onclick=async event=>{
    const button=event.target.closest('[data-payment]');if(!button)return;
    const current=generation,detail=++detailGeneration;
    $('payment-detail').replaceChildren();$('payment-detail-status').textContent='Loading payment...';dialog.showModal();
    try {
      const data=await callAdminEmailFunction('getAdminStorePayment',{id:button.dataset.payment});
      if(current!==generation || detail!==detailGeneration || !state.authUser)return;
      $('payment-detail-status').textContent='';
      $('payment-detail').innerHTML=`<p class="payment-detail-total">${escape(money(data.amount,data.currency))}</p><p>${escape(data.transaction_code)} &middot; ${escape(label(data.simple_status || data.status))}</p><p>${escape(date(data.timestamp))} UTC &middot; ${escape(label(data.payment_type))}</p><p>${escape(data.product_summary)}</p><h4>Payment history</h4>${table(data.events || [],['Date','Event','Amount','Status'],row=>[escape(date(row.date)),escape(label(row.type)),escape(money(row.amount,data.currency)),escape(label(row.status))])}<details><summary>Receipt details</summary>${data.receipt ? `<p>Reference: ${escape(data.receipt.transaction_code)}</p><p>Total: ${escape(money(data.receipt.amount,data.receipt.currency))} &middot; VAT: ${escape(money(data.receipt.vat_amount,data.receipt.currency))} &middot; Tip: ${escape(money(data.receipt.tip_amount,data.receipt.currency))}</p>${table(data.receipt.products || [],['Item','Quantity','Total'],row=>[escape(row.name),escape(row.quantity),escape(money(row.total_with_vat || row.total_price,data.currency))])}` : `<p>${escape(data.receiptError)}</p>`}</details><details><summary>Issue a refund</summary>${data.refund ? `<form id="payment-refund-form"><p>Available to refund: ${escape(money(data.refund.max,data.currency))}. Enter the full remaining amount or a smaller partial refund.</p><label>Refund amount (${escape(data.currency)})<input id="payment-refund-amount" class="form-control" type="number" min="${data.refund.min}" max="${data.refund.max}" step="any" value="${data.refund.max}" required></label><label class="payment-confirm"><input id="payment-refund-confirm" type="checkbox" required> I confirm this amount should be returned to the customer.</label><button class="btn ghost-button">Confirm refund</button></form>`:'<p>SumUp does not currently offer a refund for this payment.</p>'}</details>`;
      const form=$('payment-refund-form');
      if(form)form.onsubmit=async event=>{
        event.preventDefault();if(refundBusy || !state.authUser)return;
        const amount=Number($('payment-refund-amount').value);
        if(!form.reportValidity())return;
        refundBusy=true;$('payment-close').disabled=true;form.querySelector('button').disabled=true;
        $('payment-detail-status').textContent='Submitting refund...';
        try{await callAdminEmailFunction('refundAdminStorePayment',{id:data.id,amount,expectedMax:data.refund.max,requestId:crypto.randomUUID(),confirmed:$('payment-refund-confirm').checked});if(current!==generation)return;$('payment-detail-status').textContent='Refund accepted by SumUp. Reopen details after processing to see the updated status.';form.remove();await load();}
        catch(error){if(current===generation){$('payment-detail-status').textContent=error.message || 'Refund outcome unknown. Check SumUp before trying again.';form.remove();}}
        finally{refundBusy=false;$('payment-close').disabled=false;}
      };
    }catch(error){if(current===generation && detail===detailGeneration)$('payment-detail-status').textContent=error.message || 'Payment details unavailable.';}
  };
  document.addEventListener('hae-admin-account-changing',()=>{generation++;detailGeneration++;busy=false;rows=[];payouts=[];complete=false;dialog.close();$('payment-detail').replaceChildren();$('payment-detail-status').textContent='';$('payment-summary').replaceChildren();$('payment-export').disabled=true;$('payout-export').disabled=true;$('payment-search').value='';$('payment-filter').value='';});
  return {load};
}
