import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const load = async path => import(`data:text/javascript;base64,${Buffer.from(fs.readFileSync(path, 'utf8')).toString('base64')}`);
const { saveCampaignDocuments } = await load('assets/js/campaign-store.js');
const { requestedCampaignSlug } = await load('assets/js/campaign-route.js');
const source = fs.readFileSync('assets/js/admin.js', 'utf8');
function extract(name) {
  const start = source.search(new RegExp(`^    (?:async )?function ${name}\\(`, 'm'));
  const tail = source.slice(start);
  const end = tail.slice(8).search(/^    (?:async )?function /m);
  return end < 0 ? tail : tail.slice(0, end + 8);
}
function store(entries = {}, fail = false) {
  const data = new Map(Object.entries(entries));
  return { data, db: {}, doc: (_, collection, id) => `${collection}/${id}`,
    runTransaction: async (_, run) => {
      const writes = [];
      await run({ get: async ref => ({ exists: () => data.has(ref) }), set: (ref, value) => writes.push(() => data.set(ref, value)), delete: ref => writes.push(() => data.delete(ref)) });
      if (fail) throw new Error('Connection lost');
      writes.forEach(write => write());
    }
  };
}
test('renaming moves both campaign copies together', async () => {
  const db = store({ 'campaigns/old': {}, 'public-campaigns/old': {} });
  const payload = { slug: 'new', title: 'Release', live: true };
  await saveCampaignDocuments({ ...db, payload, previousId: 'old' });
  assert.deepEqual([...db.data.keys()], ['campaigns/new', 'public-campaigns/new']);
  assert.deepEqual(db.data.get('public-campaigns/new'), payload);
});
test('a failed commit leaves both original copies intact', async () => {
  const initial = { 'campaigns/old': { title: 'Original' }, 'public-campaigns/old': { title: 'Original' } };
  const db = store(initial, true);
  await assert.rejects(saveCampaignDocuments({ ...db, payload: { slug: 'new' }, previousId: 'old' }));
  assert.deepEqual(Object.fromEntries(db.data), initial);
});
test('duplicate addresses cannot overwrite an editable or public campaign', async () => {
  for (const collection of ['campaigns', 'public-campaigns']) {
    const db = store({ [`${collection}/taken`]: { title: 'Keep me' } });
    await assert.rejects(saveCampaignDocuments({ ...db, payload: { slug: 'taken' } }), /already exists/);
    assert.equal(db.data.size, 1);
    assert.equal(db.data.get(`${collection}/taken`).title, 'Keep me');
  }
});
test('unpublishing saves draft status to both copies', async () => {
  const db = store({ 'campaigns/release': { live: true }, 'public-campaigns/release': { live: true } });
  await saveCampaignDocuments({ ...db, payload: { slug: 'release', live: false }, previousId: 'release' });
  assert.equal(db.data.get('campaigns/release').live, false);
  assert.equal(db.data.get('public-campaigns/release').live, false);
});
test('marketing tags cannot replace the release in the page address', () => {
  assert.equal(requestedCampaignSlug('/smartlink/my-release/', '?utm_campaign=september-promo'), 'my-release');
  assert.equal(requestedCampaignSlug('/smartlink.html', '?campaign=my-release&utm_campaign=promo'), 'my-release');
  assert.equal(requestedCampaignSlug('/smartlink.html', '?utm_campaign=legacy-release'), 'legacy-release');
  assert.equal(requestedCampaignSlug('/smartlink/%E0%A4%A', ''), '');
});
test('refresh failure preserves the selected campaign and form', async () => {
  const campaign = { slug: 'release', title: 'Keep this' };
  const context = vm.createContext({ state: { campaign, campaigns: [campaign], activeCampaignId: 'release' },
    workflows: { isDirty: () => false }, db: {}, collection: () => {}, getDocs: async () => { throw Error('Offline'); },
    elements: { campaignCount: {}, campaignPreview: {}, campaignList: {} }, console: { error() {} },
    syncRefreshButton() {}, syncCampaignFormState() {}, renderCampaign() {}, renderCampaignLibrary() {},
    setCampaignStatus(message) { context.message = message; },
    populateCampaignForm() { throw Error('Should not reset form'); }
  });
  vm.runInContext(extract('loadCampaign'), context);
  await context.loadCampaign();
  assert.equal(context.state.campaign, campaign);
  assert.equal(context.state.activeCampaignId, 'release');
  assert.match(context.message, /still here/);
  assert.equal(context.state.isLoadingCampaign, false);
});
test('refresh cannot overwrite a dirty campaign draft', async () => {
  const context = vm.createContext({ state: {}, workflows: { isDirty: () => true }, setCampaignStatus() {} });
  vm.runInContext(extract('loadCampaign'), context);
  await context.loadCampaign(); // No UI or Firestore dependencies should be touched.
  assert.equal(context.state.isLoadingCampaign, undefined);
});
test('Firebase serves both campaign address formats', () => {
  const config = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
  for (const path of ['/smartlink', '/smartlink/**']) assert.ok(config.hosting.rewrites.some(r => r.source === path && r.destination === '/smartlink.html'));
});

function editorContext(database, draft) {
  const context = vm.createContext({ ...database, saveCampaignDocuments,
    state: { campaigns: [], activeCampaignId: '', campaign: null },
    elements: { campaignSlug: { value: draft.slug } }, readCampaignDraft: () => ({ ...draft }),
    normalizeCampaignSlug: value => value, normalizeCampaignDestinationUrl: value => value,
    getCampaignDestinations: () => [], console: { error() {} },
    syncCampaignFormState() {}, renderCampaign() {}, renderCampaignLibrary() {}, closeCampaignSettingsPanel() {},
    populateCampaignForm(value) { context.populated = value; },
    workflows: { markSaved() { context.markedSaved = true; } },
    setCampaignStatus(message) { context.message = message; }
  });
  vm.runInContext(extract('saveCampaign'), context);
  return context;
}
test('saving a draft updates the editor without a fallible reload', async () => {
  const context = editorContext(store(), { slug: 'release', title: 'Release', live: false });
  await context.saveCampaign({ preventDefault() {} });
  assert.equal(context.state.campaign.title, 'Release');
  assert.equal(context.populated.slug, 'release');
  assert.equal(context.markedSaved, true);
  assert.match(context.message, /Draft saved/);
  assert.equal(context.state.isSavingCampaign, false);
});
test('an address conflict shows the useful error and retains the unsaved draft', async () => {
  const context = editorContext(store({ 'campaigns/taken': {} }), { slug: 'taken', title: 'My unsaved release', live: false });
  await context.saveCampaign({ preventDefault() {} });
  assert.match(context.message, /already exists/);
  assert.equal(context.markedSaved, undefined);
  assert.equal(context.populated, undefined);
  assert.equal(context.readCampaignDraft().title, 'My unsaved release');
  assert.equal(context.state.isSavingCampaign, false);
});
