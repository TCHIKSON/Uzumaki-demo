import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import express from "express";
import crypto from "node:crypto";
import { spawn } from 'child_process';
import {
  getMem,
  setMem,
  readDetailsFromDisk,
  makeCacheHeaders,
} from "./cache.js";
import rateLimit from "express-rate-limit";

// Importer vos extracteurs
import SibnetExtractor from "./playerGetSibnet.js";
import SendVidExtractor from "./playerGetSendvid.js";

/* ----------------- Utils ----------------- */
function toId(input) {
  return (
    String(input || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "inconnu"
  );
}

function readJsonSafe(filePath) {
  try {
    const buf = fsSync.readFileSync(filePath);
    const data = JSON.parse(buf.toString("utf8"));
    const stat = fsSync.statSync(filePath);
    return { ok: true, data, stat, path: filePath };
  } catch (e) {
    return { ok: false, error: e };
  }
}

function tryPaths(paths) {
  for (const p of paths) {
    const res = readJsonSafe(p);
    if (res.ok) return res;
  }
  return { ok: false };
}

function sendJson(res, stat, body, status = 200) {
  if (stat) res.set("Last-Modified", stat.mtime.toUTCString());
  res.status(status).json(body);
}

// Fonction pour créer une clé de cache basée sur les URLs
function makeRequestKey(urls, userAgent = "") {
  const sortedUrls = [...new Set(urls)].sort();
  const content = JSON.stringify({ urls: sortedUrls, ua: userAgent.slice(0, 100) });
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

// Fonction pour détecter le type d'hébergeur
function detectHostType(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    
    if (hostname.endsWith("sibnet.ru")) return "sibnet";
    if (hostname.endsWith("sendvid.com") || hostname.includes("videos2.sendvid.com")) return "sendvid";
    if (hostname.endsWith("sandvid.com") || hostname.endsWith("sandvide.com")) return "sendvid";
    
    return "other";
  } catch {
    return "other";
  }
}

// Fonction pour résoudre un lien embed spécialisé
async function resolveEmbedLink(url, timeoutMs = 8000) {
  const hostType = detectHostType(url);
  
  console.log(`🔍 Résolution ${hostType} pour: ${url}`);
  
  try {
    switch (hostType) {
      case "sibnet": {
        const videoId = SibnetExtractor.extractVideoId(url);
        if (!videoId) {
          return { url, success: false, error: "ID vidéo Sibnet non extractible" };
        }
        
        const extractor = new SibnetExtractor();
        const directUrl = await Promise.race([
          extractor.getDirectLink(videoId),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Timeout")), timeoutMs)
          )
        ]);
        
        return {
          url,
          success: true,
          directUrl,
          type: "file",
          contentType: "video/mp4",
          hostType: "sibnet"
        };
      }
      
      case "sendvid": {
        const videoId = SendVidExtractor.extractVideoId(url);
        if (!videoId) {
          return { url, success: false, error: "ID vidéo SendVid non extractible" };
        }
        
        const extractor = new SendVidExtractor();
        const directUrl = await Promise.race([
          extractor.getDirectLink(videoId),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Timeout")), timeoutMs)
          )
        ]);
        
        return {
          url,
          success: true,
          directUrl,
          type: "file",
          contentType: "video/mp4",
          hostType: "sendvid"
        };
      }
      
      default:
        return {
          url,
          success: false,
          error: "Hébergeur non supporté",
          hostType: "other"
        };
    }
  } catch (error) {
    console.error(`❌ Erreur résolution ${hostType}:`, error.message);
    return {
      url,
      success: false,
      error: error.message,
      hostType
    };
  }
}

// Fonction principale de résolution avec vos extracteurs
async function resolveWithSpecialHosts(urls, options = {}) {
  const { perLinkTimeoutMs = 8000 } = options;
  
  console.log(`🚀 Résolution de ${urls.length} URLs avec extracteurs spécialisés`);
  
  const results = await Promise.allSettled(
    urls.map(url => resolveEmbedLink(url, perLinkTimeoutMs))
  );
  
  const resolved = results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    } else {
      return {
        url: urls[index],
        success: false,
        error: result.reason?.message || "Erreur inconnue",
        hostType: "unknown"
      };
    }
  });
  
  const successful = resolved.filter(r => r.success);
  const failed = resolved.filter(r => !r.success);
  
  console.log(`✅ Résolution terminée: ${successful.length}/${urls.length} succès`);
  
  if (failed.length > 0) {
    console.log(`❌ Échecs:`, failed.map(f => `${f.hostType}: ${f.error}`));
  }
  
  return resolved;
}

