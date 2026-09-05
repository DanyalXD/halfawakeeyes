const header = document.querySelector('.site-header');
const toggle = document.querySelector('.nav-toggle');
const closeMenu = () => {
  header.classList.remove('menu-open');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Open menu');
};
toggle.setAttribute('aria-label', 'Open menu');

toggle.addEventListener('click', () => {
  const open = header.classList.toggle('menu-open');
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
});

document.querySelectorAll('#site-nav a').forEach(link => link.addEventListener('click', () => {
  closeMenu();
}));

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && header.classList.contains('menu-open')) {
    closeMenu();
    toggle.focus();
  }
});
document.addEventListener('click', event => {
  if (!header.contains(event.target)) closeMenu();
});
window.matchMedia('(min-width: 801px)').addEventListener('change', event => {
  if (event.matches) closeMenu();
});

window.addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 40), { passive: true });
