import { emailSiteSources, populateEmailTemplate } from './email-site-content.js';
import { homeDefaults } from './home-content.js';
import { emailTemplates, readSavedTemplates } from './newsletter-templates.js';
import { normalizeGigDetails, gigStatuses, campaignTrackingUrl, summarizeTraffic } from './gig-tools.js';

const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function button(text, fn) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ghost-button'; b.textContent = text; b.addEventListener('click', fn); return b; }
function panel(parent, title, description) {
  const section = document.createElement('section'); section.className = 'manager-card tool-panel';
  section.innerHTML = `<h3>${escape(title)}</h3><p>${escape(description)}</p>`; $(parent).append(section); return section;
}

export function mountGigTools() {
  ['gig', 'gig-edit'].forEach(prefix => {
    const form = $(`${prefix}-form`);
    const fields = document.createElement('div'); fields.className = 'workflow-grid tool-gig-fields';
    fields.innerHTML = `<label>Show status<select id="${prefix}-status-value" class="form-control">${Object.entries(gigStatuses).map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}</select></label><label>Doors time<input id="${prefix}-doors-time" class="form-control" type="time"></label><label>Age restrictions<input id="${prefix}-age-restriction" class="form-control" maxlength="100" placeholder="e.g. 14+ · under 16s with an adult"></label>`;
    form.prepend(fields);
    const input = $(`${prefix}-meta-pixel-id`);
    if (input) { const help = document.createElement('p'); help.className = 'helper-copy'; help.textContent = 'This Meta Pixel receives GigTicketClick when someone clicks this show’s ticket button on the main tickets page or show page. Ticket clicks are not purchases.'; input.parentElement.append(help); }
  });
}
export function readGigTools(prefix) {
  return normalizeGigDetails({status: $(`${prefix}-status-value`).value, doorsTime: $(`${prefix}-doors-time`).value, ageRestriction: $(`${prefix}-age-restriction`).value});
}
export function fillGigTools(prefix, gig) {
  const d = normalizeGigDetails(gig);
  $(`${prefix}-status-value`).value = d.status; $(`${prefix}-doors-time`).value = d.doorsTime; $(`${prefix}-age-restriction`).value = d.ageRestriction;
}

