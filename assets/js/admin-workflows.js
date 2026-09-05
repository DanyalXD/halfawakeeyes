import { homeDefaults, validateHomeContent, safeContentUrl } from './home-content.js';
import { canBuyTickets, gigDetailLabel } from './gig-tools.js';

const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fields = {
  releaseTitle: 'Release title', releaseDescription: 'Release introduction', releaseArtwork: 'Release artwork URL or asset path', firstTrack: 'Suggested first track',
  spotify: 'Spotify album URL', bandcamp: 'Bandcamp URL', youtube: 'YouTube URL',
  merchTitle: 'Merch title', merchPrice: 'Displayed price', merchAvailability: 'Sizes and availability', merchImage: 'Merch image URL or asset path', merchUrl: 'Shop product URL'
};

export function mountWorkflows() {
  const nav = document.querySelector('.dashboard-rail .nav');
  nav.insertAdjacentHTML('afterbegin', '<li class="nav-item"><a class="nav-link tab-label" href="#" data-page="overview">Overview</a></li>');
  nav.insertAdjacentHTML('beforeend', '<li class="nav-item"><a class="nav-link tab-label" href="#" data-page="homepage">Homepage</a></li>');
  const icons = {
    overview: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    analytics: '<path d="M4 20V10m8 10V4m8 16v-7"/>',
    gigs: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/>',
    links: '<path d="m10 14 4-4m-6 6-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1"/>',
    email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
    campaigns: '<path d="m3 10 17-6v16L3 14zM6 15l2 6h4l-2-5"/>',
    settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
    homepage: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>'
  };
  nav.querySelectorAll('[data-page]').forEach(link => {
    link.insertAdjacentHTML('afterbegin', `<svg class="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[link.dataset.page] || ''}</svg>`);
  });
  document.querySelector('.dashboard-content').insertAdjacentHTML('beforeend', `
    <div id="overview-page" class="dashboard-page">
      <div class="summary-panel"><h2>Overview</h2><p>A quick look at your shows, audience and inbox.</p><p id="overview-status" role="status"></p></div>
      <div id="overview-cards" class="workflow-grid"></div>
      <div class="manager-card"><h3>Quick actions</h3><div class="workflow-actions"><button type="button" class="btn btn-accent" data-workflow-page="gigs">Manage gigs</button><button type="button" class="btn ghost-button" data-workflow-page="homepage">Edit homepage</button><button type="button" class="btn ghost-button" data-workflow-page="email">Open email</button><a class="btn ghost-button" href="./" target="_blank" rel="noopener">View site ↗</a></div></div>
    </div>
    <div id="homepage-page" class="dashboard-page">
      <div class="summary-panel"><h2>Homepage</h2><p>Update the featured release and merch. Publishing changes the public homepage.</p></div>
      <form id="homepage-form" class="manager-card"><div class="workflow-grid">${Object.entries(fields).map(([key, label]) => `<label>${label}${["releaseDescription", "merchAvailability"].includes(key) ? `<textarea class="form-control" name="${key}" rows="3" maxlength="600" required>${escape(homeDefaults[key])}</textarea>` : `<input class="form-control" name="${key}" maxlength="600" required value="${escape(homeDefaults[key])}">`}</label>`).join('')}</div>
      <div class="workflow-actions"><button type="button" id="preview-homepage" class="btn ghost-button">Preview changes</button><button id="publish-homepage" class="btn btn-accent" disabled>Publish homepage</button></div><p id="homepage-status" role="status">Load this page to edit content.</p></form>
      <div id="homepage-preview" class="manager-card" hidden></div>
    </div>`);
}

