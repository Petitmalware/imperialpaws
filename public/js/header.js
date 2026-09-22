document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.main-nav');
  const header = document.querySelector('.site-header');
  if (!toggle || !nav || !header) return;
  const mobile = window.matchMedia('(max-width: 1080px)');
  document.documentElement.classList.add('nav-ready');
  const setOpen = open => {
    const expanded = mobile.matches && open;
    nav.classList.toggle('open', expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', expanded ? 'Close navigation' : 'Open navigation');
    nav.inert = mobile.matches && !expanded;
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', event => { if (event.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav.classList.contains('open')) { setOpen(false); toggle.focus(); }
  });
  document.addEventListener('click', event => { if (!header.contains(event.target)) setOpen(false); });
  header.addEventListener('focusout', () => {
    setTimeout(() => { if (!header.contains(document.activeElement)) setOpen(false); }, 0);
  });
  mobile.addEventListener('change', () => setOpen(false));
  const updateShadow = () => header.classList.toggle('scrolled', window.scrollY > 10);
  window.addEventListener('scroll', updateShadow, { passive: true });
  updateShadow();
  setOpen(false);
});
