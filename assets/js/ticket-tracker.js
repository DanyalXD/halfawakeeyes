export const ticketMethods = {sumup:'SumUp', bank:'Bank transfer', cash:'Cash', other:'Other'};
export function validateTracker(value) {
  const {settings:s, tickets} = value;
  if (!s || !['price','promoter','capacity','feeBps'].every(key => Number.isSafeInteger(s[key]) && s[key] >= 0)
    || s.price > 10000000 || s.promoter > s.price || s.capacity > 500 || s.feeBps > 10000) {
    throw Error('Check ticket price, promoter share, allocation (0–500) and fee (0–100%).');
  }
  if (!Array.isArray(tickets) || tickets.length > 500) throw Error('A tracker supports up to 500 rows.');
  const ids = new Set();
  for (const row of tickets) {
    if (typeof row.id !== 'string' || !row.id || row.id.length > 80 || ids.has(row.id)) throw Error('Ticket rows must have unique IDs.');
    ids.add(row.id);
    for (const [key,max] of [['name',200],['notes',500],['transactionRef',100],['payoutRef',100]]) {
      if (typeof row[key] !== 'string' || row[key].length > max) throw Error(`Check the ticket ${key} field.`);
    }
    if (!Object.hasOwn(ticketMethods,row.method) || !['paid','pending'].includes(row.status)) throw Error('Choose a valid payment method and status.');
    if (row.method !== 'sumup' && (row.transactionRef || row.payoutRef)) throw Error('SumUp references require the SumUp payment method.');
  }
  if (tickets.filter(row => row.name.trim()).length > s.capacity) throw Error('Named tickets exceed the allocation. Increase the allocation first.');
  return value;
}

export function ticketAmounts(settings, row) {
  if (!row.name.trim()) return {value:0, fee:0, ours:0, net:0, promoter:0};
  const fee = row.method === 'sumup' ? Math.round(settings.price * settings.feeBps / 10000) : 0;
  const ours = settings.price - settings.promoter;
  return {value:settings.price, fee, ours, net:ours-fee, promoter:settings.promoter};
}

export function summarizeTracker({settings, tickets}) {
  const totals = {count:0,value:0,paid:0,pending:0,fees:0,ours:0,net:0,promoter:0,paidPromoter:0,sumupNet:0};
  for (const row of tickets) {
    if (!row.name.trim()) continue;
    const amount = ticketAmounts(settings,row);
    totals.count++; totals.value += amount.value; totals.fees += amount.fee;
    totals.ours += amount.ours; totals.net += amount.net; totals.promoter += amount.promoter;
    totals[row.status === 'paid' ? 'paid' : 'pending'] += amount.value;
    if (row.status === 'paid') {
      totals.paidPromoter += amount.promoter;
      if (row.method === 'sumup') totals.sumupNet += amount.value - amount.fee;
    }
  }
  return totals;
}

// shortcut: one document supports up to 500 rows; use per-ticket documents for larger allocations.
// A stale editor must reload instead of overwriting another admin.
export async function saveTracker({db,doc,runTransaction}, gigId, value, revision) {
  validateTracker(value);
  const ref = doc(db,'admin-ticket-trackers',gigId);
  await runTransaction(db,async tx => {
    const gig = await tx.get(doc(db,'gigs',gigId));
    const existing = await tx.get(ref);
    if (!gig.exists()) throw Error('This gig no longer exists. Export your tickets before closing.');
    if ((existing.exists() ? existing.data().revision : 0) !== revision) throw Error('Another admin changed this tracker. Export your edits, then reload before saving.');
    tx.set(ref,{...value,revision:revision+1});
  });
  return revision+1;
}