export function setupWorkflows(api) {
  const { state, db, doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc, setActivePage, callAdminEmailFunction, normalizeEmailMessage } = api;
  const dirty = new Set();
  let overviewLoading = false;
  let homeLoaded = false;
  let homeBusy = false;
  for (const kind of ['gigs', 'links']) {
    const panel = document.createElement('div'); panel.className = 'workflow-publish manager-card';
    panel.innerHTML = `<p id="${kind}-publish-status" role="status">Public publishing status will appear here.</p><button type="button" class="btn ghost-button" id="${kind}-publish-retry" hidden>Retry publishing</button>`;
    $(`${kind}-page`).prepend(panel);
    $(`${kind}-publish-retry`).addEventListener('click', async () => {
      const button = $(`${kind}-publish-retry`); button.disabled = true;
      try { await (kind === 'gigs' ? api.loadGigs() : api.loadLinks()); } finally { button.disabled = false; }
    });
  }
  function publishStatus(kind, message, failed = false) {
    $(`${kind}-publish-status`).textContent = message;
    $(`${kind}-publish-status`).parentElement.dataset.status = failed ? 'error' : message.startsWith('Published.') ? 'success' : 'pending';
    $(`${kind}-publish-retry`).hidden = !failed;
  }
  const tracked = ['gig-form', 'gig-edit-form', 'link-form', 'link-edit-form', 'homepage-form', 'campaign-form'];
  const markSaved = id => dirty.delete(id);
  function discard(id) { $(id)?.reset(); $(id)?.querySelector('.workflow-preview')?.remove(); dirty.delete(id); }
  const allowClose = id => !dirty.has(id) || (window.confirm('Discard your unsaved changes?') && (discard(id), true));
  tracked.forEach(id => {
    $(id)?.addEventListener('input', () => dirty.add(id));
    $(id)?.addEventListener('change', () => dirty.add(id));
    $(id)?.addEventListener('reset', () => dirty.delete(id));
  });
  window.addEventListener('beforeunload', event => { if (dirty.size) { event.preventDefault(); event.returnValue = ''; } });
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-page], [data-workflow-page], #sign-out')) return;
    if (dirty.size && !window.confirm('Discard unsaved changes and leave this page?')) { event.preventDefault(); event.stopImmediatePropagation(); }
    else [...dirty].forEach(discard);
  }, true);
  document.querySelectorAll('[data-workflow-page]').forEach(button => button.addEventListener('click', () => setActivePage(button.dataset.workflowPage)));
  const account = document.querySelector('.admin-account');
  document.addEventListener('click', event => {
    if (account?.open && !account.contains(event.target)) account.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && account?.open) { account.open = false; account.querySelector('summary').focus(); }
  });

  function previewCard(form, type) {
    const read = suffix => form.querySelector(`[id$="-${suffix}"]`)?.value.trim() || '';
    const isGig = type === 'gig';
    const title = read(isGig ? 'event' : 'title') || 'Untitled';
    const detail = isGig ? [read('date'), read('venue'), read('city')].filter(Boolean).join(' · ') : read('description');
    let output = form.querySelector('.workflow-preview');
    if (!output) { output = document.createElement('div'); output.className = 'workflow-preview'; output.setAttribute('aria-live', 'polite'); form.append(output); }
    const image = safeContentUrl(read('image-url'), true);
    output.innerHTML = `<small>Card preview · not published</small>${image ? `<p><img class="workflow-art" src="${escape(image)}" alt="Card artwork"></p>` : ''}<h3>${escape(title)}</h3><p>${escape(detail)}</p><span>${isGig ? read('ticket-url') ? 'Tickets available' : 'Ticket link not added' : escape(read('url'))}</span>`;
  }
  for (const [id, type] of [['gig-form','gig'], ['gig-edit-form','gig'], ['link-form','link'], ['link-edit-form','link']]) {
    const form = $(id);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'btn ghost-button'; button.textContent = 'Preview card';
    button.addEventListener('click', () => previewCard(form, type)); form.append(button);
    form.addEventListener('input', () => { if (form.querySelector('.workflow-preview')) previewCard(form, type); });
  }
  for (const prefix of ['gig', 'gig-edit']) {
    const form = $(`${prefix}-form`);
    const grid = form.querySelector('.gig-form-grid, .gig-edit-grid');
    const advanced = document.createElement('details'); advanced.className = 'workflow-advanced full-span';
    advanced.innerHTML = '<summary>Advanced: prices, redirects and tracking</summary><div class="workflow-grid"></div>';
    for (const suffix of ['ticket-price', 'door-price', 'ticket-price-includes-fee', 'auto-redirect', 'meta-pixel-id']) {
      const control = $(`${prefix}-${suffix}`); const wrapper = control.closest('.full-span') || control.parentElement;
      advanced.lastElementChild.append(wrapper);
    }
    const save = grid.querySelector('button[type="submit"]');
    grid.insertBefore(advanced, save ? save.closest('.full-span') : null);
    form.querySelectorAll('input:not([type="checkbox"])').forEach(input => {
      if (input.labels.length) return;
      const label = document.createElement('label'); label.htmlFor = input.id; label.textContent = (input.placeholder || input.getAttribute('aria-label') || '').replace(/^Edit /, ''); input.before(label);
    });
  }
  ['gig-edit-dialog', 'link-edit-dialog'].forEach(id => $(id).addEventListener('cancel', event => { if (!allowClose(id.replace('-dialog', '-form'))) event.preventDefault(); }));

  async function loadOverview() {
    if (overviewLoading) return;
    overviewLoading = true;
    $('overview-status').textContent = 'Loading overview…';
    const since = new Date(Date.now() - 7 * 86400000);
    const results = await Promise.allSettled([
      getDocs(collection(db, 'gigs')),
      getDocs(collection(db, 'mailing-list-signups')),
      getDocs(query(collection(db, 'site-actions'), where('timestamp', '>=', since))),
      callAdminEmailFunction('listInboxMessages', { limit: 25, folder: 'inbox', search: '' })
    ]);
    if (!state.authUser) { overviewLoading = false; return; }
    const rows = i => results[i].status === 'fulfilled' ? results[i].value.docs.map(d => ({ ...d.data(), id: d.id })) : null;
    const gigs = rows(0); const signups = rows(1); const logs = rows(2);
    const today = new Date(); today.setHours(0,0,0,0);
    const upcoming = gigs?.filter(g => g.id !== 'public-index' && String(g.hideFromLinks).toLowerCase() !== 'true' && new Date(`${g.date}T00:00:00`) >= today).sort((a,b) => a.date.localeCompare(b.date));
    const recent = signups?.filter(s => new Date(s.createdAt?.toDate ? s.createdAt.toDate() : s.createdAt) >= since).length;
    const messages = results[3].status === 'fulfilled' ? (results[3].value.messages || []).map(normalizeEmailMessage) : null;
    const clicks = logs?.filter(l => (l.action === 'click' && (/ticket/i.test(l.label || '') || /ticket/i.test(l.section || ''))) || (l.action === 'ticket_redirect_continue' && l.actionSubtype !== 'auto')).length;
    const card = (label, value, note) => `<article class="manager-card"><p class="eyebrow">${escape(label)}</p><h3>${escape(value)}</h3><p>${escape(note)}</p></article>`;
    $('overview-cards').innerHTML = [
      card('Next public show', gigs ? upcoming[0]?.event || 'No upcoming shows' : 'Unavailable', upcoming?.[0] ? `${upcoming[0].date} · ${[upcoming[0].venue,upcoming[0].city].filter(Boolean).join(', ')}` : 'Manage dates in Gigs'),
      card('New signups · 7 days', recent ?? 'Unavailable', signups ? `${signups.filter(s => !s.unsubscribed).length} active contacts in total` : 'Could not load mailing list'),
      card('Ticket clicks · 7 days', clicks ?? 'Unavailable', 'Tracked ticket-labelled clicks; not ticket sales'),
      card('Unread email', messages ? messages.filter(m => m.unread).length : 'Unavailable', 'Among the latest 25 inbox messages')
    ].join('');
    $('overview-status').textContent = results.some(r => r.status === 'rejected') ? 'Some sections could not load. Refresh to try again.' : `Updated ${new Date().toLocaleTimeString()}`;
    overviewLoading = false;
    if (state.activePage === "overview") api.updateHeroMeta(new Date().toLocaleString());
  }

  async function loadHomepage() {
    if (homeBusy || dirty.has('homepage-form')) return;
    homeBusy = true; homeLoaded = false; $('publish-homepage').disabled = true;
    $('homepage-status').textContent = 'Loading homepage content…';
    try {
      const snapshot = await getDoc(doc(db, 'site-content', 'homepage'));
      const values = { ...homeDefaults, ...(snapshot.exists() ? snapshot.data() : {}) };
      Object.keys(fields).forEach(key => { const input = $('homepage-form').elements[key]; input.value = values[key]; input.defaultValue = values[key]; });
      homeLoaded = true;
      $('homepage-status').textContent = snapshot.exists() ? 'Published content loaded.' : 'Current built-in content loaded. Your first publish will enable managed content.';
    } catch { $('homepage-status').textContent = 'Could not load content. Check your connection and that the updated access rules are deployed, then refresh.'; }
    finally { homeBusy = false; $('publish-homepage').disabled = !homeLoaded; if (state.activePage === 'homepage') api.updateHeroMeta(homeLoaded ? new Date().toLocaleString() : 'Unavailable'); }
  }
  function homeValues() { return validateHomeContent(Object.fromEntries(Object.keys(fields).map(key => [key, $('homepage-form').elements[key].value]))); }
  $('preview-homepage').addEventListener('click', () => {
    try {
      const d = homeValues(); const preview = $('homepage-preview'); preview.hidden = false;
      preview.innerHTML = `<p>Preview · not published</p><div class="workflow-grid"><article><img class="workflow-art" src="${escape(d.releaseArtwork)}" alt="Release artwork"><h3>${escape(d.releaseTitle)}</h3><p>${escape(d.releaseDescription)}</p><p>First listen? Try ${escape(d.firstTrack)}.</p><p>${['spotify','bandcamp','youtube'].map(key => `<a href="${escape(d[key])}" target="_blank" rel="noopener">${key} ↗</a>`).join(' · ')}</p></article><article><img class="workflow-art" src="${escape(d.merchImage)}" alt="Merch image"><h3>${escape(d.merchTitle)}</h3><p>${escape(d.merchPrice)} · ${escape(d.merchAvailability)}</p><a href="${escape(d.merchUrl)}" target="_blank" rel="noopener">Shop ↗</a></article></div>`;
    } catch(error) { $('homepage-status').textContent = error.message; }
  });
  $('homepage-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!homeLoaded || homeBusy) return;
    try {
      const values = homeValues(); homeBusy = true; $('publish-homepage').disabled = true;
      $('homepage-status').textContent = 'Publishing…';
      await setDoc(doc(db, 'site-content', 'homepage'), { ...values, updatedAt: new Date() });
      Object.keys(fields).forEach(key => $('homepage-form').elements[key].defaultValue = values[key]);
      markSaved('homepage-form'); $('homepage-status').textContent = 'Published. The homepage will use these changes on its next visit.';
    } catch(error) { $('homepage-status').textContent = `Not published. ${error.message || 'Please try again.'}`; }
    finally { homeBusy = false; $('publish-homepage').disabled = !homeLoaded; }
  });

  function decorateGig(gig, item, actions) {
    const today = new Date(); today.setHours(0,0,0,0);
    const future = new Date(`${gig.date}T00:00:00`) >= today;
    const publicShow = future && !gig.hideFromLinks;
    const next = state.gigs.filter(g => !g.hideFromLinks && new Date(`${g.date}T00:00:00`) >= today).sort((a,b) => a.date.localeCompare(b.date))[0];
    const visibility = document.createElement('p'); visibility.className = 'workflow-visibility';
    visibility.textContent = `Homepage: ${publicShow && gig.id === next?.id ? 'next show' : 'not featured'} · Tickets: ${publicShow ? 'visible' : 'hidden'} · Links: ${publicShow && gig.ticketUrl && canBuyTickets(gig) ? 'visible' : 'hidden'} · EPK: ${gig.hideFromEpk ? 'hidden' : 'visible'}`;
    item.append(visibility);
    if (gigDetailLabel(gig)) { const detail = document.createElement('p'); detail.textContent = gigDetailLabel(gig); item.append(detail); }
    const duplicate = document.createElement('button'); duplicate.type = 'button'; duplicate.className = 'btn ghost-button'; duplicate.textContent = 'Duplicate';
    duplicate.addEventListener('click', () => {
      if (!allowClose('gig-form')) return;
      $('gig-form').reset();
      for (const key of ['event','venue','city','imageUrl']) { const id = key === 'imageUrl' ? 'image-url' : key; $(`gig-${id}`).value = gig[key] || ''; }
      dirty.add('gig-form'); api.openGigSettingsPanel(); $('gig-date').focus();
      $('gig-status').textContent = 'Copied event and venue. Choose a new date and ticket link, then save.';
    }); actions.append(duplicate);
  }

  const newsletterPanel = document.createElement('div'); newsletterPanel.className = 'mailing-selection-bar';
  newsletterPanel.innerHTML = '<div class="workflow-actions"><button type="button" id="newsletter-select-all" aria-label="Select visible subscribers" class="btn ghost-button">Select visible</button><button type="button" id="newsletter-clear" class="btn ghost-button">Clear</button><button type="button" id="newsletter-compose" class="btn btn-accent">Write to selected</button><span id="newsletter-selection-count" role="status"></span></div><p id="newsletter-status" role="status"></p>';
  $('email-address-book').querySelector('.mailing-contacts-layout').before(newsletterPanel);
  const selected = new Set();
  function renderRecipients() {
    const activeIds = new Set(state.mailingListSignups.filter(s => !s.unsubscribed).map(s => s.id));
    [...selected].forEach(id => { if (!activeIds.has(id)) selected.delete(id); });
    $('newsletter-selection-count').textContent = `${selected.size} selected`;
    $('newsletter-compose').disabled = !selected.size;
    $('newsletter-clear').disabled = !selected.size;
  }
  function recipientCheckbox(signup) {
    const check = document.createElement('input'); check.type = 'checkbox'; check.className = 'mailing-recipient-check';
    check.setAttribute('aria-label', `Select ${signup.email}`); check.disabled = Boolean(signup.unsubscribed); check.checked = selected.has(signup.id);
    check.addEventListener('change', () => { check.checked ? selected.add(signup.id) : selected.delete(signup.id); renderRecipients(); });
    return check;
  }
  async function unsubscribeContact(signup, button) {
    if (signup.unsubscribed || !confirm(`Unsubscribe ${signup.email} from newsletters?`)) return;
    button.disabled = true;
    try {
      await updateDoc(doc(db,'mailing-list-signups',signup.id),{unsubscribed:true,unsubscribedAt:new Date()});
      signup.unsubscribed = true; selected.delete(signup.id); api.renderMailingListSignups();
      $('newsletter-status').textContent = 'Contact unsubscribed and excluded from newsletters.';
    } catch { button.disabled = false; $('newsletter-status').textContent = 'Could not update contact. Please try again.'; }
  }
  $('newsletter-select-all').addEventListener('click', () => { api.getVisibleMailingContacts().filter(s => !s.unsubscribed).forEach(s => selected.add(s.id)); api.renderMailingListSignups(); });
  $('newsletter-clear').addEventListener('click', () => { selected.clear(); api.renderMailingListSignups(); });
  const selectedRecipients = () => state.mailingListSignups.filter(s => !s.unsubscribed && selected.has(s.id)).map(s => s.email);
  $('newsletter-compose').addEventListener('click', () => {
    const emails = selectedRecipients();
    if (!emails.length) return;
    api.composeNewsletter(emails);
  });
  document.addEventListener('hae-admin-account-changing', () => { selected.clear(); renderRecipients(); });
  const testButton = document.createElement('button'); testButton.type = 'button'; testButton.className = 'btn ghost-button'; testButton.textContent = 'Send test to myself';
  document.querySelector('.email-compose-footer').append(testButton);
  testButton.addEventListener('click', async () => {
    if (state.isSendingEmail || !state.authUser?.email) return;
    if (!$('email-subject').value.trim() || !api.getEmailBodyText().trim()) { api.setEmailComposeStatus('Add a subject and message first.', 'is-error'); return; }
    testButton.disabled = true; state.isSendingEmail = true; api.syncEmailFormState();
    try {
      const attachments = await api.getSelectedEmailAttachments();
      await callAdminEmailFunction('sendAdminEmail', { newsletterPreview:!!state.isNewsletterDraft, to: state.authUser.email, bcc: '', subject: `[Test] ${$('email-subject').value.trim()}`, text: api.getEmailBodyText(), html: api.getEmailBodyHtml(), attachments });
      api.setEmailComposeStatus('Test sent to your signed-in email. Newsletter recipients were not sent this test.', 'is-success');
    } catch { api.setEmailComposeStatus('Could not send test. Your draft is still here.', 'is-error'); }
    finally { testButton.disabled = false; state.isSendingEmail = false; api.syncEmailFormState(); }
  });
  return { selectedRecipients, recipientCheckbox, unsubscribeContact, markSaved, isDirty: id => dirty.has(id), allowClose, decorateGig, renderRecipients, publishStatus, loadPage: page => page === 'overview' ? loadOverview() : loadHomepage() };
}
