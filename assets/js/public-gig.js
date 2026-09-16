const params = new URLSearchParams(location.search);
let id = params.get('gig');
if (!id) {
  try { id = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || ''); } catch { id = ''; }
}
function decode(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key,v]) => [key,decode(v)]));
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  return null;
}
function showError(message) {
  document.querySelectorAll('[data-gig-ticket], #gig-sticky-action').forEach(el => el.remove());
  const main = document.querySelector('main');
  main.replaceChildren();
  const heading = document.createElement('h1'); heading.textContent = message;
  heading.style.cssText = 'font: 600 24px var(--font-body); text-align:center';
  main.append(heading);
  document.title = message + ' | Half Awake Eyes';
}
document.querySelectorAll('[data-gig-ticket]').forEach(link => { link.hidden = true; });
try {
  if (!id || id === 'public-index' || /[/\\]/.test(id)) throw new Error('missing');
  const response = await fetch('https://firestore.googleapis.com/v1/projects/half-awake-eyes/databases/(default)/documents/gigs/' + encodeURIComponent(id), {signal: AbortSignal.timeout(12000)});
  if (response.status === 404) throw new Error('missing');
  if (!response.ok) throw new Error('network');
  const record = await response.json();
  const gig = Object.fromEntries(Object.entries(record.fields || {}).map(([key,v]) => [key,decode(v)]));
  if (String(gig.hideFromLinks ?? gig.hidden).toLowerCase() === 'true' || !/^\d{4}-\d{2}-\d{2}$/.test(gig.date || '')) throw new Error('missing');
  const html = window.HAEGigPage.renderGigPage(gig, id);
  const next = new DOMParser().parseFromString(html, 'text/html');
  document.title = next.title;
  for (const selector of ['meta[name="description"]','link[rel="canonical"]','meta[property^="og:"]','script[type="application/ld+json"]']) {
    document.head.querySelectorAll(selector).forEach(node => node.remove());
    next.head.querySelectorAll(selector).forEach(node => document.head.append(node.cloneNode(true)));
  }
  next.body.querySelectorAll('script').forEach(node => node.remove());
  document.body.replaceWith(next.body);
  await import('./gig-page.js');
  await import('./public-ticket-actions.js');
} catch (error) {
  if (!document.querySelector('[data-gig-ticket]:not([hidden])')) {
    showError(error.message === 'missing' ? 'Show not found' : 'Could not load this show. Please refresh to try again.');
  }
}
