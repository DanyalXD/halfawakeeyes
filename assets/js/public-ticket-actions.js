import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { doc, setDoc, getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { firebaseConfig, createSiteAnalytics, getTrackingParams } from './public-site-utils.js';
import { trackGigPixel } from './ticket-pixels.js';

const analytics = createSiteAnalytics({
  db: getFirestore(getApps()[0] || initializeApp(firebaseConfig)), doc, setDoc,
  pagePath: location.pathname, pageName: 'Tickets',
  isDisabled: ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname),
  getContext: () => getTrackingParams()
});
export function bindTicketAction(link, gig) {
  if (link.dataset.ticketTracked) return;
  link.dataset.ticketTracked = 'true';
  const track = event => {
    if (event.type === 'auxclick' && event.button !== 1) return;
    trackGigPixel(gig, 'GigTicketClick', { destination_url: link.href });
    void analytics.logEvent('click', { target: gig.id, label: gig.event, href: link.href, section: 'tickets', elementType: 'link', outbound: true });
  };
  link.addEventListener('click', track);
  link.addEventListener('auxclick', track);
}
document.querySelectorAll('[data-gig-ticket]').forEach(link => {
  try { bindTicketAction(link, JSON.parse(link.dataset.gigTicket)); } catch { /* Leave link usable. */ }
});
