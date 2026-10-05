import { setupPayments } from './admin-payments.js?v=20261005-sumup-collapse';
import { validateStore, storeFromHomepage, renderStore, storeUrl } from './store-content.js';

const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function mountStore() {
  document.querySelector('.dashboard-rail .nav').insertAdjacentHTML('beforeend', '<li class="nav-item"><a class="nav-link tab-label" href="#" data-page="store">Website Store</a></li><li class="nav-item"><a class="nav-link tab-label" href="#" data-page="sumup">SumUp</a></li>');
  document.querySelector('.dashboard-content').insertAdjacentHTML('beforeend', `
    <div id="store-page" class="dashboard-page">
      <div class="manager-card"><h2>Website Store</h2><p>Manage the product cards shown on your homepage and Store page.</p>
        <div class="workflow-actions"><a class="btn ghost-button" href="store/" target="_blank" rel="noopener noreferrer">View website Store page &nearr;</a></div>
      </div>
      <form id="store-form" class="manager-card">
        <h3>Website products</h3><p>Paste links to your existing SumUp products. Publishing updates your Store page and replaces the homepage merch section. Names, images and prices here are display copies: update them when you change SumUp. Sizes, stock and checkout stay in SumUp.</p>
        <fieldset id="store-controls" disabled><div id="store-editor"></div><div class="workflow-actions"><button type="button" id="store-add" class="btn ghost-button">Add product</button><button type="button" id="store-preview-button" class="btn ghost-button">Preview</button><button class="btn btn-accent">Publish products</button></div></fieldset>
        <p id="store-status" role="status">Load the Store page to edit products.</p>
      </form>
      <div id="store-preview" class="manager-card" aria-label="Unpublished store preview" hidden></div>
    </div>
    <div id="sumup-page" class="dashboard-page">
      <div class="manager-card"><h2>SumUp integration</h2><p>Review payments, payouts and refunds. Manage orders, stock and shipping in SumUp.</p>
        <div class="workflow-actions"><a class="btn ghost-button" href="${storeUrl}" target="_blank" rel="noopener noreferrer">View live SumUp store &nearr;</a><a class="btn ghost-button" href="https://me.sumup.com/" target="_blank" rel="noopener noreferrer">Open SumUp dashboard &nearr;</a></div>
      </div>
      <section id="store-finances" class="manager-card" aria-labelledby="store-finances-title">
        <header class="store-finance-header"><div><h3 id="store-finances-title">SumUp payments</h3><p>Payments and payouts from your merchant account.</p></div><button type="button" id="store-refresh-payments" class="btn ghost-button">Refresh</button></header>
        <p id="store-payment-status" role="status">Connect SumUp to view payments here.</p>
        <details class="store-finance-records" open><summary><h4 id="store-transactions-title">Recent transactions</h4></summary><p id="payment-count">Latest 50 payments, including in-person sales.</p><div id="store-payments" tabindex="0" role="region" aria-label="Recent transactions"></div></details>
        <details class="store-finance-records"><summary><h4 id="store-payouts-title">Payouts <span>Last 30 days</span></h4></summary><p>Up to 50 payouts and deductions.</p><div id="store-payouts" tabindex="0" role="region" aria-label="Payouts"></div></details>
        <footer class="store-finance-footer"><p>Shipping and order fulfilment are managed in <a href="https://me.sumup.com/" target="_blank" rel="noopener noreferrer">SumUp &nearr;</a>.</p>
          <details><summary>Connect SumUp <span>One-time setup</span></summary><ol><li>Create a SumUp API key with transaction-history and payout-read access.</li><li>Configure the Firebase secrets <code>SUMUP_API_KEY</code> and <code>SUMUP_MERCHANT_CODE</code>.</li><li>Deploy the <code>getAdminStorePayments</code> function.</li></ol><p>Keep the API key out of homepage content.</p><a href="https://me.sumup.com/settings/api-keys" target="_blank" rel="noopener noreferrer">Open SumUp API keys &nearr;</a></details>
        </footer>
      </section>
    </div>`);
}

