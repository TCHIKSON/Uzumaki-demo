// warmup → details (Mongo → Mongo)
// Lit la collection "animes" et upsert les détails en "details".
// Aucun fichier JSON lu/écrit.

import pLimit from "p-limit";
import { fetch } from "undici";
import { MongoClient } from "mongodb";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const UA =
  process.env.SCRAPER_UA ||
  "Mozilla/5.0 (Windows NT 10.0; SmartTVApp) AppleWebKit/537.36 Chrome/122 Safari/537.36";

const limit = pLimit(Number(process.env.WARMUP_CONCURRENCY || 2));
const limitCount = Number(process.env.WARMUP_LIMIT || 0);

const VERIFY = process.env.WARMUP_VERIFY !== "0";     // 1 par défaut → HEAD GET pour valider l'URL
const DRY_RUN = process.env.DRY_RUN === "1";
const HEAD_TIMEOUT_MS = Number(process.env.WARMUP_HEAD_TIMEOUT_MS || 5000);
const SLUGIFY = process.env.WARMUP_SLUGIFY === "1";

// Mongo
const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB  = process.env.MONGO_DB_NAME;
const MONGO_COL_ANIMES  = process.env.MONGO_COL_ANIMES  || "animes";
const MONGO_COL_DETAILS = process.env.MONGO_COL_DETAILS || "details";

// ─────────────────────────────────────────────────────────────────────────────
// Mongo connection & indexes
// ─────────────────────────────────────────────────────────────────────────────

let mongoClient, animesCol, detailsCol;

async function connectMongo() {
  if (animesCol && detailsCol) return { animesCol, detailsCol };
  if (!MONGO_URI || !MONGO_DB) {
    throw new Error("MONGO_URI et/ou MONGO_DB_NAME non définis");
  }
  mongoClient = new MongoClient(MONGO_URI);
  await mongoClient.connect();
  const db = mongoClient.db(MONGO_DB);
  animesCol = db.collection(MONGO_COL_ANIMES);
  detailsCol = db.collection(MONGO_COL_DETAILS);

  // Index (idempotents)
  await detailsCol.createIndex(
    { slug: 1, seasonName: 1, lang: 1 },
    { name: "slug_season_lang_unique", unique: true }
  );
  await detailsCol.createIndex({ slug: 1 }, { name: "by_slug" });

  return { animesCol, detailsCol };
}

// ─────────────────────────────────────────────────────────────────────────────
// utils
// ─────────────────────────────────────────────────────────────────────────────

function normalizeType(t) {
  return String(t || "").toLowerCase().replace(/[,\s]+/g, " ").trim();
}
function isScanType(typeNorm) {
  return /\bscan(s)?\b/.test(typeNorm);
}
function languagesFromItem(item) {
  const raw =
    (Array.isArray(item.languages) && item.languages) ||
    (Array.isArray(item.lang) && item.lang) ||
    (item.languages ? [item.languages] : []) ||
    (item.lang ? [item.lang] : []);

  let langs = raw
    .map((x) => String(x || "").trim().toLowerCase())
    .filter(Boolean);

  const typeNorm = normalizeType(item.type || item.types);
  if (langs.length === 0 && !isScanType(typeNorm)) {
    langs = ["vostfr"]; // défaut si pas scan
  }
  return [...new Set(langs)];
}
function seasonsFromItem(item) {
  const seasons = Array.isArray(item.seasons)
    ? item.seasons
    : Array.isArray(item.season)
    ? item.season
    : [];
  return seasons
    .map((s) => {
      const name = s?.name ?? s?.NAME ?? s?.titre ?? s?.TITLE ?? null;
      const href = s?.seasonHref ?? s?.SEASONHREF ?? s?.href ?? s?.HREF ?? null;
      return name && href ? { name: String(name), seasonHref: String(href) } : null;
    })
    .filter(Boolean);
}
function slugifyLite(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function normalizeSlug(slug) {
  if (!SLUGIFY) return slug;
  return String(slug || "")
    .toLowerCase()
    .replace(/[\s._]+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
function idOf({ slug, type, seasonName, lang }) {
  return `${slugifyLite(slug)}_${slugifyLite(type)}_${slugifyLite(seasonName)}_${slugifyLite(
    lang
  )}`;
}
function joinUrl(base, rel) {
  if (!base) return "";
  if (!base.endsWith("/")) base += "/";
  try {
    return new URL(rel, base).toString();
  } catch {
    return "";
  }
}
function swapLangInUrl(url, lang) {
  const L = String(lang || "").toLowerCase();
  if (L === "vostfr" || !L) return url;
  const replaced = url.replace(/\/(vostfr|vf)(\/|$)/i, `/${L}$2`);
  if (replaced !== url) return replaced;
  return url ? (url.endsWith("/") ? url + L + "/" : url + "/" + L + "/") : "";
}
function isHttpUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === "http:" || x.protocol === "https:";
  } catch {
    return false;
  }
}
async function checkUrlAvailable(url) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), HEAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": UA, "accept-language": "fr,en;q=0.8" },
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(to);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Extraction très simple depuis HTML (placeholder à affiner)
// ─────────────────────────────────────────────────────────────────────────────