export function setupAdminTools(api) {
  const { state, db, doc, getDoc, getDocs, collection, query, where, orderBy, limit, callAdminEmailFunction: call } = api;

  // Duplicating changes only the editor until the user saves the new campaign.
  const campaignTools = panel('campaigns-page', 'Campaign shortcuts', 'Open a campaign to duplicate it or create a link for each place you share it.');
  const campaignResult = document.createElement('div'); campaignResult.setAttribute('role', 'status');
  campaignTools.append(button('Duplicate current campaign', () => {
    if (state.isSavingCampaign || state.isLoadingCampaign || state.isDeletingCampaign) return;
    if (!$('campaign-title').value.trim()) { campaignResult.textContent = 'Open a campaign first.'; return; }
    const base = $('campaign-slug').value.replace(/-copy(?:-\d+)?$/, '') || 'campaign';
    let slug = `${base}-copy`, n = 2;
    while (state.campaigns.some(c => c.slug === slug || c.id === slug)) slug = `${base}-copy-${n++}`;
    state.activeCampaignId = ''; state.campaign = null;
    $('campaign-slug').value = slug; $('campaign-title').value += ' (copy)'; $('campaign-live').checked = false;
    api.openCampaignSettingsPanel();
    $('campaign-form').dispatchEvent(new Event('input', { bubbles: true }));
    campaignResult.textContent = 'Copy ready as a draft. Edit its details and save to create it.';
  }), button('Generate sharing links', () => {
    const slug = $('campaign-slug').value.trim();
    const saved = state.campaigns.find(c => c.slug === slug);
    if (!saved?.live) { campaignResult.textContent = 'Save and publish this campaign before sharing its links.'; return; }
    campaignResult.replaceChildren();
    for (const source of ['instagram', 'facebook', 'poster']) {
      const url = campaignTrackingUrl(new URL('/smartlink.html', api.publicOrigin).href, slug, source);
      const label = document.createElement('label'); label.textContent = source === 'poster' ? 'Posters / QR code destination' : source;
      const input = document.createElement('input'); input.className = 'form-control'; input.readOnly = true; input.value = url;
      label.append(input, button('Copy link', async () => { try { await navigator.clipboard.writeText(url); input.select(); } catch { input.focus(); input.select(); } }));
      campaignResult.append(label);
    }
  }), campaignResult);

  const comparison = panel('analytics-page', 'This week compared with last week', 'Rolling seven-day totals. Sources show recorded ticket clicks and new signups, not confirmed ticket sales.');
  const comparisonResult = document.createElement('div'); comparisonResult.setAttribute('role', 'status');
  comparison.append(button('Load comparison', async event => {
    event.currentTarget.disabled = true; comparisonResult.textContent = 'Loading…';
    try {
      const traffic = await call('getAdminTrafficComparison', {});
      const result = summarizeTraffic(traffic.events, traffic.signups, traffic.now);
      comparisonResult.innerHTML = `<div class="workflow-grid">${['clicks','signups'].map(key => {
        const [current, previous] = result[key]; const change = previous ? `${Math.round((current-previous)/previous*100)}%` : current ? 'New activity' : 'No change';
        return `<div><h4>${key === 'clicks' ? 'Ticket clicks' : 'New signups'}</h4><strong>${current}</strong><p>Previous week: ${previous} · ${change}</p></div>`;
      }).join('')}</div><div class="tool-table-wrap"><table><thead><tr><th>Source · this week</th><th>Ticket clicks</th><th>Signups</th></tr></thead><tbody>${Object.entries(result.sources).sort((a,b) => b[1].clicks+b[1].signups-a[1].clicks-a[1].signups).map(([source,d]) => `<tr><td>${escape(source)}</td><td>${d.clicks}</td><td>${d.signups}</td></tr>`).join('') || '<tr><td colspan="3">No recorded activity in the last seven days.</td></tr>'}</tbody></table></div>`;
    } catch { comparisonResult.textContent = 'Could not load the comparison. Try again once your connection is restored.'; }
    finally { event.target.disabled = false; }
  }), comparisonResult);

  setupDrafts(api);
  setupMedia(api);
  for (const [page, path] of [['gigs', 'gigs'], ['links', 'links'], ['homepage', 'site-content']]) {
    const history = panel(`${page}-page`, 'Content history', 'Review a previous version before restoring it. New saves are recorded once history is enabled on the server.');
    const result = document.createElement('div'); result.setAttribute('role', 'status');
    history.append(button('Load recent versions', async event => {
      event.currentTarget.disabled = true; result.textContent = 'Loading versions…';
      try {
        const response = await call('listContentHistory', { collection: path });
        result.replaceChildren();
        for (const version of response.versions) {
          const row = document.createElement('div'); row.className = 'tool-history-row';
          const label = document.createElement('span'); label.textContent = `${version.title} · ${new Date(version.savedAt).toLocaleString()} · ${version.stage}`;
          row.append(label, button('Review version', async e => {
            e.currentTarget.disabled = true;
            try {
              const preview = await call('restoreContentVersion', { versionId: version.id, preview: true });
              const existing = result.querySelector('.tool-history-preview'); existing?.remove();
              const view = document.createElement('div'); view.className = 'tool-history-preview';
              const details = document.createElement('dl'); details.className = 'tool-version-details';
              const labels = {event:'Show name',date:'Show date',ticketUrl:'Ticket link',imageUrl:'Artwork',metaPixelId:'Meta Pixel ID',doorsTime:'Doors time',ageRestriction:'Age restrictions',hideFromEpk:'Hide from press kit',hideFromLinks:'Hide from public listings',autoRedirect:'Automatically open ticket seller',ticketPriceIncludesFee:'Booking fee included',sortOrder:'Display order'};
              for (const [key, value] of Object.entries(preview.content)) {
                if (['id','updatedAt','createdAt','hidden'].includes(key) || (value && typeof value === 'object')) continue;
                const term = document.createElement('dt'); term.textContent = labels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
                const definition = document.createElement('dd'); definition.textContent = key === 'status' ? gigStatuses[value] || value : typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value || 'Not set');
                details.append(term, definition);
              }
              const status = document.createElement('p'); status.textContent = 'Restoring publishes this version to the public site.';
              view.append(details, button('Restore this version', async restoreEvent => {
                if (!window.confirm('Publish this previous version? Your current version will remain in history.')) return;
                restoreEvent.currentTarget.disabled = true;
                try {
                  await call('restoreContentVersion', {versionId: version.id, expected: preview.expected});
                  status.textContent = 'Restored and published. Refresh this page to load the restored content into the editor.';
                } catch(error) { status.textContent = error.message || 'Restore failed. Review the version again and retry.'; }
              }), status);
              result.append(view);
            } catch(error) { label.textContent = error.message || 'Could not load this version.'; }
            finally { e.target.disabled = false; }
          })); result.append(row);
        }
        if (!response.versions.length) result.textContent = 'No versions yet. Future saves will appear here.';
      } catch(error) { result.textContent = error.message || 'Could not load history.'; }
      finally { event.target.disabled = false; }
    }), result);
  }
}

