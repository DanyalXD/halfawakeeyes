const descriptions = {
  overview:'Your shows, audience and latest activity at a glance.',
  analytics:'See how people find your music and interact with the site.',
  gigs:'Manage show details, ticket links and public listings.',
  links:'Keep your social links and featured destinations up to date.',
  email:'Bookings, conversations and announcements in one place.',
  campaigns:'Create release pages and follow the results of each campaign.',
  homepage:'Choose what fans see when they arrive on your website.',
  settings:'Manage notifications and the artwork you use across the site.'
};
export function setAdminPagePresentation(page) {
  if (document.body.dataset.adminPage !== page) window.scrollTo(0, 0);
  document.body.dataset.adminPage = page;
  const description = document.getElementById('admin-page-description');
  if (description) description.textContent = descriptions[page] || '';
}
export function setupAdminLayout() {
  const topbar = document.querySelector('.dashboard-topbar-copy');
  const intro = document.createElement('p'); intro.id = 'admin-page-description'; topbar.append(intro);
  const cache = document.getElementById('cache-status');
  document.querySelector('.admin-account-menu').append(cache);
  document.getElementById('overview-cards').after(document.getElementById('overview-status'));

  for (const page of ['gigs','links','campaigns']) {
    const panel = document.querySelector(`#${page}-page > .manager-panel`);
    if (panel) {
      panel.classList.add('admin-split-workspace');
      panel.children[0]?.classList.add('admin-editor-panel');
      panel.children[1]?.classList.add('admin-results-panel');
    }
  }
  const analytics = document.getElementById('analytics-page');
  const workspace = document.createElement('section'); workspace.className = 'admin-data-workspace'; workspace.setAttribute('aria-label','Activity explorer');
  const controls = analytics.querySelector('.control-stack'); controls.before(workspace);
  document.getElementById('field-count').parentElement.hidden = true;
  document.getElementById('search-input').placeholder = 'Search actions, pages or campaigns';
  for (const [id, text] of [['date-from','From'],['date-to','To']]) {
    const input = document.getElementById(id); const label = document.createElement('label'); label.htmlFor = id; label.textContent = text; input.before(label);
  }
  for (const node of [...analytics.children]) {
    if (node.matches('.control-stack,.summary-panel,.table-panel,.mobile-card-list,.pagination-bar')) workspace.append(node);
  }

  const home = document.getElementById('homepage-form');
  const grid = home.querySelector('.workflow-grid');
  for (const [name, caption, keys] of [
    ['Featured release','The music and artwork featured on your homepage.', ['releaseTitle','releaseDescription','releaseArtwork','firstTrack','spotify','bandcamp','youtube']],
    ['Merchandise','Your featured product, availability and shop link.', ['merchTitle','merchPrice','merchAvailability','merchImage','merchUrl']]
  ]) {
    const section = document.createElement('fieldset'); section.className = 'admin-form-section';
    const legend = document.createElement('legend'); legend.textContent = name;
    const p = document.createElement('p'); p.textContent = caption;
    const fields = document.createElement('div'); fields.className = 'workflow-grid';
    for (const key of keys) { const input = home.elements.namedItem(key); if (input) fields.append(input.closest('label')); }
    section.append(legend,p,fields); grid.before(section);
  }
  grid.remove();

  // Keep recovery controls close to their page, without competing with day-to-day editing.
  document.querySelectorAll('.tool-panel').forEach(panel => {
    const heading = panel.querySelector('h3');
    if (heading?.textContent !== 'Content history') return;
    const disclosure = document.createElement('details'); disclosure.className = 'admin-history';
    const summary = document.createElement('summary'); summary.textContent = 'Content history & restore';
    panel.before(disclosure); heading.remove(); disclosure.append(summary,panel);
  });
  for (const form of document.querySelectorAll('#link-form,#link-edit-form,#campaign-form')) {
    form.querySelectorAll('input:not([type="checkbox"]),select,textarea').forEach(input => {
      if (input.labels.length) return;
      const label = document.createElement('label'); label.htmlFor = input.id;
      label.textContent = (input.getAttribute('aria-label') || input.placeholder || '').replace(/^Edit /,'');
      input.before(label);
    });
  }
}
