// Shared public footer, independent of optional page features and Firebase.
let footerObserver;
export function installPublicFooter() {
  if (!document.body) return null;
  const existing = document.getElementById('hae-site-footer');
  if (existing) return existing;
  footerObserver?.disconnect();

  const settings = document.getElementById('hae-privacy-settings');
  document.querySelectorAll('footer, .footer, .footer-links').forEach(footer => footer.remove());
  document.querySelectorAll('p.footer-note').forEach(note => {
    if (note.querySelector('[data-current-year]')) note.remove();
  });

  const footer = document.createElement('footer');
  footer.id = 'hae-site-footer';
  const brand = document.createElement('a');
  brand.className = 'hae-footer-brand';
  brand.textContent = 'Half Awake Eyes';
  brand.href = new URL('../../index.html', import.meta.url).href;
  const links = document.createElement('nav');
  links.dataset.publicFooterLinks = '';
  links.setAttribute('aria-label', 'Footer navigation');
  for (const [label, page] of [['Home', 'index.html'], ['Press & bookings', 'epk.html'], ['Privacy', 'privacy.html']]) {
    const link = document.createElement('a');
    link.textContent = label;
    link.href = new URL('../../' + page, import.meta.url).href;
    links.append(link);
  }
  if (settings) links.append(settings);
  const copyright = document.createElement('p');
  copyright.className = 'hae-footer-copyright';
  copyright.textContent = '\u00a9 ' + new Date().getFullYear();
  footer.append(brand, links, copyright);
  document.body.append(footer);
  if ('IntersectionObserver' in window) {
    footerObserver = new IntersectionObserver(([entry]) => {
      document.body.classList.toggle('hae-footer-visible', entry.isIntersecting);
    });
    footerObserver.observe(footer);
  }
  return footer;
}
