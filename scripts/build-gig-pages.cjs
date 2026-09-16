// Refresh static show previews for GitHub Pages; visitors receive current Firestore data.
const fs = require('node:fs/promises');
const path = require('node:path');
const {renderGigPage} = require('../functions/gig-page-renderer');
const root = path.resolve(__dirname, '..');
const generatedRoot = path.join(root, 'shows');
function decode(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  return null;
}
async function build() {
  const records = [];
  let token = '';
  do {
    const url = new URL('https://firestore.googleapis.com/v1/projects/half-awake-eyes/databases/(default)/documents/gigs');
    url.searchParams.set('pageSize','1000');
    if (token) url.searchParams.set('pageToken',token);
    const response = await fetch(url, {signal: AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error('Could not read gigs: ' + response.status);
    const data = await response.json();
    records.push(...data.documents || []);
    token = data.nextPageToken || '';
  } while(token);
  await fs.copyFile(path.join(root,'functions/gig-page-renderer.js'),path.join(root,'assets/js/gig-page-renderer.js'));
  const ids = [];
  for (const record of records) {
    const id = record.name.split('/').pop();
    if (id === 'public-index' || !/^[a-zA-Z0-9_-]+$/.test(id)) continue;
    const gig = Object.fromEntries(Object.entries(record.fields || {}).map(([key,value])=>[key,decode(value)]));
    if (String(gig.hideFromLinks ?? gig.hidden).toLowerCase() === 'true' || !/^\d{4}-\d{2}-\d{2}$/.test(gig.date || '')) continue;
    const html = renderGigPage(gig,id).replace('<script src="/assets/js/gig-page.js" defer></script><script type="module" src="/assets/js/public-ticket-actions.js"></script>',
      '<script src="/assets/js/gig-page-renderer.js"></script><script type="module" src="/assets/js/public-gig.js"></script>');
    await fs.mkdir(path.join(generatedRoot,id),{recursive:true});
    await fs.writeFile(path.join(generatedRoot,id,'index.html'),html);
    ids.push(id);
  }
  // Replace old snapshots for removed or hidden gigs without leaving stale ticket buttons.
  const previous = JSON.parse(await fs.readFile(path.join(generatedRoot,'generated.json'),'utf8').catch(()=>'[]'));
  for (const id of previous.filter(id=>!ids.includes(id) && /^[a-zA-Z0-9_-]+$/.test(id))) {
    await fs.writeFile(path.join(generatedRoot,id,'index.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Show not found</title><h1>Show not found</h1></html>');
  }
  await fs.writeFile(path.join(generatedRoot,'generated.json'),JSON.stringify(ids.sort(),null,2)+'\n');
  console.log('Generated '+ids.length+' static gig pages.');
}
build().catch(error=>{console.error(error.message);process.exitCode=1;});