// Fonction pour normaliser les épisodes avec transfert des liens depuis meta
function normalizeEpisodesData(episodes, meta, lang) {
  if (!Array.isArray(episodes)) {
    return [];
  }

  console.log(
    `🔄 Normalisation de ${episodes.length} épisodes pour la langue ${lang}`
  );
  console.log(`📋 Meta disponible:`, meta ? Object.keys(meta) : "aucune");

  return episodes.map((ep, index) => {
    const episodeNum = index + 1;

    // Récupère les liens depuis meta si disponibles
    let sources = [];
    if (meta && meta[lang] && meta[lang][`episode_${episodeNum}`]) {
      const episodeUrls = meta[lang][`episode_${episodeNum}`];
      console.log(
        `📺 Episode ${episodeNum}: trouvé ${episodeUrls.length} lien(s)`
      );

      if (Array.isArray(episodeUrls)) {
        sources = episodeUrls.map((url) => ({
          type: "iframe",
          url: url,
        }));
      }
    } else {
      console.log(`⚠️ Episode ${episodeNum}: aucun lien trouvé dans meta`);
    }

    // Si c'est juste une string (format legacy)
    if (typeof ep === "string") {
      return {
        showTitle: "Episode",
        season: "1",
        number: episodeNum,
        title: ep,
        sources: sources,
        subtitles: [],
      };
    }

    // Si c'est déjà au bon format, on garde ses sources ou on utilise meta
    if (ep && typeof ep === "object") {
      return {
        showTitle: ep.showTitle || "Episode",
        season: String(ep.season || "1"),
        number: ep.number || episodeNum,
        title: ep.title || `Episode ${episodeNum}`,
        sources: ep.sources && ep.sources.length > 0 ? ep.sources : sources,
        subtitles: Array.isArray(ep.subtitles) ? ep.subtitles : [],
      };
    }

    // Format par défaut
    return {
      showTitle: "Episode",
      season: "1",
      number: episodeNum,
      title: `Episode ${episodeNum}`,
      sources: sources,
      subtitles: [],
    };
  });
}

// Fonction pour normaliser les données legacy vers le nouveau format
function normalizeDetailsData(data) {
  console.log(
    "🔄 Normalisation des données:",
    typeof data,
    Array.isArray(data)
  );

  // Si c'est un tableau, prendre le premier élément
  const item = Array.isArray(data) ? data[0] : data;

  if (!item) {
    throw new Error("Données vides ou invalides");
  }

  const lang = item.lang || item.langue || "VF";
  const meta = item.meta || {};

  console.log(`📋 Langue détectée: ${lang}`);
  console.log(`📋 Meta structure:`, Object.keys(meta));

  // Normaliser les champs legacy vers les nouveaux noms
  const normalized = {
    id: item.id || "unknown",
    title: item.title || item.titre || "Sans titre",
    lang: lang,
    season: String(item.season || item.saison || "1"),
    episodes: normalizeEpisodesData(item.episodes || [], meta, lang),
    updatedAt:
      item.updatedAt || item.date
        ? typeof item.updatedAt === "number"
          ? item.updatedAt
          : Date.now()
        : Date.now(),
    meta: meta,
  };

  console.log(
    `✅ Normalisation terminée: ${normalized.episodes.length} épisodes`
  );
  return normalized;
}

/* --- normalisations & variantes --- */
function normSeasonBase(param) {
  const s = String(param || "1").toLowerCase();
  if (s === "film") return "film";
  const m = s.match(/\d+/);
  return m ? m[0] : "1";
}
function normSeasonNumeric(param) {
  const base = normSeasonBase(param);
  return base === "film" ? "1" : base;
}
function normLang(param) {
  const s = String(param || "vf").toLowerCase();
  if (s === "vost") return "vostfr";
  return s;
}

