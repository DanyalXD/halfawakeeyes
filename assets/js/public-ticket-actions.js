import { firebaseConfig, createSiteAnalytics, getTrackingParams } from './public-site-utils.js';
import { trackGigPixel } from './ticket-pixels.js';

// Advertising pixels must still run if the separate site analytics SDK cannot load.
const analytics = Promise.all([
  import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
  import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js')
]).then(([{ initializeApp, getApps }, { doc, setDoc, getFirestore }]) => createSiteAnalytics({
  db: getFirestore(getApps()[0] || initializeApp(firebaseConfig)), doc, setDoc,
  pagePath: location.pathname, pageName: 'Tickets',
  isDisabled: ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname),
  getContext: () => getTrackingParams()
})).catch(() => null);

function logAnalytics(method, ...args) {
  void analytics.then(client => client?.[method](...args)).catch(() => {});
}

export function bindTicketAction(link, gig) {
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
