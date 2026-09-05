export const homeDefaults = {
  releaseTitle: 'Half Awake Eyes',
  releaseDescription: 'Our first six tracks, all in one place. Play the EP below or listen wherever you usually find us.',
  releaseArtwork: 'assets/images/ep-cover-800.webp',
  firstTrack: 'The Taste of Death',
  spotify: 'https://open.spotify.com/album/1McajSMOYTvWAYRFi19CG2',
  bandcamp: 'https://halfawakeeyes.bandcamp.com/',
  youtube: 'https://www.youtube.com/@halfawakeeyes',
  merchTitle: 'The Taste of Death T-Shirt',
  merchPrice: '£20.00',
  merchAvailability: 'Limited run. Sizes XS, S, M and L. Ships from the UK.',
  merchImage: 'assets/images/merch-taste-of-death.png',
  merchUrl: 'https://halfawakeeyes.bigcartel.com/product/the-taste-of-death-t-shirt'
};

export function safeContentUrl(value, image = false) {
  const text = String(value || '').trim();
  if (image && /^assets\/images\/[\w .%/-]+$/.test(text) && !text.includes('..')) return text;
  try { const url = new URL(text); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}

export function validateHomeContent(input) {
  const result = {};
  for (const key of Object.keys(homeDefaults)) {
    const value = String(input[key] ?? homeDefaults[key]).trim();
    if (!value || value.length > 600) throw new Error('Complete every field (maximum 600 characters).');
    if (['releaseArtwork', 'merchImage', 'spotify', 'bandcamp', 'youtube', 'merchUrl'].includes(key) && !safeContentUrl(value, key === 'releaseArtwork' || key === 'merchImage')) throw new Error('Use an HTTPS link or an image from assets/images/.');
    result[key] = value;
  }
  if (!/^https:\/\/open\.spotify\.com\/album\/[a-zA-Z0-9]+(?:\?.*)?$/.test(result.spotify)) throw new Error('Use a Spotify album link for the EP player.');
  return result;
}

export function applyHomeContent(input, root = document) {
  const data = validateHomeContent({ ...homeDefaults, ...input });
  const text = (selector, value) => { const el = root.querySelector(selector); if (el) el.textContent = value; };
  text('#music-title', data.releaseTitle);
  text('.release-copy > p:not(.eyebrow)', data.releaseDescription);
  text('.first-listen strong', data.firstTrack);
  text('.merch-copy h2', data.merchTitle);
  text('.merch-price', data.merchPrice);
  text('.merch-price + p', data.merchAvailability);
  for (const [selector, src, alt] of [['.release-feature > img', data.releaseArtwork, `${data.releaseTitle} artwork`], ['.merch-product img', data.merchImage, data.merchTitle]]) {
    const img = root.querySelector(selector); if (img) { img.src = src; img.alt = alt; }
  }
  ['spotify', 'bandcamp', 'youtube'].forEach((key, index) => { const a = root.querySelectorAll('.streaming-links a')[index]; if (a) a.href = data[key]; });
  root.querySelectorAll('.merch a').forEach(a => a.href = data.merchUrl);
  root.querySelector('.merch-product')?.setAttribute('aria-label', `Shop ${data.merchTitle}`);
  const player = root.querySelector('.music-content iframe');
  if (player) {
    const id = new URL(data.spotify).pathname.split('/')[2];
    const src = `https://open.spotify.com/embed/album/${id}?utm_source=generator&theme=0`;
    if (player.getAttribute('src') !== src) player.src = src;
    player.title = `${data.releaseTitle} on Spotify`;
  }
}
