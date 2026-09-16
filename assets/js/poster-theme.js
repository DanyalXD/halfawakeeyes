export function normalizePosterTheme(gig = {}) {
  const color = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value.toLowerCase() : '';
  return { matchPosterColors: gig.matchPosterColors === true || gig.matchPosterColors === 'true',
    posterAccent: color(gig.posterAccent), posterAccentOverride: color(gig.posterAccentOverride),
    posterBackground: color(gig.posterBackground),
    posterThemeImage: String(gig.posterThemeImage || '') };
}

export function pickPosterAccent(pixels) {
  const buckets = new Map();
  for (let i = 0; i < pixels.length; i += 4) {
    const [r,g,b,a] = pixels.slice(i, i + 4);
    if (a < 128 || Math.max(r,g,b) < 30 || Math.min(r,g,b) > 235 ||
      (Math.min(r,g,b) > 200 && Math.max(r,g,b) - Math.min(r,g,b) < 45)) continue;
    const key = [r,g,b].map(v => Math.round(v / 24)).join(',');
    const bucket = buckets.get(key) || {count: 0, sum: [0,0,0]};
    bucket.count++; bucket.sum[0] += r; bucket.sum[1] += g; bucket.sum[2] += b;
    buckets.set(key, bucket);
  }
  const best = [...buckets.values()].sort((a,b) => {
    const score = x => x.count * (1 + (Math.max(...x.sum) - Math.min(...x.sum)) / x.count / 128);
    return score(b) - score(a);
  })[0];
  return best ? '#' + best.sum.map(v => Math.round(v / best.count).toString(16).padStart(2,'0')).join('') : '#e7e4dc';
}

export function pickPosterBackground(pixels, width = 64) {
  const buckets = new Map();
  const height = pixels.length / 4 / width;
  for (let i = 0; i < pixels.length; i += 4) {
    const x = (i / 4) % width, y = Math.floor(i / 4 / width);
    if (x >= width * .12 && x < width * .88 && y >= height * .12 && y < height * .88) continue;
    const [r,g,b,a] = pixels.slice(i, i + 4);
    if (a < 128) continue;
    const key = [r,g,b].map(v => Math.round(v / 24)).join(',');
    const bucket = buckets.get(key) || {count: 0, sum: [0,0,0]};
    bucket.count++; bucket.sum[0] += r; bucket.sum[1] += g; bucket.sum[2] += b;
    buckets.set(key, bucket);
  }
  const best = [...buckets.values()].sort((a,b) => b.count - a.count)[0];
  return best ? '#' + best.sum.map(v => Math.round(v / best.count).toString(16).padStart(2,'0')).join('') : '#ffffff';
}

let fetchPoster;
export function configurePosterThemes(callback) { fetchPoster = callback; }
const $ = id => document.getElementById(id);

export function mountPosterTheme(prefix) {
  const box = document.createElement('fieldset');
  box.className = 'full-span';
  box.innerHTML = `<legend>Ticket page colours</legend>
    <label class="gig-edit-toggle"><input type="checkbox" id="${prefix}-poster-match"> Match poster colours</label>
    <div id="${prefix}-poster-options" hidden>
      <label class="gig-edit-toggle"><input type="checkbox" id="${prefix}-poster-override"> Custom accent</label>
      <input type="color" id="${prefix}-poster-color" value="#e7e4dc" aria-label="Ticket page accent" disabled>
      <span id="${prefix}-poster-status" role="status"></span>
    </div>`;
  $(`${prefix}-image-url`).parentElement.after(box);
  const sync = () => {
    $(`${prefix}-poster-options`).hidden = !$(`${prefix}-poster-match`).checked;
    $(`${prefix}-poster-color`).disabled = !$(`${prefix}-poster-override`).checked;
  };
  $(`${prefix}-poster-match`).addEventListener('change', sync);
  $(`${prefix}-poster-override`).addEventListener('change', sync);
  $(`${prefix}-form`).addEventListener('reset', () => setTimeout(() => fillPosterTheme(prefix, {}), 0));
  box.sync = sync;
  box.theme = normalizePosterTheme();
  box.id = `${prefix}-poster-theme`;
}
export function fillPosterTheme(prefix, gig) {
  const theme = normalizePosterTheme(gig), box = $(`${prefix}-poster-theme`);
  box.theme = theme;
  $(`${prefix}-poster-match`).checked = theme.matchPosterColors;
  $(`${prefix}-poster-override`).checked = Boolean(theme.posterAccentOverride);
  $(`${prefix}-poster-color`).value = theme.posterAccentOverride || theme.posterAccent || '#e7e4dc';
  $(`${prefix}-poster-status`).textContent = '';
  box.sync();
}
async function sampleImage(url) {
  const img = new Image(); img.crossOrigin = 'anonymous';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { img.src = ''; reject(new Error('Poster timed out.')); }, 12000);
    img.onload = () => { clearTimeout(timer); resolve(); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('Poster could not be sampled.')); };
    img.src = url;
  });
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  ctx.drawImage(img, 0, 0, 64, 64);
  const pixels = ctx.getImageData(0, 0, 64, 64).data;
  return {posterAccent: pickPosterAccent(pixels), posterBackground: pickPosterBackground(pixels)};
}
export async function readPosterTheme(prefix) {
  const box = $(`${prefix}-poster-theme`), status = $(`${prefix}-poster-status`);
  const theme = {...box.theme, matchPosterColors: $(`${prefix}-poster-match`).checked,
    posterAccentOverride: $(`${prefix}-poster-override`).checked ? $(`${prefix}-poster-color`).value : ''};
  const image = $(`${prefix}-image-url`).value.trim();
  if (theme.matchPosterColors && image && (!theme.posterBackground || !theme.posterAccent || theme.posterThemeImage !== image)) {
    if (!image) throw new Error('Add a poster or choose a custom accent.');
    status.textContent = 'Reading poster colours...';
    try {
      try { Object.assign(theme, await sampleImage(image)); }
      catch {
        if (!fetchPoster) throw new Error('Poster sampling is unavailable.');
        const result = await fetchPoster(image);
        Object.assign(theme, await sampleImage(result.dataUrl));
      }
      theme.posterThemeImage = image;
      $(`${prefix}-poster-color`).value = theme.posterAccentOverride || theme.posterAccent;
      status.textContent = 'Poster palette selected.';
    } catch {
      if (theme.posterAccentOverride) {
        theme.posterBackground = theme.posterBackground || '#111214';
        box.theme = theme;
        return normalizePosterTheme(theme);
      }
      status.textContent = 'Could not read this poster. Choose a custom accent or turn off matching.';
      throw new Error(status.textContent);
    }
  }
  if (theme.matchPosterColors && !image && !theme.posterAccentOverride) throw new Error('Add a poster or choose a custom accent.');
  box.theme = theme;
  return normalizePosterTheme(theme);
}
