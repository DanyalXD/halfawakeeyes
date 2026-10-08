import {ticketMethods, ticketAmounts, summarizeTracker, validateTracker, saveTracker} from './ticket-tracker.js?v=20261008-tickets';
import {csv} from './admin-payments.js?v=20261005-sumup-collapse';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(value/100);
export function setupTicketTracker(api) {
  const {state,db,doc,getDoc,getDocs,collection,setActivePage} = api;
  document.querySelector('.dashboard-content').insertAdjacentHTML('beforeend',`<section id="ticket-tracker-page" class="dashboard-page" aria-labelledby="tracker-title"><div id="ticket-tracker">
    <header class="tracker-header"><div><span class="eyebrow">Private gig finances</span><h2 id="tracker-title">Ticket tracker</h2><p id="tracker-gig">Choose a gig to manage its ticket sales.</p></div><button type="button" class="btn ghost-button" id="tracker-back">Back to gigs</button></header>
    <div class="tracker-picker"><label for="tracker-select">Gig</label><select class="form-control" id="tracker-select"><option value="">Choose a gig</option></select><button type="button" class="btn ghost-button" id="tracker-refresh-gigs">Refresh gigs</button></div>
    <p id="tracker-status" role="status" aria-live="polite">Choose a gig to open its tracker.</p>
    <form id="tracker-form" hidden><fieldset id="tracker-fields" disabled>
      <div class="tracker-settings">
        <label>Ticket price (£)<input class="form-control" id="tracker-price" type="number" min="0" max="100000" step="0.01" required></label>
        <label>Promoter per ticket (£)<input class="form-control" id="tracker-promoter" type="number" min="0" max="100000" step="0.01" required></label>
        <label>Tickets available<input class="form-control" id="tracker-capacity" type="number" min="0" max="500" step="1" required></label>
      </div>
      <p class="tracker-help">Every named ticket uses this price and promoter share. Changing them recalculates the whole sheet. Blank names are excluded. <span id="tracker-fee-note">SumUp fees are applied automatically at 2.5%, rounded per ticket.</span> Bank transfers and cash have no fee. Fees shown are estimates.</p>
      <div id="tracker-summary" class="tracker-summary" aria-live="polite"></div>
      <div class="tracker-actions"><button type="button" class="btn ghost-button" id="tracker-add">Add ticket</button><button type="button" class="btn ghost-button" id="tracker-export">Export CSV</button><button type="button" class="btn ghost-button" id="tracker-sumup">Open SumUp</button><button type="button" class="btn ghost-button" id="tracker-reload">Reload saved</button><button class="btn btn-accent" id="tracker-save">Save tracker</button></div>
      <p class="tracker-help">Transaction and payout references are manual links to the SumUp records. They do not verify payment or bank settlement. The same payout can cover several tickets.</p>
      <div class="tracker-scroll" tabindex="0" role="region" aria-label="Ticket sheet, scroll horizontally for references and notes"><table class="tracker-table"><thead><tr>${['No.','Name','Ticket value','Payment method','SumUp fee','Our amount','Our net','Promoter','Payment status','Transaction reference','Payout reference','Notes',''].map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody id="tracker-rows"></tbody></table></div>
      <p id="tracker-empty" class="tracker-help">No tickets yet. Add a ticket to start your guest list.</p>
    </fieldset></form></div></section>`);
  const $ = id => document.getElementById(id);
  let sheet=null, gig=null, revision=0, dirty=false, busy=false, generation=0, listGeneration=0, gigs=[];
  function message(text) { $('tracker-status').textContent=text; }
  function readSettings() {
    const scaled = id => {
      const text=$(id).value;
      if (!/^\d+(\.\d{1,2})?$/.test(text)) throw Error('Enter non-negative amounts with at most two decimal places.');
      return Math.round(Number(text)*100);
    };
    if (!/^\d+$/.test($('tracker-capacity').value)) throw Error('Enter a whole number of tickets.');
    return {price:scaled('tracker-price'),promoter:scaled('tracker-promoter'),capacity:Number($('tracker-capacity').value),feeBps:sheet.settings.feeBps};
  }
  function currentSheet() { return {...sheet,settings:readSettings()}; }
  function totals() {
    try {
      const value=currentSheet(); validateTracker(value);
      const t=summarizeTracker(value);
      const stats=[['Named / available',`${t.count} / ${value.settings.capacity}`],['Ticket value',money(t.value)],['Confirmed paid',money(t.paid)],['Pending payment',money(t.pending)],['Our amount before fees',money(t.ours)],['Estimated SumUp fees',money(t.fees)],['Our amount after fees',money(t.net)],['Promoter · all named',money(t.promoter)],['Promoter · paid tickets',money(t.paidPromoter)],['Paid SumUp · expected net',money(t.sumupNet)]];
      $('tracker-summary').innerHTML=stats.map(([label,value])=>`<div><span>${label}</span><strong>${escape(value)}</strong></div>`).join('');
      for (const tr of $('tracker-rows').rows) {
        const row=sheet.tickets.find(row=>row.id===tr.dataset.id), amount=ticketAmounts(value.settings,row);
        tr.querySelectorAll('[data-amount]').forEach(cell=>cell.textContent=money(amount[cell.dataset.amount]));
      }
    } catch (error) { $('tracker-summary').textContent=error.message; }
  }
  function renderRows() {
    $('tracker-rows').innerHTML=sheet.tickets.map((row,index)=>{
      const input=(field,label,max)=>`<input class="form-control" data-field="${field}" aria-label="${label}, ticket ${index+1}" maxlength="${max}" value="${escape(row[field])}">`;
      const select=(field,options,label)=>`<select class="form-control" data-field="${field}" aria-label="${label}, ticket ${index+1}">${Object.entries(options).map(([key,text])=>`<option value="${key}" ${row[field]===key?'selected':''}>${text}</option>`).join('')}</select>`;
      const amount=key=>`<td data-amount="${key}"></td>`;
      return `<tr data-id="${escape(row.id)}"><th scope="row">${index+1}</th><td>${input('name','Name',200)}</td>${amount('value')}<td>${select('method',ticketMethods,'Payment method')}</td>${amount('fee')}${amount('ours')}${amount('net')}${amount('promoter')}<td>${select('status',{pending:'Pending',paid:'Paid'},'Payment status')}</td><td>${input('transactionRef','SumUp transaction reference',100)}</td><td>${input('payoutRef','SumUp payout reference',100)}</td><td>${input('notes','Notes',500)}</td><td><button type="button" class="btn ghost-button" data-remove="${escape(row.id)}" aria-label="Remove ticket ${index+1}">Remove</button></td></tr>`;
    }).join('');
    $('tracker-empty').hidden=sheet.tickets.length>0;
    $('tracker-add').disabled=sheet.tickets.length>=500;
    totals();
  }
  async function open(selectedGig) {
    if (!state.authUser || busy) return;
    if (dirty && !window.confirm('Discard unsaved ticket changes?')) { $('tracker-select').value=gig?.id || ''; return; }
    if (state.activePage !== 'ticket-tracker') await setActivePage('ticket-tracker');
    if (!state.authUser || state.activePage !== 'ticket-tracker') return;
    const request=++generation, uid=state.authUser.uid;
    gig=selectedGig; sheet=null; dirty=false;
    $('tracker-select').value=gig.id;
    $('tracker-title').textContent=`${gig.event || 'Gig'} ticket tracker`;
    $('tracker-gig').textContent=[gig.date,gig.venue,gig.city].filter(Boolean).join(' · ');
    $('tracker-fields').disabled=true; $('tracker-rows').replaceChildren(); $('tracker-summary').replaceChildren();
    $('tracker-form').hidden=false;
    message('Loading tracker…');
    try {
      const saved=await getDoc(doc(db,'admin-ticket-trackers',gig.id));
      if (request!==generation || uid!==state.authUser?.uid) return;
      const listedPrice=Number(String(gig.ticketPrice || '').replace(/^£/,''));
      sheet=saved.exists()?saved.data():{settings:{price:Number.isFinite(listedPrice)&&listedPrice>0?Math.round(listedPrice*100):2250,promoter:0,capacity:30,feeBps:250},tickets:[]};
      validateTracker(sheet); revision=saved.exists()?sheet.revision:0;
      if (!Number.isSafeInteger(revision) || revision<0) throw Error('This tracker has an unsupported version.');
      $('tracker-price').value=(sheet.settings.price/100).toFixed(2);
      $('tracker-promoter').value=(sheet.settings.promoter/100).toFixed(2);
      $('tracker-capacity').value=sheet.settings.capacity;
      $('tracker-fee-note').textContent=`SumUp fees are applied automatically at ${sheet.settings.feeBps/100}%, rounded per ticket.`;
      $('tracker-fields').disabled=false; renderRows();
      message(saved.exists()?'Tracker loaded.':'Set the ticket price, promoter share and allocation, then add names.');
    } catch { if (request===generation) {sheet=null; message('Could not load the tracker. Check your connection and deployed access rules, then use Refresh gigs to retry.');} }
  }
  async function load() {
    if (!state.authUser) return;
    const request=++listGeneration,uid=state.authUser.uid;
    $('tracker-refresh-gigs').disabled=true;
    if (!gig) message('Loading gigs…');
    try {
      const snapshot=await getDocs(collection(db,'gigs'));
      if (request!==listGeneration || uid!==state.authUser?.uid) return;
      gigs=snapshot.docs.filter(row=>row.id!=='public-index').map(row=>({...row.data(),id:row.id})).sort((a,b)=>String(b.date || '').localeCompare(String(a.date || '')));
      const options=[...gigs];
      if (gig && !options.some(item=>item.id===gig.id)) options.push(gig);
      $('tracker-select').innerHTML='<option value="">Choose a gig</option>'+options.map(item=>`<option value="${escape(item.id)}">${escape([item.event || 'Live show',item.date,item.venue].filter(Boolean).join(' · '))}</option>`).join('');
      $('tracker-select').value=gig?.id || '';
      if (!gig) message(gigs.length?'Choose a gig to open its tracker.':'No gigs yet. Add a gig in Gig Manager first.');
    } catch { if(request===listGeneration)message('Could not load gigs. Check your connection and use Refresh gigs to retry.'); }
    finally {if(request===listGeneration)$('tracker-refresh-gigs').disabled=false;}
  }
  $('tracker-select').onchange=()=>{
    const selected=gigs.find(item=>item.id===$('tracker-select').value);
    if (!selected || busy) { $('tracker-select').value=gig?.id || ''; return; }
    open(selected);
  };
  $('tracker-refresh-gigs').onclick=async()=>{await load();if(gig && !sheet && !busy)await open(gig);};
  $('tracker-back').onclick=()=>setActivePage('gigs');
  $('tracker-reload').onclick=()=>open(gig);
  $('tracker-sumup').onclick=()=>setActivePage('sumup');
  $('tracker-form').addEventListener('input',event=>{
    if (!sheet || busy) return;
    const field=event.target.dataset.field;
    if (field) sheet.tickets.find(row=>row.id===event.target.closest('tr').dataset.id)[field]=event.target.value;
    dirty=true; message('Unsaved changes'); totals();
  });
  $('tracker-add').onclick=()=>{
    sheet.tickets.push({id:crypto.randomUUID(),name:'',method:'sumup',status:'pending',transactionRef:'',payoutRef:'',notes:''});
    dirty=true; message('Unsaved changes'); renderRows();
    $('tracker-rows').lastElementChild.querySelector('input').focus();
  };
  $('tracker-rows').onclick=event=>{
    const button=event.target.closest('[data-remove]'); if (!button) return;
    const row=sheet.tickets.find(row=>row.id===button.dataset.remove);
    if ((row.name || row.notes || row.transactionRef || row.payoutRef) && !window.confirm('Remove this ticket from the tracker? Save to confirm the removal.')) return;
    sheet.tickets=sheet.tickets.filter(ticket=>ticket.id!==row.id);
    dirty=true; message('Unsaved changes'); renderRows(); $('tracker-add').focus();
  };
  $('tracker-form').onsubmit=async event=>{
    event.preventDefault(); if (busy || !sheet || !state.authUser) return;
    let value;
    try { value=validateTracker(currentSheet()); } catch(error) { message(error.message); return; }
    const request=generation; busy=true; $('tracker-fields').disabled=true; message('Saving tracker…');
    try {
      const next=await saveTracker(api,gig.id,{settings:value.settings,tickets:value.tickets},revision);
      if (request!==generation) return;
      revision=next; sheet=value; dirty=false; message('Tracker saved.');
    } catch(error) { if(request===generation)message(error.message || 'Save failed. Your edits are still here; retry or export them.'); }
    finally { if(request===generation){busy=false;$('tracker-fields').disabled=false;} }
  };
  $('tracker-export').onclick=()=>{
    try {
      const value=currentSheet(); validateTracker(value);
      const rows=value.tickets.map((row,index)=>({...row,number:index+1,...Object.fromEntries(Object.entries(ticketAmounts(value.settings,row)).map(([key,pence])=>[key,(pence/100).toFixed(2)]))}));
      const fields=[['Ticket no.','number'],['Name','name'],['Ticket value GBP','value'],['Payment method','method'],['Estimated fee GBP','fee'],['Our amount GBP','ours'],['Our net GBP','net'],['Promoter GBP','promoter'],['Payment status','status'],['SumUp transaction reference','transactionRef'],['SumUp payout reference','payoutRef'],['Notes','notes']];
      const url=URL.createObjectURL(new Blob(['\uFEFF'+csv(rows,fields)],{type:'text/csv;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download=`gig-${gig.id}-tickets.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch(error) { message(error.message); }
  };
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  document.addEventListener('hae-admin-account-changing',()=>{
    generation++; listGeneration++; dirty=false; busy=false; sheet=null; gig=null; revision=0; gigs=[];
    $('tracker-form').hidden=true; $('tracker-select').innerHTML='<option value="">Choose a gig</option>'; $('tracker-refresh-gigs').disabled=false;
    $('tracker-form').reset(); $('tracker-fields').disabled=true; $('tracker-rows').replaceChildren();$('tracker-summary').replaceChildren();$('tracker-title').textContent='Ticket tracker';$('tracker-gig').textContent='';message('');
  });
  return {open,load};
}
