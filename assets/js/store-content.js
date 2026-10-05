import { homeDefaults, safeContentUrl } from './home-content.js';

export const storeUrl = 'https://half-awake-eyes.sumupstore.com/products';

export function validateStore(input) {
  if (!Array.isArray(input?.products) || input.products.length > 24) throw new Error('Use up to 24 store products.');
  return { products: input.products.map(product => {
    const result = {};
    for (const key of ['title', 'price', 'description', 'image', 'url']) {
      const value = String(product?.[key] ?? '').trim();
      if ((!value && key !== 'description') || value.length > 600) throw new Error('Add a title, display price, image and product link (maximum 600 characters each).');
      result[key] = value;
    }
    if (!safeContentUrl(result.image, true)) throw new Error('Use an HTTPS image or a path in assets/images/.');
    if (!safeContentUrl(result.url) || new URL(result.url).hostname !== new URL(storeUrl).hostname) throw new Error('Use a product link from half-awake-eyes.sumupstore.com.');
    result.visible = product.visible !== false;
    result.soldOut = product.soldOut === true;
    return result;
  }) };
}

export function storeFromHomepage(home = {}) {
  const data = { ...homeDefaults, ...home };
  return { products: [{ title: data.merchTitle, price: data.merchPrice, description: data.merchAvailability,
    image: data.merchImage, url: data.merchUrl.includes('sumupstore.com') ? data.merchUrl : storeUrl, visible: true, soldOut: false }] };
}

export function renderStore(input, root, { standalone = false, featured = false } = {}) {
  const { products } = validateStore(input);
  const doc = root.ownerDocument;
  const make = (tag, text, className) => {
    const element = doc.createElement(tag);
    if (text) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const heading = make('div', '', 'store-heading');
  if (featured) heading.append(make('h2', 'official merch'), make('p', 'Find your fit. Sizes and checkout on SumUp.'));
  else heading.append(make('p', 'Official merch', 'eyebrow'), make(standalone ? 'h1' : 'h2', 'The store.'));
  if (!featured) heading.append(make('p', 'Choose your size and complete your purchase securely on SumUp.'));
  const browse = make('a', featured ? 'Shop all \u2197' : 'View all products on SumUp \u2197', 'button button-outline');
  browse.href = storeUrl; browse.target = '_blank'; browse.rel = 'noopener noreferrer';
  if (!featured || !products.some(product => product.visible)) heading.append(browse);
  const grid = make('div', '', 'store-products');
  for (const product of products.filter(item => item.visible)) {
    const card = make('article', '', 'store-product');
    const img = make('img'); img.src = standalone && product.image.startsWith('assets/') ? `../${product.image}` : product.image; img.alt = product.title; img.loading = 'lazy'; img.width = 800; img.height = 800;
    if (featured) {
      const item = make(product.soldOut ? 'div' : 'a', '', 'merch-item');
      if (!product.soldOut) {
        item.href = product.url;
        item.setAttribute('aria-label', `Shop ${product.title} on SumUp`);
      }
      item.append(img, make('h3', product.title), make('p', product.soldOut ? 'Sold out' : product.price, 'merch-price'));
      if (!product.soldOut) item.append(make('span', 'View sizes \u2197', 'merch-action'));
      card.append(item); grid.append(card); continue;
    }
    card.append(img, make('h3', product.title), make('p', product.price, 'merch-price'), make('p', product.description));
    if (product.soldOut) card.append(make('p', 'Sold out', 'eyebrow'));
    else {
      const buy = make('a', featured ? 'Choose size \u2197' : 'Choose options & buy \u2197', 'button button-solid');
      buy.href = product.url; buy.target = '_blank'; buy.rel = 'noopener noreferrer'; buy.setAttribute('aria-label', `Choose options and buy ${product.title} on SumUp`); card.append(buy);
    }
    grid.append(card);
  }
  if (!grid.children.length) grid.append(make('p', 'Browse our SumUp store for current availability.'));
  root.classList.remove('merch', 'merch-showcase'); root.classList.add('store');
  if (featured) root.classList.add('merch-showcase');
  root.replaceChildren(heading, grid);
}
