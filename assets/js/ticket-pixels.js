import { hasTrackingConsent, enableMetaPrivacy } from './public-site-utils.js?v=20261008-privacy-anchor';
// Scope events to the selected gig's pixel, after a separate marketing opt-in.
const initialized = new Set();
const pageViews = new Set();
export function trackGigPixel(gig, eventName = 'GigTicketClick', extra = {}) {
  const id = String(gig?.metaPixelId || '').trim();
  enableMetaPrivacy(id);
  if (!hasTrackingConsent('marketing') || !/^\d+$/.test(id) || ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname)) return false;
  try {
    if (!window.fbq) {
      const fbq = window.fbq = function() { fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments); };
      window._fbq ||= fbq; fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
      const script = document.createElement('script'); script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js'; document.head.append(script);
    }
    if (!initialized.has(id)) { window.fbq('set', 'autoConfig', false, id); window.fbq('init', id); initialized.add(id); }
    if (eventName === 'GigTicketView' && !pageViews.has(id)) {
      window.fbq('trackSingle', id, 'PageView');
      pageViews.add(id);
    }
    window.fbq('trackSingleCustom', id, eventName, {
      gig_id: gig.id || '', gig_name: gig.event || '', gig_date: gig.date || '',
      venue_name: gig.venue || '', page_name: location.pathname, ...extra
    });
    return true;
  } catch { return false; } // Ticket navigation must still work when tracking is blocked.
}