function setupDrafts(api) {
  const { state } = api;
  const form = $('email-compose-form');
  const controls = document.createElement('div'); controls.className = 'tool-email-controls';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const template = document.createElement('select'); template.className = 'form-control'; template.setAttribute('aria-label', 'Email template');
  const templateKey = () => state.authUser?.uid ? `hae-email-templates-v1:${state.authUser.uid}` : '';
  const savedTemplates = () => templateKey() ? readSavedTemplates(localStorage, templateKey()) : [];
  const allTemplates = () => [...emailTemplates, ...savedTemplates()];
  function refreshTemplates() {
    template.replaceChildren(new Option('Choose a template', ''));
    for (const entry of allTemplates()) template.add(new Option(entry.name, entry.id));
  }
  refreshTemplates();
  template.addEventListener('focus', refreshTemplates);
  let timer, changed = false;
  const key = () => state.authUser?.uid ? `hae-email-draft-v1:${state.authUser.uid}` : '';
  const capture = () => ({to:$('email-to').value, bcc:$('email-bcc').value, subject:$('email-subject').value, body:$('email-body').innerText,
    html:$('email-body').innerHTML, newsletter:!!state.isNewsletterDraft, replyToMessageId:state.activeEmailMessage?.id || '', attachments:Array.from($('email-attachments').files || []).map(f => f.name), savedAt:Date.now()});
  const save = () => {
    clearTimeout(timer); if (!changed || !key()) return;
    try { localStorage.setItem(key(), JSON.stringify(capture())); changed = false; status.textContent = 'Draft saved on this device. Reattach files after restoring.'; }
    catch { status.textContent = 'Draft could not be saved on this device. Keep this window open or copy your message.'; }
  };
  form.addEventListener('input', () => { changed = true; clearTimeout(timer); timer = setTimeout(save, 500); });
  form.addEventListener('change', () => { changed = true; save(); });
  $('email-compose-close').addEventListener('click', save);
  window.addEventListener('pagehide', save);
  window.addEventListener('beforeunload', save);
  const applyText = (subject, body) => { $('email-subject').value = subject; $('email-body').replaceChildren(plainDraftHtml(body)); changed = true; save(); };
  function useTemplate(entry, newsletter = false) {
    if (!entry || state.isSendingEmail) return;
    if (($('email-subject').value || $('email-body').innerText.trim()) && !confirm('Replace the subject and message with this template?')) { template.value = ''; return; }
    if (newsletter) {
      const selected = api.getNewsletterRecipients?.() || [];
      const emails = selected.length ? selected : state.mailingListSignups.filter(s => !s.unsubscribed).map(s => s.email);
      if (!emails.length) { libraryStatus.textContent = 'Add subscribers before starting a newsletter. Templates are also available in the email composer.'; return; }
      api.composeNewsletter(emails);
    }
    applyText(entry.subject, entry.body); template.value = '';
    status.textContent = 'Template added. Replace the bracketed details before sending.';
    templateHint.hidden = false;
    $('email-subject').dispatchEvent(new Event('input', {bubbles:true}));
  }
  template.addEventListener('change', () => useTemplate(allTemplates().find(entry => entry.id === template.value)));
  const library = document.createElement('details'); library.className = 'mailing-template-library';
  const libraryHeading = document.createElement('summary'); libraryHeading.textContent = 'Start from an email template';
  const libraryGrid = document.createElement('div'); libraryGrid.className = 'mailing-template-grid';
  const libraryStatus = document.createElement('p'); libraryStatus.setAttribute('role', 'status');
  function renderLibrary() {
    libraryGrid.replaceChildren();
    for (const entry of allTemplates().filter(t => t.id !== 'booking')) {
      const card = button('', () => useTemplate(entry, true)); card.className = 'mailing-template-card';
      const title = document.createElement('strong'); title.textContent = entry.name;
      const caption = document.createElement('span'); caption.textContent = entry.description || 'Your saved text template';
      card.append(title, caption); libraryGrid.append(card);
    }
  }
  library.append(libraryHeading, libraryGrid, libraryStatus);
  $('email-address-book').querySelector('.mailing-search-bar').before(library);
  library.addEventListener('toggle', () => { if (library.open) { renderLibrary(); libraryStatus.textContent = 'Uses your selected subscribers, or all subscribers if none are selected. You can review the draft before sending.'; } });
  const templateHint = document.createElement('p'); templateHint.className = 'email-template-hint'; templateHint.textContent = 'Replace the bracketed details in this template before sending.'; templateHint.hidden = true;
  const templateOptions = document.createElement('details'); templateOptions.className = 'email-template-options';
  const templateSummary = document.createElement('summary'); templateSummary.textContent = 'Save your own template';
  const templateName = document.createElement('input'); templateName.className = 'form-control'; templateName.placeholder = 'Template name'; templateName.maxLength = 80; templateName.setAttribute('aria-label', 'Template name');
  const templateNote = document.createElement('p'); templateNote.textContent = 'Saves the subject and message as reusable text on this device. Recipients and attachments are not included.';
  const saveTemplate = button('Save text as template', () => {
    if (!templateKey()) { status.textContent = 'Sign in to save a template.'; return; }
    const name = templateName.value.trim(), subject = $('email-subject').value.trim(), body = $('email-body').innerText.trim();
    if (!name || !subject || !body) { status.textContent = 'Add a template name, subject and message first.'; return; }
    const saved = savedTemplates(); const existing = saved.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (existing && !confirm(`Replace the saved template "${name}"?`)) return;
    if (!existing && saved.length >= 30) { status.textContent = 'You have 30 saved templates. Remove one before adding another.'; return; }
    const entry = {id:existing?.id || `custom-${crypto.randomUUID()}`, name, subject, body};
    try { localStorage.setItem(templateKey(), JSON.stringify([...saved.filter(t => t.id !== entry.id), entry])); refreshTemplates(); renderLibrary(); status.textContent = 'Template saved on this device.'; templateName.value = ''; templateOptions.open = false; }
    catch { status.textContent = 'Could not save the template on this device.'; }
  });
  const deleteTemplate = document.createElement('select'); deleteTemplate.className = 'form-control'; deleteTemplate.setAttribute('aria-label', 'Saved template to remove');
  templateOptions.addEventListener('toggle', () => { if (!templateOptions.open) return; deleteTemplate.replaceChildren(new Option('Choose a saved template to remove', '')); savedTemplates().forEach(t => deleteTemplate.add(new Option(t.name,t.id))); });
  const removeTemplate = button('Remove saved template', () => {
    const entry = savedTemplates().find(t => t.id === deleteTemplate.value);
    if (!entry || !confirm(`Remove the saved template "${entry.name}"?`)) return;
    try { localStorage.setItem(templateKey(), JSON.stringify(savedTemplates().filter(t => t.id !== entry.id))); refreshTemplates(); renderLibrary(); deleteTemplate.querySelector(`option[value="${CSS.escape(entry.id)}"]`)?.remove(); status.textContent = 'Saved template removed.'; }
    catch { status.textContent = 'Could not remove the template.'; }
  });
  templateOptions.append(templateSummary, templateNote, templateName, saveTemplate, deleteTemplate, removeTemplate);
  controls.append(template, button('Save draft', () => { changed = true; save(); }), button('Restore saved draft', () => {
    try {
      const draft = JSON.parse(localStorage.getItem(key()) || 'null');
      if (!draft) { status.textContent = 'No saved draft for this account on this device.'; return; }
      if (($('email-subject').value || $('email-body').innerText.trim()) && !confirm('Replace this message with the saved draft?')) return;
      $('email-to').value = draft.to || ''; $('email-bcc').value = draft.bcc || ''; $('email-bcc-row').hidden = !draft.bcc;
      state.isNewsletterDraft = !!draft.newsletter;
      state.activeEmailMessage = draft.replyToMessageId ? { id: draft.replyToMessageId } : null;
      $('email-attachments').value = ''; api.renderComposeAttachments();
      $('email-subject').value = draft.subject || '';
      $('email-body').replaceChildren(safeDraftHtml(draft.html || '', draft.body || ''));
      changed = false; clearTimeout(timer);
      status.textContent = `Draft restored from ${new Date(draft.savedAt).toLocaleString()}.${draft.attachments?.length ? ' Reattach: ' + draft.attachments.join(', ') : ''}`;
    } catch { status.textContent = 'Could not read this saved draft.'; }
  }), button('Discard saved draft', () => {
    if (!confirm('Delete the saved draft from this device? The open message will stay in the editor.')) return;
    try { clearTimeout(timer); changed = false; localStorage.removeItem(key()); status.textContent = 'Saved draft deleted.'; } catch { status.textContent = 'Could not delete the saved draft.'; }
  }), status);
  const draftOptions = document.createElement('details'); draftOptions.className = 'email-draft-options';
  const summary = document.createElement('summary'); summary.textContent = 'Draft options';
  const actions = document.createElement('div');
  controls.querySelectorAll('button').forEach(b => actions.append(b));
  draftOptions.append(summary, actions); controls.insertBefore(draftOptions, status);
  actions.addEventListener('click', event => { if (event.target.closest('button')) draftOptions.open = false; });
  document.addEventListener('click', event => { if (!draftOptions.contains(event.target)) draftOptions.open = false; });
  $('email-compose-close').addEventListener('click', () => { draftOptions.open = false; });
  controls.addEventListener('keydown', event => { if (event.key === 'Escape' && draftOptions.open) { draftOptions.open = false; summary.focus(); event.stopPropagation(); } });
  const siteOptions = document.createElement('details'); siteOptions.className = 'email-template-options';
  const siteSummary = document.createElement('summary'); siteSummary.textContent = 'Fill from the website';
  const sourceSelect = document.createElement('select'); sourceSelect.className = 'form-control'; sourceSelect.setAttribute('aria-label','Saved website content');
  sourceSelect.add(new Option('Load your saved site content first', ''));
  const sourcePreview = document.createElement('p'); sourcePreview.className = 'email-site-preview';
  const sourceStatus = document.createElement('p'); sourceStatus.setAttribute('role','status');
  let sources = [], loadingSources = false;
  const loadSources = button('Load / refresh site content', async () => {
    if (loadingSources) return;
    const sourceUser = state.authUser?.uid;
    if (!sourceUser) {sourceStatus.textContent='Sign in to load saved site content.';return;}
    loadingSources = true; loadSources.disabled = true;
    sourceStatus.textContent = 'Loading saved shows, links and releases...';
    const results = await Promise.allSettled([
      api.getDocs(api.collection(api.db,'gigs')), api.getDocs(api.collection(api.db,'links')),
      api.getDocs(api.collection(api.db,'campaigns')), api.getDoc(api.doc(api.db,'site-content','homepage'))
    ]);
    if (sourceUser !== state.authUser?.uid) {loadingSources=false;loadSources.disabled=false;return;}
    const docs = index => results[index].status === 'fulfilled' ? results[index].value.docs.map(d=>({...d.data(),id:d.id})) : [];
    const home = results[3].status === 'fulfilled' ? {...homeDefaults,...(results[3].value.exists() ? results[3].value.data() : {})} : {};
    sources = emailSiteSources({gigs:docs(0),links:docs(1),campaigns:docs(2),homepage:home});
    sourceSelect.replaceChildren(new Option('Choose a show, release, link or product', ''));
    sources.forEach(source=>sourceSelect.add(new Option(source.label, source.id)));
    sourcePreview.textContent = '';
    sourceStatus.textContent = results.some(r=>r.status==='rejected') ? 'Some content could not load. Available items are shown; refresh to try again.' : `${sources.length} saved items available. Choose one to preview its details.`;
    loadingSources = false; loadSources.disabled = false;
  });
  sourceSelect.addEventListener('change',()=>{sourcePreview.textContent=sources.find(source=>source.id===sourceSelect.value)?.details || '';});
  const fillTemplate = button('Fill matching placeholders',()=>{
    if (state.isSendingEmail) return;
    const source = sources.find(source=>source.id===sourceSelect.value);
    if (!source) {sourceStatus.textContent='Choose a saved item first.'; return;}
    const result = populateEmailTemplate($('email-subject').value,$('email-body').innerText,source);
    if (!result.count) {sourceStatus.textContent='No matching placeholders. Apply a template first, or insert the details below.';return;}
    if (!confirm('Fill matching placeholders using this item? The message will be saved as plain text.')) return;
    applyText(result.subject,result.body); $('email-subject').dispatchEvent(new Event('input',{bubbles:true}));
    sourceStatus.textContent=`Filled ${result.count} placeholders. Review any remaining bracketed details before sending.`;
  });
  const insertDetails = button('Insert details at end',()=>{
    if (state.isSendingEmail) return;
    const source = sources.find(source=>source.id===sourceSelect.value);
    if (!source) {sourceStatus.textContent='Choose a saved item first.';return;}
    $('email-body').append(plainDraftHtml(source.details)); $('email-body').dispatchEvent(new Event('input',{bubbles:true}));
    sourceStatus.textContent='Details added at the end of your message.';
  });
  siteOptions.append(siteSummary,loadSources,sourceSelect,sourcePreview,fillTemplate,insertDetails,sourceStatus);
  document.addEventListener('hae-admin-account-changing',()=>{sources=[];sourceSelect.replaceChildren(new Option('Load your saved site content first',''));sourcePreview.textContent='';sourceStatus.textContent='';siteOptions.open=false;});
  controls.append(templateHint, siteOptions, templateOptions);
  form.prepend(controls);
  document.addEventListener('hae-email-sent', () => { templateHint.hidden = true; clearTimeout(timer); changed = false; try { localStorage.removeItem(key()); status.textContent = 'Sent. Saved draft cleared.'; } catch { status.textContent = 'Sent. Remove the saved draft manually before restoring another message.'; } });
  document.addEventListener('hae-admin-account-changing', () => {
    save(); clearTimeout(timer); changed = false;
    $('email-to').value = ''; $('email-bcc').value = ''; $('email-bcc-row').hidden = true;
    $('email-subject').value = ''; $('email-body').replaceChildren(); $('email-attachments').value = '';
    state.isNewsletterDraft = false; state.activeEmailMessage = null;
    $('email-compose-overlay').hidden = true; document.body.classList.remove('email-compose-open');
    api.renderComposeAttachments(); status.textContent = ''; templateName.value = ''; templateHint.hidden = true; templateOptions.open = false; library.open = false; libraryGrid.replaceChildren(); libraryStatus.textContent = ''; template.replaceChildren(new Option('Choose a template', ''));
  });
}

