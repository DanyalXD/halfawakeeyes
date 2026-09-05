export const gigStatuses = { available: 'Tickets available', sold_out: 'Sold out', cancelled: 'Cancelled', postponed: 'Postponed' };
export function normalizeGigDetails(gig = {}) {
  return {
    status: Object.hasOwn(gigStatuses, gig.status) ? gig.status : 'available',
    doorsTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(gig.doorsTime || '') ? gig.doorsTime : '',
    ageRestriction: String(gig.ageRestriction || '').trim().slice(0, 100)
  };
}
export function canBuyTickets(gig) { return normalizeGigDetails(gig).status === 'available'; }
export function gigDetailLabel(gig) {
  const d = normalizeGigDetails(gig);
  return [d.status !== 'available' ? gigStatuses[d.status] : '', d.doorsTime ? `Doors ${d.doorsTime}` : '', d.ageRestriction].filter(Boolean).join(' · ');
}
export function campaignTrackingUrl(base, campaign, source) {
  const url = new URL(base);
  url.searchParams.set('campaign', campaign);
  url.searchParams.set('utm_campaign', campaign);
  url.searchParams.set('utm_source', source);
  url.searchParams.set('utm_medium', source === 'poster' ? 'qr' : 'social');
  return url.href;
}
export function summarizeTraffic(events, signups, now = Date.now()) {
  const week = 7 * 86400000;
  const result = { clicks: [0, 0], signups: [0, 0], sources: Object.create(null) };
  const date = value => value?.toMillis?.() ?? new Date(value).getTime();
  const period = value => { const age = now - date(value); return age >= 0 && age < week * 2 ? Math.floor(age / week) : -1; };
  const source = item => {
    if (item.source) return String(item.source).slice(0, 80);
    try { return new URL(item.referrer).hostname; } catch { return 'Direct / unknown'; }
  };
  const count = (item, key, time) => {
    const p = period(time); if (p < 0) return;
    result[key][p]++;
    if (!p) { const label = source(item); result.sources[label] ||= { clicks: 0, signups: 0 }; result.sources[label][key]++; }
  };
  events.filter(e => (e.action === 'click' && /ticket/i.test(`${e.section || ''} ${e.label || ''}`)) || (e.action === 'ticket_redirect_continue' && e.actionSubtype !== 'auto')).forEach(e => count(e, 'clicks', e.timestamp));
  signups.forEach(s => count(s, 'signups', s.createdAt || s.updatedAt));
  return result;
}
