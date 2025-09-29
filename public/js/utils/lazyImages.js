export function initLazyImages(root = document) {
  const imgs = [...root.querySelectorAll('img[data-src]')];
  if (!('IntersectionObserver' in window)) {
    imgs.forEach(img => { img.src = img.dataset.src; img.removeAttribute('data-src'); });
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const img = e.target; const src = img.dataset.src;
      if (src) { img.src = src; img.addEventListener('load', () => img.removeAttribute('data-src'), { once: true }); }
      io.unobserve(img);
    });
  }, { rootMargin: '300px' });
  imgs.forEach(i => io.observe(i));
}
