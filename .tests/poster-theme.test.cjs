const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {allowedPosterUrl, getPosterImage} = require('../functions/poster-sampling');
const theme = import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync('assets/js/poster-theme.js','utf8')).toString('base64'));
test('poster settings default off and reject CSS injection', async () => {
  const {normalizePosterTheme} = await theme;
  assert.equal(normalizePosterTheme().matchPosterColors, false);
  assert.equal(normalizePosterTheme({posterAccent:'#aabbcc;display:none'}).posterAccent, '');
  assert.equal(normalizePosterTheme({posterAccent:'#AABBCC'}).posterAccent, '#aabbcc');
});
test('sampling ignores white margins and transparent pixels', async () => {
  const {pickPosterAccent} = await theme;
  assert.equal(pickPosterAccent(new Uint8ClampedArray([255,255,255,255,220,190,100,255,220,190,100,255,255,0,0,0])), '#dcbe64');
  assert.equal(pickPosterAccent(new Uint8ClampedArray([0,0,0,255,255,255,255,255])), '#e7e4dc');
});
test('background sampling uses the poster edges independently of the accent', async () => {
  const {pickPosterBackground,normalizePosterTheme} = await theme;
  const pixels = new Uint8ClampedArray(64 * 64 * 4).fill(255);
  for(let y=12;y<52;y++)for(let x=12;x<52;x++)pixels.set([0,0,0,255],(y*64+x)*4);
  assert.equal(pickPosterBackground(pixels),'#ffffff');
  for(let i=0;i<pixels.length;i+=4)pixels.set([12,18,25,255],i);
  assert.equal(pickPosterBackground(pixels),'#0c1219');
  assert.equal(normalizePosterTheme({posterBackground:'red;display:none'}).posterBackground,'');
});
test('proxy only permits owned poster hosts without redirects', async () => {
  for (const url of ['http://127.0.0.1/a.png','https://example.com/a.png','https://halfawakeeyes.s3.eu-west-2.amazonaws.com.evil.test/x','https://firebasestorage.googleapis.com/v0/b/other.appspot.com/o/a']) assert.equal(allowedPosterUrl(url), false);
  const url = 'https://halfawakeeyes.s3.eu-west-2.amazonaws.com/poster.png';
  assert.equal(allowedPosterUrl(url), true);
  assert.equal(allowedPosterUrl('https://firebasestorage.googleapis.com/v0/b/half-awake-eyes.appspot.com/o/a'), true);
  const image = await getPosterImage(url, async (_,options) => {
    assert.equal(options.redirect,'error');
    return new Response(new Uint8Array([1,2,3]), {headers:{'content-type':'image/png'}});
  });
  assert.equal(image.dataUrl,'data:image/png;base64,AQID');
  await assert.rejects(getPosterImage(url, async () => new Response('x', {headers:{'content-type':'text/html'}})));
  await assert.rejects(getPosterImage(url, async () => new Response('x', {headers:{'content-type':'image/png','content-length':'9000000'}})));
});
