import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../assets/js/home-content.js', import.meta.url), 'utf8');
const { homeDefaults, validateHomeContent, safeContentUrl, applyHomeContent } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('defaults and edited content validate without accepting extra fields', () => {
  assert.deepEqual(validateHomeContent(homeDefaults), homeDefaults);
  const edited = validateHomeContent({ ...homeDefaults, merchPrice: ' £25.00 ', ignored: true });
  assert.equal(edited.merchPrice, '£25.00');
  assert.equal('ignored' in edited, false);
});

test('rejects unsafe destinations and invalid Spotify embeds', () => {
  for (const url of ['javascript:alert(1)', 'http://example.com', '//example.com', 'https://user:password@example.com']) {
    assert.equal(safeContentUrl(url), '');
    assert.throws(() => validateHomeContent({ ...homeDefaults, merchUrl: url }));
  }
  assert.equal(safeContentUrl('assets/images/../private.png', true), '');
  assert.equal(safeContentUrl('assets/images/cover.webp', true), 'assets/images/cover.webp');
  assert.throws(() => validateHomeContent({ ...homeDefaults, spotify: 'https://example.com/album/test' }));
  assert.throws(() => validateHomeContent({ ...homeDefaults, releaseTitle: '' }));
  assert.throws(() => validateHomeContent({ ...homeDefaults, releaseDescription: 'x'.repeat(601) }));
});

test('content rendering uses text and updates music, artwork and shop destinations together', () => {
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { setAttribute(name, value) { this[name] = value; }, getAttribute(name) { return this[name]; } });
    return nodes.get(selector);
  };
  const streaming = [{}, {}, {}]; const merch = [{}, {}];
  const root = { querySelector: node, querySelectorAll: s => s === '.streaming-links a' ? streaming : merch };
  applyHomeContent({ ...homeDefaults, releaseTitle: '<b>New EP</b>', merchPrice: '£30', spotify: 'https://open.spotify.com/album/NewAlbum123' }, root);
  assert.equal(node('#music-title').textContent, '<b>New EP</b>');
  assert.equal(node('#music-title').innerHTML, undefined);
  assert.equal(node('.merch-price').textContent, '£30');
  assert.match(node('.music-content iframe').src, /embed\/album\/NewAlbum123/);
  assert.equal(streaming[0].href, 'https://open.spotify.com/album/NewAlbum123');
  assert.ok(merch.every(a => a.href === homeDefaults.merchUrl));
});
