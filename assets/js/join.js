import { createEmailSignupService, createSiteAnalytics, firebaseConfig, getTrackingParams, isValidEmailAddress } from './public-site-utils.js';

const form = document.getElementById('signup-form');
const input = document.getElementById('signup-email');
const button = document.getElementById('signup-submit');
const status = document.getElementById('signup-status');
const setStatus = (text, error = false) => {
  status.textContent = text;
  status.classList.toggle('is-error', error);
};

async function initialise() {
  try {
    const [{ initializeApp }, { getFirestore, doc, setDoc }] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js')
    ]);
    const db = getFirestore(initializeApp(firebaseConfig));
    const context = { ...getTrackingParams(), pageName: 'join', pagePath: location.pathname, section: 'mailing-list' };
    const service = createEmailSignupService({ db, doc, setDoc, getContext: () => context });
    const analytics = createSiteAnalytics({ db, doc, setDoc, pageName: context.pageName, pagePath: context.pagePath,
      isDisabled: ['localhost', '127.0.0.1', ''].includes(location.hostname), getContext: () => context });
    void analytics.logPageViewOnce();
    button.disabled = false;
    setStatus('');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (button.disabled) return;
      if (!isValidEmailAddress(input.value)) {
        setStatus('Enter a valid email address.', true);
        input.focus();
        return;
      }
      button.disabled = true;
      button.textContent = 'Joining…';
      form.setAttribute('aria-busy', 'true');
      setStatus('');
      try {
        await service.submitEmailSignup(input.value, { label: 'Signup page' });
        void analytics.logEvent('email_signup', { target: 'mailing-list', label: 'Signup page', elementType: 'form', actionSubtype: 'email_signup', section: 'mailing-list' });
        form.reset();
        button.textContent = 'You’re on the list';
        input.hidden = true;
        form.querySelector('label').hidden = true;
        setStatus('Thanks for joining. Keep an eye on your inbox for news from the band.');
      } catch {
        setStatus('We couldn’t save your signup. Please try again in a moment.', true);
        button.disabled = false;
        button.textContent = 'Join the list';
      } finally {
        form.removeAttribute('aria-busy');
      }
    });
  } catch {
    setStatus('Signup couldn’t load. Please refresh the page and try again.', true);
  }
}
void initialise();
