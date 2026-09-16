(() => {
  const primary = document.getElementById('gig-primary-action');
  const sticky = document.getElementById('gig-sticky-action');
  if (!primary || !sticky || !('IntersectionObserver' in window)) return;

  const mobile = window.matchMedia('(max-width: 600px)');
  let primaryVisible = true;
  function update() {
    const show = mobile.matches && !primaryVisible;
    sticky.hidden = !show;
    document.body.classList.toggle('has-sticky-ticket', show);
  }
  new IntersectionObserver(([entry]) => {
    primaryVisible = entry.isIntersecting;
    update();
  }, { threshold: 0 }).observe(primary);
  mobile.addEventListener('change', update);
})();