export function setupStore(api) {
  const { state, db, doc, getDoc, setDoc } = api;
  let loaded = false, busy = false, generation = 0;
  function addProduct(product = {}) {
    const fieldset = document.createElement('fieldset');
    fieldset.innerHTML = `<legend>Product</legend><div class="workflow-grid">${Object.entries({title:'Product name',price:'Displayed price (e.g. £20.00)',description:'Description / sizes',image:'Image URL or assets/images/ path',url:'SumUp product URL'}).map(([key,label]) => `<label>${label}<input class="form-control" data-field="${key}" maxlength="600" ${key !== 'description' ? 'required' : ''} value="${escape(product[key] || '')}"></label>`).join('')}</div><div class="workflow-actions"><label><input type="checkbox" data-field="visible" ${product.visible !== false ? 'checked' : ''}> Show on website</label><label><input type="checkbox" data-field="soldOut" ${product.soldOut ? 'checked' : ''}> Display as sold out</label><button type="button" class="btn ghost-button" data-move="-1">Move up</button><button type="button" class="btn ghost-button" data-move="1">Move down</button><button type="button" class="btn ghost-button" data-remove>Remove card</button></div>`;
    $('store-editor').append(fieldset); numberProducts();
  }
  function numberProducts() {
    const rows = [...$('store-editor').children];
    rows.forEach((row,index) => { row.querySelector('legend').textContent = `Product ${index + 1}`; row.querySelector('[data-move="-1"]').disabled = index === 0; row.querySelector('[data-move="1"]').disabled = index === rows.length - 1; });
    $('store-add').disabled = rows.length >= 24;
  }
  function values() {
    return validateStore({ products: [...$('store-editor').children].map(row => Object.fromEntries([...row.querySelectorAll('[data-field]')].map(input => [input.dataset.field, input.type === 'checkbox' ? input.checked : input.value]))) });
  }
  function changed() { $('store-form').dispatchEvent(new Event('input', {bubbles:true})); $('store-preview').hidden = true; }
  $('store-add').addEventListener('click', () => { if ($('store-editor').children.length < 24) { addProduct(); changed(); $('store-editor').lastElementChild.querySelector('input').focus(); } });
  $('store-editor').addEventListener('click', event => {
    const button = event.target.closest('[data-remove], [data-move]'); if (!button) return;
    const row = button.closest('fieldset');
    if (button.hasAttribute('data-remove')) row.remove();
    else if (button.dataset.move === '-1' && row.previousElementSibling) row.previousElementSibling.before(row);
    else if (button.dataset.move === '1' && row.nextElementSibling) row.nextElementSibling.after(row);
    numberProducts(); changed();
  });
  $('store-preview-button').addEventListener('click', () => {
    try { renderStore(values(), $('store-preview')); $('store-preview').hidden = false; $('store-status').textContent = 'Preview only. Publish to update the homepage.'; }
    catch (error) { $('store-status').textContent = error.message; }
  });
  $('store-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!loaded || busy || !state.authUser) return;
    const current = generation;
    try {
      const data = values(); busy = true; $('store-controls').disabled = true;
      await setDoc(doc(db, 'site-content', 'store'), { ...data, updatedAt: new Date() });
      if (current !== generation) return;
      api.markSaved('store-form');
      $('store-status').textContent = 'Published. Products will appear on the next Store page or homepage visit.';
    } catch (error) { if (current === generation) $('store-status').textContent = `Not published. ${error.message || 'Try again.'}`; }
    finally { if (current === generation) { busy = false; $('store-controls').disabled = !loaded; } }
  });
  $('store-form').addEventListener('reset', () => { loaded = false; $('store-controls').disabled = true; $('store-editor').replaceChildren(); $('store-preview').hidden = true; });
  async function loadProducts() {
    if (busy || api.isDirty('store-form') || !state.authUser) return;
    const current = generation; busy = true; loaded = false; $('store-controls').disabled = true;
    $('store-status').textContent = 'Loading products…';
    try {
      const snapshot = await getDoc(doc(db, 'site-content', 'store'));
      const data = snapshot.exists() ? snapshot.data() : storeFromHomepage((await getDoc(doc(db, 'site-content', 'homepage'))).data());
      if (current !== generation || !state.authUser) return;
      const valid = validateStore(data); $('store-editor').replaceChildren(); valid.products.forEach(addProduct); numberProducts();
      loaded = true; $('store-status').textContent = snapshot.exists() ? 'Published product cards loaded.' : 'Your featured merch is ready to edit. Publish to enable the new store layout.';
    } catch (error) { if (current === generation) $('store-status').textContent = `Could not load products. Check your connection and deployed Firestore rules. ${error.message || ''}`; }
    finally { if (current === generation) { busy = false; $('store-controls').disabled = !loaded; } }
  }
  const payments = setupPayments(api);
  document.addEventListener('hae-admin-account-changing', () => {
    generation++; loaded = busy = false; $('store-controls').disabled = true; $('store-refresh-payments').disabled = false;
    $('store-editor').replaceChildren(); $('store-payments').replaceChildren(); $('store-payouts').replaceChildren(); $('store-preview').replaceChildren(); $('store-preview').hidden = true;
    $('store-payment-status').textContent = 'Sign in to load payments.'; $('store-status').textContent = 'Load Store to edit products.'; api.markSaved('store-form');
  });
  return { load: page => page === 'sumup' ? payments.load() : loadProducts() };
}
