// scripts/warmup.mjs
import fs from "node:fs/promises";
import path from "node:path";
import pLimit from "p-limit";
import { fetch } from "undici";
import { extractDetailsFromPage } from "./http-extractor.mjs";

const DETAILS_DIR = path.join(process.cwd(), "data", "details");
const WARMUP_FILE = path.join(process.cwd(), "data", "warmup.json");
const UA = process.env.SCRAPER_UA || 'Mozilla/5.0 (Windows NT 10.0; SmartTVApp) AppleWebKit/537.36 Chrome/122 Safari/537.36';

// Concurrence globale
const limit = pLimit(Number(process.env.WARMUP_CONCURRENCY || 2));

// Defaults
const DEFAULT_LANGS = ["vf", "vostfr"];
const DEFAULT_SEASONS = [1, 2, 3, 4, 5];

// Options via env
const limitCount = Number(process.env.WARMUP_LIMIT || 0);
const tpl = process.env.WARMUP_URL_TEMPLATE || ""; // ex: https://anime-sama.fr/catalogue/{slug}/saison{season}/{lang}/
const VERIFY = process.env.WARMUP_VERIFY !== "0";  // 1 par défaut: on vérifie les URLs construites
const DRY_RUN = process.env.DRY_RUN === "1";       // 1 = n'écrit rien, affiche juste
const HEAD_TIMEOUT_MS = Number(process.env.WARMUP_HEAD_TIMEOUT_MS || 5000);
const SLUGIFY = process.env.WARMUP_SLUGIFY === "1"; // 1 = normalise les slugs (., _ → - etc.)

// ---------- utils ----------
function normalizeLang(l) {
  if (!l) return null;
  const s = String(l).trim().toLowerCase();
  if (s === "vf") return "vf";
  if (s === "vost" || s === "vostfr") return "vostfr";
  return s;
}
function isHttpUrl(u) {
  try { const x = new URL(u); return x.protocol === "http:" || x.protocol === "https:"; }
  catch { return false; }
}
function seasonsOf(item) {
  // supporte item.seasons (array), item.season (unique)
  let arr = [];
  if (Array.isArray(item.seasons)) arr = item.seasons;
  else if (item.season != null) arr = [item.season];

  arr = arr.map(n => parseInt(n, 10)).filter(n => Number.isFinite(n) && n > 0);
  if (arr.length === 0) arr = DEFAULT_SEASONS.slice();
  return Array.from(new Set(arr)); // dédupe
}
function languagesOf(item) {
  // supporte item.languages (array), item.lang (string|array)
  let arr = [];
  if (Array.isArray(item.languages)) arr = item.languages;
  else if (Array.isArray(item.lang)) arr = item.lang;
  else if (item.lang) arr = [item.lang];

  arr = arr.map(normalizeLang).filter(Boolean);
  if (arr.length === 0) arr = DEFAULT_LANGS.slice();
  return Array.from(new Set(arr)); // dédupe
}
function normalizeSlug(slug) {
  if (!SLUGIFY) return slug;
  return String(slug || "")
    .toLowerCase()
    .replace(/[\s._]+/g, "-")    // espaces, ., _ -> -
    .replace(/[^a-z0-9-]/g, "-") // autres -> -
    .replace(/-+/g, "-")         // compresser
    .replace(/^-|-$/g, "");      // trim -
}
function idOf({ slug, season, lang }) {
  return `${slug}_${season}_${lang}`;
}
function buildUrlFromTemplate(entry, itemLevelTemplate) {
  const template = (itemLevelTemplate && itemLevelTemplate.includes("{")) ? itemLevelTemplate : tpl;
  if (!template) return "";
  return template
    .replaceAll("{slug}", entry.slug)
    .replaceAll("{season}", String(entry.season))
    .replaceAll("{lang}", entry.lang);
}
async function checkUrlAvailable(url) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), HEAD_TIMEOUT_MS);
  try {
    // HEAD est parfois bloqué → GET rapide
   const res = await fetch(url, {
     method: "GET",
     signal: ctrl.signal,
     redirect: "follow",
     headers: { "user-agent": UA, "accept-language": "fr,en;q=0.8" }
   });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(to);
  }
}
async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }

