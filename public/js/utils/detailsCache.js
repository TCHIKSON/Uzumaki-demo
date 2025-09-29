const store = new Map(); // key -> {ts, data}
const TTL = 6 * 60 * 60 * 1000;
let currentCtrl = null;

export const keyOf = (slug, season, lang) => `${slug}_${season}_${lang}`;

export function getCached(slug, season, lang) {
  const v = store.get(keyOf(slug, season, lang));
  if (!v) return null; if (Date.now() - v.ts > TTL) { store.delete(keyOf(slug, season, lang)); return null; }
  return v.data;
}

export async function fetchDetails(slug, season, lang) {
  const k = keyOf(slug, season, lang);
  if (store.has(k) && Date.now() - store.get(k).ts <= TTL) return store.get(k).data;
  if (currentCtrl) currentCtrl.abort();
  currentCtrl = new AbortController();
  const res = await fetch(`/api/anime/${slug}/${season}/${lang}`, { signal: currentCtrl.signal });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const json = await res.json();
  store.set(k, { ts: Date.now(), data: json });
  return json;
}
