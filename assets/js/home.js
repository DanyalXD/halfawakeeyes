import { canBuyTickets, gigDetailLabel } from './gig-tools.js';
import { createEmailSignupService, firebaseConfig, getTrackingParams, normalizePublicUrl, PUBLIC_MIRROR_DOC_ID } from './public-site-utils.js';
import { applyHomeContent } from './home-content.js';

const form = document.getElementById('home-signup');
const status = document.getElementById('signup-status');
const button = form.querySelector('button');
const details = document.getElementById('next-show-details');
const showLink = document.getElementById('next-show-link');

async function loadNextShow(db, doc, getDoc) {
  try {
    const snapshot = await getDoc(doc(db, 'gigs', PUBLIC_MIRROR_DOC_ID));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const items = snapshot.data()?.items;
    if (!Array.isArray(items)) throw new Error('Show listings unavailable');
    const shows = items.map(show => ({
      ...show,
      parsedDate: new Date(/^\d{4}-\d{2}-\d{2}$/.test(show.date || '') ? `${show.date}T00:00:00` : show.date)
    })).filter(show => String(show.hideFromLinks).toLowerCase() !== 'true' && show.parsedDate >= today)
      .sort((a, b) => a.parsedDate - b.parsedDate);
    if (!shows.length) {
      details.textContent = 'New dates coming soon. Join the list for announcements.';
      showLink.href = '#contact';
      showLink.textContent = 'Get show updates';
      return;
    }
    const show = shows[0];
    const title = document.createElement('h2');
    title.textContent = show.event || 'Half Awake Eyes live';
    const info = document.createElement('p');
    const date = document.createElement('time');
    date.dateTime = show.date;
    date.textContent = show.parsedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    info.append(date, ` · ${[show.venue, show.city].filter(Boolean).join(', ')}`);
    const showDetails = document.createElement('p'); showDetails.textContent = gigDetailLabel(show);
    details.replaceChildren(title, info, showDetails);
    showLink.href = '/shows/' + encodeURIComponent(show.id); showLink.textContent = 'Show details';
    const ticketUrl = normalizePublicUrl(show.ticketUrl);
    if (ticketUrl && canBuyTickets(show)) {
      showLink.href = '/shows/' + encodeURIComponent(show.id);
      showLink.target = '_blank';
      showLink.rel = 'noopener noreferrer';
      showLink.textContent = 'Get tickets ↗';
    }
  } catch {
    details.textContent = 'Find upcoming shows and ticket information.';
  }
}

async function initializeHome() {
  try {
    const [{ initializeApp }, { doc, getDoc, getFirestore, setDoc }] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js')
    ]);
    const db = getFirestore(initializeApp(firebaseConfig));
    getDoc(doc(db, 'site-content', 'homepage')).then(snapshot => {
      if (snapshot.exists()) applyHomeContent(snapshot.data());
    }).catch(() => { /* Keep the built-in homepage if content cannot be loaded. */ });
    void loadNextShow(db, doc, getDoc);
    const { submitEmailSignup } = createEmailSignupService({
      db, doc, setDoc,
      getContext: () => ({ ...getTrackingParams(), pageName: 'home', pagePath: location.pathname })
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (button.disabled || !form.reportValidity()) return;
      button.disabled = true;
      form.setAttribute('aria-busy', 'true');
      status.textContent = 'Joining the list…';
      try {
        await submitEmailSignup(form.elements.email.value.trim(), { label: 'Homepage signup' });
        form.reset();
        status.textContent = 'Thanks, you’re on the list. See you at a show.';
      } catch {
        status.textContent = 'We couldn’t save your signup. Please try again or email us using the link below.';
      } finally {
        button.disabled = false;
        form.removeAttribute('aria-busy');
      }
    });
    button.disabled = false;
    status.textContent = '';
  } catch {
    status.textContent = 'Signup is unavailable right now. Use the Email link below to ask to join the list.';
  }
}

void initializeHome();