// ---------- expansion ----------
/**
 * Prend warmup.json et renvoie une liste "expansée" de tâches:
 * { slug, season, lang, title, url? }
 * - Entrées “série” : { slug, title, image?, seasons?, languages?, url? (template possible) }
 * - Entrées déjà “expansées” : { slug, season, lang, title, url? }
 * Defaults: seasons=[1..5] si absent/vide, languages=[vf,vostfr] si absent.
 */
async function expandWarmup(list) {
  const tasks = [];

  for (const item of list) {
    const rawSlug = item.slug;
    const slug = normalizeSlug(rawSlug);
    const title = item.title || rawSlug || "Sans titre";

    // Si déjà expansé OU si on a au moins season/lang quelque part
    const hasAnySeason = item.season != null || (Array.isArray(item.seasons) && item.seasons.length >= 0);
    const hasAnyLang = item.lang != null || Array.isArray(item.languages);
    if (hasAnySeason || hasAnyLang) {
      const seasons = seasonsOf(item);
      const langs = languagesOf(item);
      for (const season of seasons) {
        for (const lang of langs) {
          const base = { slug, season: String(season), lang: normalizeLang(lang), title };
          const url = (typeof item.url === "string" ? item.url : undefined) || buildUrlFromTemplate(base, item.url);
          tasks.push({ ...base, url });
        }
      }
      continue;
    }

    // Sinon: entrée série “minimale” -> defaults
    const seasons = DEFAULT_SEASONS.slice();
    const langs = DEFAULT_LANGS.slice();
    for (const season of seasons) {
      for (const lang of langs) {
        const base = { slug, season: String(season), lang, title };
        const url = buildUrlFromTemplate(base, item.url);
        tasks.push({ ...base, url });
      }
    }
  }

  return tasks;
}

// ---------- main ----------
async function run() {
  const raw = JSON.parse(await fs.readFile(WARMUP_FILE, "utf8"));
  await ensureDir(DETAILS_DIR);

  // 1) Expansion + defaults
  let tasks = await expandWarmup(Array.isArray(raw) ? raw : []);
  if (limitCount > 0) tasks = tasks.slice(0, limitCount);

  // 2) Vérification optionnelle des URLs (retire les combos qui n'existent pas)
  if (VERIFY) {
    const verified = [];
    await Promise.all(tasks.map(t => limit(async () => {
      let url = (t.url || "").trim();
      if (!isHttpUrl(url)) url = buildUrlFromTemplate(t); // tente avec le template global
      if (!isHttpUrl(url)) { t.url = url; verified.push(t); return; }      // sera SKIP plus tard
      const ok = await checkUrlAvailable(url);
      if (ok) { t.url = url; verified.push(t); }
      // sinon, on l'écarte silencieusement
    })));
    tasks = verified;
  } else {
    // Sans vérif: au moins construire l'URL si possible
    tasks = tasks.map(t => {
      const url = (t.url && isHttpUrl(t.url)) ? t.url : buildUrlFromTemplate(t);
      return { ...t, url };
    });
  }

  // 3) Dry-run: aperçu et sortie
  if (DRY_RUN) {
    console.log(`DRY_RUN=1 → ${tasks.length} tâches générées (aucune écriture)`);
    for (const t of tasks.slice(0, 20)) {
      console.log(`- ${idOf(t)} -> ${t.url || '(url manquante)'}`);
    }
    return;
  }

  // 4) Scrape & write
  let processed = 0, ok = 0, fail = 0, skip = 0;
  await Promise.all(tasks.map(task => limit(async () => {
    processed++;
    const id = idOf(task);
    const url = (task.url || "").trim();
    if (!isHttpUrl(url)) {
      console.error(`SKIP ${id} url manquante (ajoute "url" dans warmup.json ou fournis WARMUP_URL_TEMPLATE)`);
      skip++; return;
    }
    const out = path.join(DETAILS_DIR, `${id}.json`);
    try {
      const data = await extractDetailsFromPage({
        url,
        slug: task.slug,
        season: task.season,
        lang: task.lang,
        showTitle: task.title
      });
      await fs.writeFile(out, JSON.stringify(data, null, 2), "utf8");
      console.log("OK", id, data.meta?.counts);
      ok++;
    } catch (e) {
      console.error("FAIL", id, e.message || e);
      fail++;
    }
  })));

  console.log(`\nSUMMARY processed=${processed} ok=${ok} skip=${skip} fail=${fail}`);
}

run().catch(e => (console.error(e), process.exit(1)));
