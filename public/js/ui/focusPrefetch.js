import { fetchDetails } from '../utils/detailsCache.js';
export function bindFocusPrefetch(gridEl, metaOf) {
  let t = 0;
  gridEl.addEventListener('focusin', (e) => {
    const card = e.target.closest('.card'); if (!card) return;
    const m = metaOf(card); if (!m) return;
    clearTimeout(t);
    t = setTimeout(() => fetchDetails(m.slug, m.season || '1', m.lang || 'fr').catch(()=>{}), 120);
  });
}