function plainDraftHtml(text) {
  const fragment = document.createDocumentFragment();
  for (const paragraph of text.split('\n\n')) {
    const p = document.createElement('p');
    paragraph.split('\n').forEach((line, index) => { if (index) p.append(document.createElement('br')); p.append(document.createTextNode(line)); });
    fragment.append(p);
  }
  return fragment;
}
function safeDraftHtml(html, fallback) {
  const fragment = document.createDocumentFragment();
  if (!html) return plainDraftHtml(fallback);
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const allowed = new Set(['P','DIV','BR','B','STRONG','I','EM','U','S','UL','OL','LI','BLOCKQUOTE','A','SPAN']);
  function copy(node, parent) {
    if (node.nodeType === Node.TEXT_NODE) { parent.append(document.createTextNode(node.textContent)); return; }
    if (node.nodeType !== Node.ELEMENT_NODE || ['SCRIPT','STYLE','IFRAME','OBJECT','IMG'].includes(node.tagName)) return;
    const target = allowed.has(node.tagName) ? document.createElement(node.tagName.toLowerCase()) : document.createDocumentFragment();
    if (node.tagName === 'A') { try { const url = new URL(node.getAttribute('href')); if (['https:','http:','mailto:'].includes(url.protocol)) target.setAttribute('href', url.href); } catch { /* Ignore invalid links. */ } }
    node.childNodes.forEach(child => copy(child, target)); parent.append(target);
  }
  parsed.body.childNodes.forEach(node => copy(node, fragment)); return fragment;
}