function buildIdCandidates(slugRaw, seasonParam, langParam) {
  const slug = toId(slugRaw);
  const seasonBase = normSeasonBase(seasonParam);
  const seasonNum = normSeasonNumeric(seasonParam);
  const langNorm = normLang(langParam);

  const seasonVariants =
    seasonBase === "film"
      ? ["film", "1", "saison1", "season1"]
      : [seasonNum, `saison${seasonNum}`, `season${seasonNum}`];

  // Ajouter des variantes de langue avec différentes casses
  const langVariants = [];
  if (langNorm === "vostfr") {
    langVariants.push("vostfr", "vost", "VOSTFR", "VOST");
  } else {
    langVariants.push(langNorm, langNorm.toUpperCase());
  }

  // Générer des variantes de slug avec tirets ET underscores
  const slugVariants = [];
  const cleanSlug = slugRaw.toLowerCase();

  // Version originale
  slugVariants.push(slugRaw);

  // Version normalisée avec tirets
  slugVariants.push(toId(slugRaw));

  // Version avec underscores (pour compatibilité legacy)
  const underscoreSlug = cleanSlug
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/(^_|_$)/g, "");
  if (underscoreSlug && underscoreSlug !== toId(slugRaw)) {
    slugVariants.push(underscoreSlug);
  }

  // Supprimer les doublons
  const uniqueSlugs = [...new Set(slugVariants.filter(Boolean))];

  const ids = [];
  for (const s of uniqueSlugs) {
    for (const se of seasonVariants) {
      for (const la of langVariants) {
        ids.push(`${s}_${se}_${la}`);
      }
    }
  }

  return Array.from(new Set(ids));
}

