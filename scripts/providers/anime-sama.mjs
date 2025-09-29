// Provider dédié Anime-Sama
import { load as loadHTML } from 'cheerio';
import { fetch } from 'undici';
import pRetry from 'p-retry';

const BASE = (process.env.ANIMESAMA_BASE || 'https://anime-sama.fr').replace(/\/+$/,'');
const UA = process.env.SCRAPER_UA || 'Mozilla/5.0 (SmartTVApp) AppleWebKit/537.36 Chrome/121 Safari/537.36';

const reHls = /https?:\/\/[^\s"'<>]+\.m3u8(?:\?[^\s"'<>]*)?/gi;
const reDash = /https?:\/\/[^\s"'<>]+\.mpd(?:\?[^\s"'<>]*)?/gi;
const reVtt = /https?:\/\/[^\s"'<>]+\.vtt(?:\?[^\s"'<>]*)?/gi;
const reIframe = /<iframe[^>]+src=["']([^"']+)["']/gi;

function normLang(lang='vf') {
  const s = String(lang).toLowerCase();
  if (['vf','fr','fr-fr','français'].includes(s)) return 'vf';
  if (['vostfr','vo','sub','stfr'].includes(s)) return 'vostfr';
  // codes exotiques sur Anime-Sama (VAR/VKR/VCN/…): on garde tel quel
  return s;
}
function seasonPath(season='1') {
  const s = String(season).toLowerCase().trim();
  if (/^(oav|oavs?)$/.test(s)) return 'oav';
  if (/^film(s)?$/.test(s)) return 'film';
  if (/^\d+$/.test(s)) return `saison${s}`;
  return s.replace(/^saison/i,'saison'); // ex: "Saison11" → "saison11"
}
export function buildSeasonUrl({ slug, season='1', lang='vf' }) {
  const sp = seasonPath(season);
  const lg = normLang(lang);
  return `${BASE}/catalogue/${slug}/${sp}/${lg}/`;
}

// --- HTTP utils
async function get(url) {
  return pRetry(async () => {
    const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'fr,en;q=0.8' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }, { retries: 3, factor: 1.8, minTimeout: 350 });
}

// --- Extraction d'une saison (sources + 1er épisode “générique”)
export async function extractSeasonFromAnimeSama({ url, slug, season='1', lang='vf', showTitle }) {
  if (!/^https?:\/\//i.test(url)) throw new Error(`URL invalide: ${url}`);
  const html = await get(url);
  const $ = loadHTML(html);
  const scripts = $('script:not([src])').map((i,el)=>$(el).text()).get().join('\n');
  const text = `${html}\n${scripts}`;

  const hls = [...new Set(text.match(reHls) || [])].map(url => ({ type:'hls', url }));
  const dash = [...new Set(text.match(reDash) || [])].map(url => ({ type:'dash', url }));
  const vtts = [...new Set(text.match(reVtt) || [])].map(url => ({ label:'Français', lang:'fr', url }));

  const iframes = []; let m;
  while ((m = reIframe.exec(html)) !== null) iframes.push({ type:'iframe', url: m[1] });

  const sources = [...hls, ...dash, ...iframes];
  if (!sources.length) {
    // si rien trouvé, tente l'URL “Dernier episode” en changeant d’onglet lecteur (VF/VO)
    const fallback = buildSeasonUrl({ slug, season, lang });
    if (fallback !== url) {
      const html2 = await get(fallback);
      const h2 = (html2.match(reHls)||[]).map(u=>({type:'hls',url:u}));
      const d2 = (html2.match(reDash)||[]).map(u=>({type:'dash',url:u}));
      const i2 = []; let k; const ifrRe=/<iframe[^>]+src=["']([^"']+)["']/gi;
      while ((k = ifrRe.exec(html2)) !== null) i2.push({type:'iframe',url:k[1]});
      sources.push(...h2, ...d2, ...i2);
    }
  }

  const episode = {
    showTitle: showTitle || slug, season: String(season), number: 1, title: 'Épisode 1',
    sources: sources.length ? sources : [{ type:'iframe', url }],
    subtitles: vtts
  };

  return {
    id: `${slug}_${season}_${normLang(lang)}`,
    title: showTitle || slug,
    lang: normLang(lang),
    season: String(season),
    episodes: [episode],
    updatedAt: Date.now(),
    meta: { sourceUrl: url, counts: { hls: hls.length, dash: dash.length, iframes: iframes.length, subs: vtts.length } }
  };
}

// --- Découverte catalogue → slugs
export async function discoverCatalog({ startPage=1, endPage=5 } = {}) {
  const out = new Map(); // slug -> title
  for (let p = startPage; p <= endPage; p++) {
    const url = `${BASE}/catalogue/index.php?page=${p}`;
    const html = await get(url);
    // Liens du style /catalogue/<slug>/
    const re = /href=["']\/catalogue\/([a-z0-9-]+)\/["'][^>]*>([^<]{2,})/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const slug = m[1];
      const title = m[2].replace(/<\/?[^>]+>/g,'').trim();
      if (slug) out.set(slug, title || slug);
    }
    // stop si quasiment rien trouvé sur cette page
    if (p > startPage && [...out.keys()].length === 0) break;
  }
  return [...out.entries()].map(([slug,title]) => ({ slug, title }));
}
