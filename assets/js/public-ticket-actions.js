import { firebaseConfig, createSiteAnalytics, getTrackingParams, enableMetaPrivacy } from './public-site-utils.js?v=20261008-privacy-anchor';
import { trackGigPixel } from './ticket-pixels.js?v=20261008-privacy-anchor';

// Both trackers check their own consent category.
const analytics = Promise.all([
  import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
  import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js')
]).then(([{ initializeApp, getApps }, { doc, setDoc, serverTimestamp, getFirestore }]) => createSiteAnalytics({serverTimestamp,
  db: getFirestore(getApps()[0] || initializeApp(firebaseConfig)), doc, setDoc,
  pagePath: location.pathname, pageName: 'Tickets',
  isDisabled: ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname),
  getContext: () => getTrackingParams()
})).catch(() => null);

function logAnalytics(method, ...args) {
  void analytics.then(client => client?.[method](...args)).catch(() => {});
}

export function bindTicketAction(link, gig) {
  enableMetaPrivacy(gig?.metaPixelId);
  if (link.dataset.ticketTracked) return;
  link.dataset.ticketTracked = 'true';
  const track = event => {
    if (event.type === 'auxclick' && event.button !== 1) return;
    trackGigPixel(gig, 'GigTicketClick', { destination_url: link.href });
    logAnalytics('logEvent', 'click', { target: gig.id, label: gig.event, href: link.href, section: 'tickets', elementType: 'link', outbound: true });
  };
  link.addEventListener('click', track);
  link.addEventListener('auxclick', track);
}
document.querySelectorAll('[data-gig-ticket]').forEach(link => {
  try { bindTicketAction(link, JSON.parse(link.dataset.gigTicket)); } catch { /* Leave link usable. */ }
});

const gigPage = document.querySelector('[data-gig-page]');
if (gigPage) {
  try {
    const gig = JSON.parse(gigPage.dataset.gigPage);
    trackGigPixel(gig, 'GigTicketView');
    logAnalytics('logPageViewOnce', { label: gig.event, target: gig.id, section: 'tickets' }, `hae-gig-view:${gig.id}`);
  } catch { /* Keep the event page usable if tracking is unavailable. */ }
}

window.addEventListener('hae-consent-change', () => {
  if (gigPage) {try {trackGigPixel(JSON.parse(gigPage.dataset.gigPage), 'GigTicketView');} catch {}}
});