/* ----------------- Routeur principal ----------------- */
export function createRouter({ dataDir, db }) {
  const router = express.Router();
  const detailsDir = path.resolve(dataDir, "details");
  const indexPath = path.resolve(dataDir, "animes.json");

  // Limiteur /api
  router.use(
    "/api/",
    rateLimit({
      windowMs: 60 * 1000,
      limit: Number(process.env.RATE_LIMIT_PER_MIN || 120),
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  function normalizeList(list) {
    return (Array.isArray(list) ? list : []).map((a, i) => ({
      id: toId(a.id || a.title || `anime-${i}`),
      title: a.title || "Sans titre",
      description: a.description || "",
      image: a.image || "",
      year: a.year || "",
      genres: Array.isArray(a.genres) ? a.genres : [],
      episodes: Array.isArray(a.episodes) ? a.episodes : [],
    }));
  }

  // Health
  router.get("/health", (_req, res) =>
    sendJson(res, null, { ok: true, status: "up" })
  );
//==========endpoint pour emed auto play=============
router.post("/api/resolver/autoplay-embed", async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: "URL manquante" });
  }
  
  console.log(`Autoplay embed demandé pour: ${url}`);
  
  try {
    const scriptPath = path.resolve(process.cwd(), 'scripts/autoplay_embed.py');
    const pythonPath = process.env.PYTHON_PATH || 'python3';
    
    const python = spawn(pythonPath, [scriptPath, url]);
    
    let stdout = '';
    let stderr = '';
    
    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    python.on('close', (code) => {
      if (code !== 0) {
        console.error('Erreur Python:', stderr);
        return res.status(500).json({ 
          error: 'Échec autoplay',
          details: stderr 
        });
      }
      
      try {
        const result = JSON.parse(stdout);
        res.json(result);
      } catch (e) {
        res.status(500).json({ 
          error: 'Réponse Python invalide',
          details: stdout 
        });
      }
    });
    
    // Timeout après 30 secondes
    setTimeout(() => {
      python.kill();
      res.status(504).json({ error: 'Timeout' });
    }, 30000);
    
  } catch (error) {
    console.error('Erreur autoplay-embed:', error);
    res.status(500).json({ error: error.message });
  }
});
  // =================== ENDPOINT RESOLVER MODIFIÉ ===================
  router.post("/api/resolver/resolve", async (req, res) => {
    try {
      const body = req.body || {};
      const urls = Array.isArray(body.urls) ? body.urls : [];
      const perLinkTimeoutMs = Number(body.perLinkTimeoutMs || 8000);
      const bypass = String(req.query.bypassCache || "0") === "1";
      const ua = req.headers["user-agent"] || "";
      const ttl = Number(process.env.RESOLVER_CACHE_TTL_S || 21600);
      const requestKey = makeRequestKey(urls, ua);

      console.log(`🔧 Resolver: ${urls.length} URLs à résoudre`);

      // Filtrer les URLs supportées
      const supportedUrls = urls.filter(url => {
        const hostType = detectHostType(url);
        return hostType === "sibnet" || hostType === "sendvid";
      });

      if (supportedUrls.length === 0) {
        return res.json({ 
          results: [],
          cache: "miss",
          message: "Aucune URL supportée (sibnet.ru/sendvid.com uniquement)"
        });
      }

      console.log(`✅ ${supportedUrls.length}/${urls.length} URLs supportées`);

      // 1) Tentative cache (si Mongo dispo & pas bypass)
      if (db && !bypass) {
        const col = db.collection(
          process.env.MONGO_COL_RESOLVER_CACHE || "resolver_cache"
        );
        const hit = await col.findOne(
          { requestKey },
          { projection: { _id: 0 } }
        );
        if (hit && Array.isArray(hit.results) && hit.results.length) {
          console.log("📦 Cache HIT");
          return res.json({ results: hit.results, cache: "hit" });
        }
      }

      // 2) Résolution avec scripts complets des extracteurs
      console.log("🚀 Démarrage résolution avec scripts complets...");
      const results = await Promise.allSettled(
        supportedUrls.map(url => executeExtractorScript(url, perLinkTimeoutMs))
      );

      const resolvedResults = results.map((result, index) => {
        if (result.status === "fulfilled") {
          return result.value;
        } else {
          return {
            url: supportedUrls[index],
            success: false,
            error: result.reason?.message || "Erreur inconnue",
            hostType: detectHostType(supportedUrls[index])
          };
        }
      });

      // 3) Enregistrer en cache (best effort)
      if (db && resolvedResults?.length) {
        const col = db.collection(
          process.env.MONGO_COL_RESOLVER_CACHE || "resolver_cache"
        );
        const now = new Date();
        const expireAt = new Date(now.getTime() + ttl * 1000);
        const doc = {
          requestKey,
          urls: [...new Set(supportedUrls)].sort(),
          results: resolvedResults,
          createdAt: now,
          expireAt,
          meta: {
            perLinkTimeoutMs,
            ua: ua.slice(0, 200),
            extractorVersion: "sibnet_sendvid_full_scripts_v1",
          },
        };
        await col
          .updateOne({ requestKey }, { $set: doc }, { upsert: true })
          .catch((e) => {
            console.warn("⚠️ Erreur sauvegarde cache:", e.message);
          });
      }

      const successful = resolvedResults.filter(r => r.success);
      console.log(`✅ Résolution terminée: ${successful.length}/${resolvedResults.length} succès`);

      return res.json({ 
        results: resolvedResults, 
        cache: "miss",
        stats: {
          total: urls.length,
          supported: supportedUrls.length,
          successful: successful.length
        }
      });
    } catch (e) {
      console.error("❌ Erreur /resolver/resolve:", e);
      res.status(500).json({ 
        error: "internal_error",
        message: e.message 
      });
    }
  });

