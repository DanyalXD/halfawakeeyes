import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const homeSource = await readFile(new URL('../assets/js/home-content.js', import.meta.url), 'utf8');
const homeUrl = `data:text/javascript;base64,${Buffer.from(homeSource).toString('base64')}`;
const source = (await readFile(new URL('../assets/js/store-content.js', import.meta.url), 'utf8')).replace("'./home-content.js'", JSON.stringify(homeUrl));
const { validateStore, storeFromHomepage, renderStore, storeUrl } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('existing merch seeds product cards; unsafe links and oversized catalogues are rejected', () => {
  const initial = storeFromHomepage();
  assert.equal(validateStore(initial).products[0].url, storeUrl);
  for (const url of ['javascript:alert(1)', 'https://half-awake-eyes.sumupstore.com.evil.test/product', 'https://user:secret@half-awake-eyes.sumupstore.com/product', 'http://half-awake-eyes.sumupstore.com/product']) {
    assert.throws(() => validateStore({products:[{...initial.products[0], url}]}));
  }
  assert.throws(() => validateStore({products:[{...initial.products[0], image:'assets/images/../private.png'}]}));
  assert.throws(() => validateStore({products:Array(25).fill(initial.products[0])}));
  assert.deepEqual(validateStore({products:[]}), {products:[]});
});

test('hidden products and sold-out buy buttons are excluded; content stays text', () => {
  const node = tag => ({tag, children:[], classList:{remove(){},add(){}}, append(...nodes){this.children.push(...nodes);}, replaceChildren(...nodes){this.children=nodes;}, setAttribute(key,value){this[key]=value;}});
  const root = node('section'); root.ownerDocument = {createElement:node};
  const product = storeFromHomepage().products[0];
  renderStore({products:[{...product,title:'<img onerror=alert(1)>',soldOut:true},{...product,visible:false},{...product,title:'Available'}]}, root);
  const cards = root.children[1].children;
  assert.equal(cards.length,2);
  assert.equal(cards[0].children.find(n => n.tag === 'h3').textContent,'<img onerror=alert(1)>');
  assert.equal(cards[0].children.some(n => n.tag === 'a'),false);
  assert.equal(cards[1].children.find(n => n.tag === 'a').href,storeUrl);
  renderStore({products:[product]}, root, {standalone:true});
  assert.equal(root.children[0].children[1].tag, 'h1');
  assert.equal(root.children[1].children[0].children[0].src, '../assets/images/merch-taste-of-death.png');
  renderStore({products:[{...product,image:'https://example.com/shirt.png'}]}, root, {standalone:true});
  assert.equal(root.children[1].children[0].children[0].src, 'https://example.com/shirt.png');
  renderStore({products:[product,{...product,soldOut:true},{...product,visible:false}]}, root, {featured:true});
  assert.equal(root.children[0].children[0].tag, 'h2');
  assert.equal(root.children[0].children[0].textContent, 'official merch');
  const rows = root.children[1].children;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].className, 'store-product');
  assert.equal(rows[0].children[0].children.find(n => n.tag === 'h3').textContent, product.title);
  assert.equal(rows[0].children.find(n => n.tag === 'a').href, storeUrl);
  assert.equal(rows[1].children.some(n => n.tag === 'a'), false);
  assert.equal(root.children[0].children.length, 2);
  assert.equal(rows[0].children[0].children.length, 4);
  assert.equal(rows[1].children[0].children[2].textContent, 'Sold out');
  renderStore({products:[]}, root, {featured:true});
  assert.equal(root.children[0].className, 'store-heading');

});