async function extractDetailsFromPage({ url, slug, season, lang, showTitle }) {
  // Tu peux remplacer cette fonction par ta vraie logique Playwright
  const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": "fr,en;q=0.8" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  // Basique : repère “épisode N” & quelques URLs
  const episodeMatches = html.match(/épisode\s*(\d+)/gi) || [];
  const linkMatches = html.match(/https?:\/\/[^\s"'<>]+/gi) || [];

  const episodes = [];
  for (let i = 0; i < Math.max(1, episodeMatches.length); i++) {
    episodes.push({
      number: i + 1,
      title: `Episode ${i + 1}`,
      sources: linkMatches.slice(i * 2, (i + 1) * 2).map((url) => ({ url, quality: "720p" })),
    });
  }

  return {
    episodes,
    meta: { counts: { episodes: episodes.length, sources: linkMatches.length } },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
/** Charge les items "animes" depuis Mongo (au lieu de warmup.json) */
// ─────────────────────────────────────────────────────────────────────────────
async function loadWarmupItemsFromMongo() {
  const { animesCol } = await connectMongo();
  const cursor = animesCol.find(
    {},
    {
      projection: {
        _id: 0,
        slug: 1,
        title: 1,
        url: 1,
        image: 1,
        genres: 1,
        type: 1,
        languages: 1,
        seasons: 1, // [{ name, seasonHref }]
      },
    }
  );
  const all = await cursor.toArray();
  return all;
}

/** Transforme les animes en tâches (season × lang → URL finale) */
async function expandFromAnimes(items) {
  const tasks = [];
  for (const item of items) {
    const slug = normalizeSlug(String(item.slug || "").trim());
    const title = item.title || slug || "Sans titre";
    const typeNorm = normalizeType(item.type || item.types);
    const langs = languagesFromItem(item);
    const seasons = seasonsFromItem(item);
    const baseUrl = String(item.url || "").trim();

    if (isScanType(typeNorm) && langs.length === 0) {
      continue; // on ignore les scans sans langue
    }
    if (!baseUrl || seasons.length === 0) continue;

    for (const { name, seasonHref } of seasons) {
      const baseSeasonUrl = joinUrl(baseUrl, seasonHref);
      for (const lang of langs.length ? langs : ["vostfr"]) {
        const finalUrl = lang.toLowerCase() === "vostfr" ? baseSeasonUrl : swapLangInUrl(baseSeasonUrl, lang);
        tasks.push({
          slug,
          title,
          type: typeNorm,
          seasonName: name,
          lang: String(lang).toLowerCase(),
          url: finalUrl,
          image: item.image || null,
        });
      }
    }
  }
  return tasks;
}

// Upsert des résultats en base
async function upsertResultsToMongo(results) {
  const { detailsCol } = await connectMongo();
  let count = 0;
  for (const r of results) {
    const { slug, seasonName, lang, title, type, image, url, data } = r;
    if (!slug || !seasonName || !lang) continue;

    const doc = {
      slug,
      seasonName,                                 // clef logique
      lang: String(lang).toLowerCase(),           // "vostfr"/"vf"
      title,
      type,
      image,
      url,
      episodes: data?.episodes || [],
      meta: data?.meta || {},
      updatedAt: new Date(),
    };

    await detailsCol.updateOne(
      { slug, seasonName, lang: doc.lang },
      { $set: doc },
      { upsert: true }
    );
    count++;
  }
  return count;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  try {
    await connectMongo();
    console.log(`✅ Connecté à MongoDB → ${MONGO_DB} (animes=${MONGO_COL_ANIMES}, details=${MONGO_COL_DETAILS})`);

    // 1) Lire les animes depuis Mongo
    let items = await loadWarmupItemsFromMongo();
    console.log(`📥 ${items.length} animes chargés depuis Mongo`);

    // 2) Expansion en tâches (season × lang)
    let tasks = await expandFromAnimes(items);
    if (limitCount > 0) tasks = tasks.slice(0, limitCount);
    console.log(`🧩 ${tasks.length} tâches générées`);

    // 3) Vérification optionnelle des URLs
    if (VERIFY) {
      console.log("🔎 Vérification des URLs (HTTP)...");
      const verified = [];
      await Promise.all(
        tasks.map((t) =>
          limit(async () => {
            const ok = isHttpUrl(t.url) && (await checkUrlAvailable(t.url));
            if (ok) verified.push(t);
          })
        )
      );
      tasks = verified;
      console.log(`✅ ${tasks.length} URLs valides`);
    }

    if (DRY_RUN) {
      console.log(`DRY_RUN=1 → ${tasks.length} tâches (aucune écriture)`);
      for (const t of tasks.slice(0, 20)) console.log("-", idOf(t), "->", t.url);
      return;
    }

    // 4) Scrape & collect
    let processed = 0,
      okCount = 0,
      fail = 0,
      skip = 0;
    const results = [];

    console.log(`🚀 Début du scraping de ${tasks.length} URLs...`);
    await Promise.all(
      tasks.map((task) =>
        limit(async () => {
          processed++;
          const id = idOf(task);
          if (!isHttpUrl(task.url)) {
            skip++;
            return;
          }
          try {
            const data = await extractDetailsFromPage({
              url: task.url,
              slug: task.slug,
              season: "1",
              lang: task.lang,
              showTitle: task.title,
            });

            // Vérifier qu'il y a au moins une source exploitable
            const episodes = data?.episodes || [];
            let hasRealSource = false;
            for (const ep of episodes) {
              const sources = ep?.sources || [];
              for (const src of sources) {
                if (src?.url) {
                  hasRealSource = true;
                  break;
                }
              }
              if (hasRealSource) break;
            }
            if (!hasRealSource) {
              skip++;
              return;
            }

            results.push({
              id,
              slug: task.slug,
              type: task.type,
              image: task.image,
              lang: task.lang,
              title: task.title,
              url: task.url,
              seasonName: task.seasonName,
              data,
            });
            okCount++;
          } catch (e) {
            fail++;
          }
        })
      )
    );

    // 5) Upsert en Mongo
    if (results.length > 0) {
      const n = await upsertResultsToMongo(results);
      console.log(`💾 ${n} fiches (slug+seasonName+lang) upsert dans ${MONGO_DB}.${MONGO_COL_DETAILS}`);
    } else {
      console.warn("⚠️ Aucun résultat à enregistrer");
    }

    // 6) Stats console
    const typeStats = {};
    for (const r of results) typeStats[r.type] = (typeStats[r.type] || 0) + 1;
    console.log(`\n📊 SUMMARY processed=${processed} ok=${okCount} skip=${skip} fail=${fail}`);
    console.log("Par type:", typeStats);
  } finally {
    if (mongoClient) {
      try {
        await mongoClient.close();
      } catch {}
    }
  }
}

run().catch((e) => (console.error("❌ Erreur:", e), process.exit(1)));