// =================== FONCTION POUR EXÉCUTER LES SCRIPTS COMPLETS ===================
async function executeExtractorScript(fullUrl, timeoutMs = 8000) {
  const hostType = detectHostType(fullUrl);
  
  console.log(`🔍 Exécution script ${hostType} pour: ${fullUrl}`);
  
  try {
    switch (hostType) {
      case "sibnet": {
        // Exécuter le script Sibnet complet avec le fullUrl
        const SibnetExtractor = (await import("./playerGetSibnet.js")).default;
        const extractor = new SibnetExtractor();
        
        // Extraire l'ID depuis l'URL (comme dans le script main)
        const videoId = SibnetExtractor.extractVideoId(fullUrl);
        
        if (!videoId) {
          throw new Error('Impossible d\'extraire l\'ID de la vidéo depuis cette URL');
        }
        
        console.log(`📝 ID Sibnet extrait: ${videoId}`);
        
        // Exécuter la logique complète avec timeout
        const directLink = await Promise.race([
          (async () => {
            let directUrl;
            try {
              // Méthode principale
              directUrl = await extractor.getDirectLink(videoId);
            } catch (error) {
              console.log(`🔄 Sibnet: Tentative via page video principale...`);
              directUrl = await extractor.getVideoPageLink(videoId);
              
              if (!directUrl) {
                throw new Error('Impossible d\'extraire l\'URL par les deux méthodes');
              }
            }
            return directUrl;
          })(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Timeout")), timeoutMs)
          )
        ]);
        
        console.log(`🎉 Sibnet - URL directe: ${directLink}`);
        
        return {
          url: fullUrl,
          success: true,
          directUrl: directLink,
          type: "file",
          contentType: "video/mp4",
          hostType: "sibnet"
        };
      }
      
      case "sendvid": {
        // Exécuter le script SendVid complet avec le fullUrl
        const SendVidExtractor = (await import("./playerGetSendvid.js")).default;
        const extractor = new SendVidExtractor();
        
        // Extraire l'ID depuis l'URL (comme dans le script main)
        const videoId = SendVidExtractor.extractVideoId(fullUrl);
        
        if (!videoId) {
          throw new Error('Impossible d\'extraire l\'ID de la vidéo depuis cette URL');
        }
        
        console.log(`📝 ID SendVid extrait: ${videoId}`);
        
        // Exécuter la logique complète avec timeout
        const directLink = await Promise.race([
          (async () => {
            let directUrl;
            try {
              // Méthode principale
              directUrl = await extractor.getDirectLink(videoId);
            } catch (error) {
              console.log(`🔄 SendVid: Tentative via méthode embed...`);
              directUrl = await extractor.getEmbedLink(videoId);
              
              if (!directUrl) {
                throw new Error('Impossible d\'extraire l\'URL par les deux méthodes');
              }
            }
            return directUrl;
          })(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Timeout")), timeoutMs)
          )
        ]);
        
        console.log(`🎉 SendVid - URL directe: ${directLink}`);
        
        return {
          url: fullUrl,
          success: true,
          directUrl: directLink,
          type: "file",
          contentType: "video/mp4",
          hostType: "sendvid"
        };
      }
      
      default:
        return {
          url: fullUrl,
          success: false,
          error: "Hébergeur non supporté",
          hostType: "other"
        };
    }
  } catch (error) {
    console.error(`❌ Erreur script ${hostType}:`, error.message);
    return {
      url: fullUrl,
      success: false,
      error: error.message,
      hostType
    };
  }
}

  // Catalogue + recherche (ETag + 304) - INCHANGÉ
  router.get("/api/animes", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      const limit = Math.max(0, Math.min(1000, Number(req.query.limit || 0)));
      const offset = Math.max(0, Number(req.query.offset || 0));

      if (db) {
        const col = db.collection(process.env.MONGO_COL_ANIMES || "animes");
        const otherColName = process.env.MONGO_COL_LECTEUR || "lecteur";

        const match = { type: { $ne: "Scans" } };
        if (q) {
          match.$or = [
            { title: { $regex: q, $options: "i" } },
            { slug: { $regex: q, $options: "i" } },
          ];
        }

        const pipeline = [
          { $match: match },
          {
            $lookup: {
              from: otherColName,
              let: { s: "$slug" },
              pipeline: [{ $match: { $expr: { $eq: ["$slug", "$$s"] } } }],
              as: "animes",
            },
          },
          {
            $match: {
              animes: { $ne: [] },
            },
          },
          { $project: { _id: 0, lecteur_hit: 0 } },
          { $sort: { title: 1 } },
          { $skip: offset },
          ...(limit ? [{ $limit: limit }] : []),
        ];

        const docs = await col.aggregate(pipeline).toArray();
        return res.json(docs);
      }

      // Fallback fichier JSON
      const read = await fs.readFile(indexPath, "utf8");
      const base = normalizeList(JSON.parse(read));
      const filtered = (
        q
          ? base.filter(
              (x) =>
                (x.title || "").toLowerCase().includes(q.toLowerCase()) ||
                (x.slug || "").includes(q.toLowerCase())
            )
          : base
      ).filter((x) => x.type !== "Scans");
      const paged = limit ? filtered.slice(offset, offset + limit) : filtered;
      res.json(paged);
    } catch (e) {
      console.error("Erreur /api/animes:", e);
      res.status(500).json({ error: "internal_error" });
    }
  });

  // Endpoint détails - INCHANGÉ
  router.get(
    ["/api/anime/:slug/:season/:lang", "/api/anime/:slug/:season/:lang/*"],
    async (req, res) => {
      const slugRaw = req.params.slug;
      const seasonNum = normSeasonNumeric(req.params.season);
      const langNorm = normLang(req.params.lang);
      const slugCanon = toId(slugRaw);
      const canonicalId = `${slugCanon}`;
      const key = `details:${canonicalId}`;

      console.log(`🎯 Recherche de: ${canonicalId}`);

      try {
        // 1) Cache mémoire
        const hit = getMem(key);
        if (hit) {
          console.log("✅ Cache mémoire HIT");
          makeCacheHeaders(res, hit.etag);
          if (req.headers["if-none-match"] === hit.etag)
            return res.status(304).end();
          return res.json(hit.data);
        }

        // 2) Tentative MongoDB
        if (db) {
          const col = db.collection(
            process.env.MONGO_COL_DETAILS || "anime_details"
          );
          const doc = await col.findOne(
            {
              slug: slugCanon,
              season: Number(seasonNum),
              lang: { $regex: `^${langNorm}$`, $options: "i" },
            },
            { projection: { _id: 0 } }
          );

          if (doc) {
            console.log("✅ Données trouvées dans Mongo");
            const normalized = normalizeDetailsData(doc);
            const etag = setMem(key, normalized);
            makeCacheHeaders(res, etag);
            if (req.headers["if-none-match"] === etag) {
              return res.status(304).end();
            }
            return res.json(normalized);
          }
        }

        // 3) Fallback disque
        try {
          console.log(`📁 Lecture disque: ${canonicalId}`);
          const data = await readDetailsFromDisk(canonicalId);
          const normalized = normalizeDetailsData(data);
          
          if (!normalized.id || !normalized.title) {
            throw new Error("Données invalides: id et title requis");
          }

          console.log("✅ Données normalisées depuis disque");
          const etag = setMem(key, normalized);
          makeCacheHeaders(res, etag);
          if (req.headers["if-none-match"] === etag)
            return res.status(304).end();
          return res.json(normalized);
        } catch (e) {
          if (!e || e.code !== "ENOENT") {
            console.error("Erreur lecture canonique:", e.message);
          }

          // 4) Variantes héritées
          console.log("🔍 Recherche de variantes...");
          const candidates = buildIdCandidates(
            slugRaw,
            req.params.season,
            req.params.lang
          ).map((id) => path.join(detailsDir, `${id}.json`));

          const found = tryPaths(candidates);
          if (found.ok) {
            console.log(`✅ Fichier legacy trouvé: ${found.path}`);
            try {
              const normalized = normalizeDetailsData(found.data);
              if (!normalized.id || !normalized.title) {
                throw new Error("Données invalides: id et title requis");
              }

              const etag = setMem(key, normalized);
              makeCacheHeaders(res, etag, found.stat?.mtimeMs);
              if (req.headers["if-none-match"] === etag)
                return res.status(304).end();
              return res.json(normalized);
            } catch (parseError) {
              console.error("Erreur normalisation legacy:", parseError.message);
              return res.json(found.data);
            }
          }

          // 5) Rien trouvé
          console.log("❌ Aucun fichier trouvé");
          return res.status(404).json({
            error: "DETAILS_MISSING",
            id: canonicalId,
            searchedPaths: candidates.map((p) => path.basename(p)),
          });
        }
      } catch (err) {
        console.error("Erreur globale:", err);
        return res
          .status(500)
          .json({ error: "INTERNAL", details: err.message });
      }
    }
  );

  return router;
}