const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
const renderer = source.slice(source.indexOf('function escapePublicHtml'), source.indexOf('const IONOS_EMAIL'));
const handlers = {};
const gig = {id: 'preview', event: 'Half Awake Eyes Live', date: '2099-10-01', venue: 'Preview Venue', city: 'Glasgow', doorsTime: '19:30', ageRestriction: '18+', ticketPrice: '12.50', doorPrice: '15', ticketPriceIncludesFee: true, ticketUrl: 'https://example.com/tickets', imageUrl: 'http://127.0.0.1:8788/assets/images/gig-photo.jpeg'};
function decodeValue(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  return null;
}
function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}
async function getPublicGigs(path) {
  const response = await fetch('https://firestore.googleapis.com/v1/projects/half-awake-eyes/databases/(default)/documents/' + path.split('/').map(encodeURIComponent).join('/'), {signal: AbortSignal.timeout(10000)});
  if (response.status === 404) return {exists: false};
  if (!response.ok) throw new Error('Could not load public gigs. Please try again.');
  const data = decodeFields((await response.json()).fields || {});
  return {exists: true, data: () => data};
}
function createHandler(get) {
  const exports = {};
  vm.runInNewContext(renderer, {exports, onRequest: (_, fn) => fn, db: {doc: path => ({get: () => get(path)})}, ADMIN_SITE_URL: 'http://127.0.0.1:8788', URL});
  return exports.getPublicEventPage;
}
handlers.preview = createHandler(async () => ({exists: true, data: () => gig}));
handlers.public = createHandler(getPublicGigs);
http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname.startsWith('/shows/')) {
    const response = {set: (key, value) => {res.setHeader(key, value); return response;}, status: code => {res.statusCode = code; return response;}, type: () => {res.setHeader('Content-Type', 'text/html; charset=utf-8'); return response;}, send: html => res.end(html)};
    const accent = new URL(req.url, 'http://localhost').searchParams.get('accent');
    const handler = /^\/shows\/preview\/?$/.test(pathname) ? handlers.preview :
      /^[0-9a-f]{6}$/i.test(accent || '') ? createHandler(async path => {
        const snapshot = await getPublicGigs(path);
        return {exists: snapshot.exists, data: () => ({...snapshot.data(), matchPosterColors: true, posterAccentOverride: '#' + accent, posterBackground: /^[0-9a-f]{6}$/i.test(new URL(req.url, 'http://localhost').searchParams.get('background') || '') ? '#' + new URL(req.url, 'http://localhost').searchParams.get('background') : snapshot.data().posterBackground})};
      }) : handlers.public;
    try { await handler({method: req.method, path: pathname}, response); }
    catch (error) { res.statusCode = 500; res.end(error.message); }
    return;
  }
  const file = path.resolve(root, '.' + pathname);
  if (!pathname.startsWith('/assets/') || !file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.statusCode = 404; res.end(); return;}
  const types = {'.css': 'text/css', '.js': 'text/javascript', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf'};
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(8788, '127.0.0.1', () => console.log('Gig preview: http://127.0.0.1:8788/shows/preview'));