async function resizeArtwork(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) throw new Error('Choose a JPEG, PNG or WebP image under 20 MB.');
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    let blob;
    for (const quality of [.84, .7, .55, .4]) {
      blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
      if (blob && blob.size <= 900000) break;
    }
    if (!blob || blob.size > 900000) throw new Error('This image is too detailed. Choose a smaller image.');
    const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(blob); });
    return { data, type:blob.type, width:canvas.width, height:canvas.height, name:file.name };
  } finally { image.close(); }
}
function setupMedia(api) {
  const section = panel('settings-page', 'Media library', 'Upload artwork once, then reuse it for gigs, campaigns and the homepage. Images are resized to a maximum of 1600 pixels.');
  const file = document.createElement('input'); file.type = 'file'; file.accept = 'image/jpeg,image/png,image/webp'; file.setAttribute('aria-label', 'Upload artwork');
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const library = document.createElement('div'); library.className = 'tool-media-grid';
  let media = [];
  function render() {
    library.replaceChildren();
    for (const item of media) {
      const card = document.createElement('article');
      const img = document.createElement('img'); img.src = item.url; img.alt = item.name; img.loading = 'lazy';
      const name = document.createElement('p'); name.textContent = item.name;
      card.append(img, name, button('Copy image URL', async () => {
        try { await navigator.clipboard.writeText(item.url); status.textContent = 'Image URL copied.'; }
        catch { const input = document.createElement('input'); input.value = item.url; input.readOnly = true; card.append(input); input.select(); }
      })); library.append(card);
    }
    if (!media.length) library.textContent = 'No uploaded artwork yet.';
  }
  async function load() {
    status.textContent = 'Loading artwork…';
    const snapshot = await api.getDocs(api.query(api.collection(api.db, 'admin-media'), api.orderBy('createdAt', 'desc'), api.limit(100)));
    media = snapshot.docs.map(d => d.data()); render(); status.textContent = 'Showing the latest 100 uploads.';
  }
  const reload = button('Load library', async () => { try { await load(); } catch { status.textContent = 'Could not load the library. Check your connection and deployed access rules.'; } });
  file.addEventListener('change', async () => {
    if (!file.files[0]) return; file.disabled = true; status.textContent = 'Preparing and uploading artwork…';
    try { const payload = await resizeArtwork(file.files[0]); const item = await api.callAdminEmailFunction('uploadAdminArtwork', payload); media.unshift(item); render(); status.textContent = 'Artwork uploaded. Use “Choose artwork” beside an image field to select it.'; file.value = ''; }
    catch(error) { status.textContent = error.message || 'Upload failed. Try again.'; }
    finally { file.disabled = false; }
  });
  section.append(file, reload, status, library);
  const dialog = document.createElement('dialog'); dialog.className = 'tool-media-picker';
  document.body.append(dialog);
  for (const field of document.querySelectorAll('#gig-image-url, #gig-edit-image-url, #campaign-artwork-url, #homepage-form [name="releaseArtwork"], #homepage-form [name="merchImage"]')) {
    field.insertAdjacentElement('afterend', button('Choose artwork', async () => {
      dialog.replaceChildren(button('Close artwork picker', () => dialog.close()));
      const content = document.createElement('div'); content.className = 'tool-media-grid'; content.textContent = 'Loading artwork…'; dialog.append(content); dialog.showModal();
      try {
        await load(); content.replaceChildren();
        for (const item of media) {
          const choose = button(item.name, () => { field.value = item.url; field.dispatchEvent(new Event('input', {bubbles:true})); dialog.close(); });
          const img = document.createElement('img'); img.src = item.url; img.alt = ''; choose.prepend(img); content.append(choose);
        }
        if (!media.length) content.textContent = 'Upload your first image in Settings → Media library.';
      } catch { content.textContent = 'Could not load artwork. Try again.'; }
    }));
  }
}
