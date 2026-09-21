const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function loadPage({blocked = false, hostname = 'halfawakeeyes.co.uk', pixelId = '2221554155032633'} = {}) {
  const calls = [], scripts = [], analyticsCalls = [], listeners = {};
  const gig = {id: 'casey', event: 'Casey', metaPixelId: pixelId};
  const link = {dataset: {gigTicket: JSON.stringify(gig)}, href: 'https://example.com/tickets', addEventListener: (type, fn) => {listeners[type] = fn;}};
  const context = vm.createContext({
    location: {hostname, pathname: '/shows/', search: '?gig=casey'},
    window: {},
    document: {
      createElement: () => ({}), head: {append: script => scripts.push(script)},
      querySelectorAll: () => [link], querySelector: () => ({dataset: {gigPage: JSON.stringify(gig)}})
    }
  });
  const modules = new Map();
  async function localModule(file) {
    if (modules.has(file)) return modules.get(file);
    const module = new vm.SourceTextModule(fs.readFileSync('assets/js/' + file, 'utf8'), {
      context,
      importModuleDynamically: async specifier => {
        if (blocked) throw new Error('Firebase blocked');
        const values = specifier.includes('firebase-app') ? {initializeApp: () => ({}), getApps: () => []} : {getFirestore: () => ({}), doc: () => ({}), setDoc: () => {}};
        const sdk = new vm.SyntheticModule(Object.keys(values), function() {for (const [key, value] of Object.entries(values)) this.setExport(key, value);}, {context});
        await sdk.link(() => {}); await sdk.evaluate(); return sdk;
      }
    });
    modules.set(file, module);
    await module.link(async specifier => {
      if (specifier === './public-site-utils.js') {
        const utils = new vm.SyntheticModule(['firebaseConfig', 'createSiteAnalytics', 'getTrackingParams'], function() {
          this.setExport('firebaseConfig', {}); this.setExport('getTrackingParams', () => ({}));
          this.setExport('createSiteAnalytics', () => ({logEvent: (...args) => analyticsCalls.push(['click', ...args]), logPageViewOnce: (...args) => analyticsCalls.push(['view', ...args])}));
        }, {context});
        await utils.link(() => {}); return utils;
      }
      return localModule(specifier.slice(2));
    });
    return module;
  }
  const page = await localModule('public-ticket-actions.js');
  await page.evaluate();
  await new Promise(resolve => setImmediate(resolve));
  if (context.window.fbq) calls.push(...context.window.fbq.queue.map(args => Array.from(args)));
  return {context, calls, scripts, analyticsCalls, listeners, page, link, modules, gig};
}

for (const blocked of [false, true]) test(`single show tracks views and clicks with Firebase ${blocked ? 'blocked' : 'available'}`, async () => {
  const page = await loadPage({blocked});
  assert.equal(page.scripts.length, 1);
  assert.equal(page.scripts[0].src, 'https://connect.facebook.net/en_US/fbevents.js');
  assert.deepEqual(page.calls.map(call => call.slice(0, 3)), [
    ['init', '2221554155032633'], ['trackSingle', '2221554155032633', 'PageView'], ['trackSingleCustom', '2221554155032633', 'GigTicketView']
  ]);
  page.page.namespace.bindTicketAction(page.link, page.gig);
  page.listeners.click({type: 'click', button: 0});
  page.listeners.auxclick({type: 'auxclick', button: 1});
  page.listeners.auxclick({type: 'auxclick', button: 2});
  const queue = page.context.window.fbq.queue.map(args => Array.from(args));
  assert.equal(queue.filter(call => call[2] === 'GigTicketClick').length, 2);
  assert.equal(queue.at(-1)[3].destination_url, page.link.href);
  page.modules.get('ticket-pixels.js').namespace.trackGigPixel(page.gig, 'GigTicketView');
  assert.equal(page.context.window.fbq.queue.filter(call => call[2] === 'PageView').length, 1);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.analyticsCalls.length, blocked ? 0 : 3);
});

test('local previews and missing pixel IDs send no advertising events', async () => {
  for (const options of [{hostname: 'localhost'}, {pixelId: ''}, {pixelId: '<script>'}]) {
    const page = await loadPage(options);
    page.listeners.click({type: 'click'});
    assert.equal(page.scripts.length, 0);
    assert.equal(page.context.window.fbq, undefined);
  }
});
