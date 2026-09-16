"use strict";
const LIMIT = 6 * 1024 * 1024;
function allowedPosterUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    if (url.hostname === 'halfawakeeyes.s3.eu-west-2.amazonaws.com') return true;
    return url.hostname === 'firebasestorage.googleapis.com' &&
      /^\/v0\/b\/half-awake-eyes\.(appspot\.com|firebasestorage\.app)\/o\//.test(url.pathname);
  } catch { return false; }
}
async function getPosterImage(url, fetchImage = fetch) {
  if (!allowedPosterUrl(url)) throw new Error('Choose artwork from the media library or use a custom accent.');
  const response = await fetchImage(url, {redirect: 'error', signal: AbortSignal.timeout(12000)});
  const type = (response.headers.get('content-type') || '').split(';')[0];
  if (!response.ok || !['image/png', 'image/jpeg', 'image/webp'].includes(type)) throw new Error('Unsupported poster image.');
  if (Number(response.headers.get('content-length')) > LIMIT) throw new Error('Poster is too large.');
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > LIMIT) throw new Error('Poster is too large.');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel(); }
  return {dataUrl: 'data:' + type + ';base64,' + Buffer.concat(chunks).toString('base64')};
}
module.exports = {allowedPosterUrl, getPosterImage};
