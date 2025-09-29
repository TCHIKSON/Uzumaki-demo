// resolver.mjs optimisé — Express + Parser HTML léger (sans Puppeteer)
import express from "express";
import cors from "cors";
import { request } from "undici";

const PORT = process.env.PORT || 8787;
const VIDEO_REGEX = /\.(mp4|m4v|webm|ogv|mov|m3u8|ts)(\?.+)?$/i;

// Cache intelligent pour éviter de re-parser les mêmes URLs
const parseCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const BLOCKED_HOSTS = [
  /(?:^|\.)yandex\.ru$/i,
  /(?:^|\.)yastatic\.net$/i,
  /(?:^|\.)adriver\.ru$/i,
  /(?:^|\.)betweendigital\.com$/i,
  /(?:^|\.)googlesyndication\.com$/i,
  /(?:^|\.)googletagmanager\.com$/i,
];

function isBlocked(urlStr) {
  try {
    const h = new URL(urlStr).hostname;
    return BLOCKED_HOSTS.some((rx) => rx.test(h));
  } catch {
    return false;
  }
}

// Classement qualité: mp4 > webm > mov > m3u8 > ts
function rankExt(u = "") {
  const p = u.toLowerCase();
  if (p.includes(".mp4")) return 0;
  if (p.includes(".webm")) return 1;
  if (p.includes(".mov")) return 2;
  if (p.includes(".m3u8")) return 3;
  if (p.includes(".ts")) return 4;
  return 9;
}

// Détection améliorée des timestamps/tokens
const EXPIRY_PATTERNS = [
  /(?:^|[?&#])(e|exp|expires|expiry|validto|ttl)=\d{9,13}(?:$|[&#])/i,
  /(?:^|[?&#])token[^=]*=([A-Za-z0-9_-]{8,})(?:$|[&#])/i,
  /(?:^|[?&#])(auth|signature|key)=([A-Za-z0-9_-]{8,})(?:$|[&#])/i,
  /(?:^|[?&#])st=[A-Za-z0-9_-]+&e=\d{9,13}(?:$|[&#])/i,
  /(?:^|[?&#])(X-Amz-Expires|X-Amz-Signature)=/i,
];

function hasExpiryParam(u = "") {
  return EXPIRY_PATTERNS.some((rx) => rx.test(u));
}

function getHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function refererFor(u) {
  try {
    const { protocol, hostname } = new URL(u);
    return `${protocol}//${hostname}/`;
  } catch {
    return undefined;
  }
}

// Extracteurs spécifiques par hébergeur (BEAUCOUP plus rapide que Puppeteer)
const HOST_EXTRACTORS = {
  'sibnet.ru': {
    patterns: [
      /(?:file|source|src)\s*[:=]\s*["']([^"']+\.(?:mp4|m3u8)[^"']*e=\d+[^"']*)/gi,
      /player\.src\s*=\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)/gi,
      /video_url\s*[:=]\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)/gi,
    ]
  },
  
  'vidmoly.net': {
    patterns: [
      /(?:file|source)\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4)[^"']*token[^"']*)/gi,
      /playlist\s*[:=]\s*["']([^"']+\.m3u8[^"']*)/gi,
      /src\s*[:=]\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)/gi,
    ]
  },
  
  'smoothpre.com': {
    patterns: [
      /(?:file|source)\s*[:=]\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)/gi,
      /video\s*[:=]\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)/gi,
    ]
  },
  
  'sendvid.com': {
    patterns: [
      /(?:file|source|src)\s*[:=]\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)/gi,
      /video_url\s*[:=]\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)/gi,
    ]
  },
  
  'doodstream.com': {
    patterns: [
      /\$\.get\(['"]([^'"]+\.mp4[^'"]*)['"]/gi,
      /src\s*[:=]\s*["']([^"']+\.mp4[^"']*)/gi,
    ]
  },
  
  'streamtape.com': {
    patterns: [
      /(?:document\.getElementById\('norobotlink'\)\.innerHTML\s*=\s*['"][^'"]*|robotlink\s*=\s*['"])([^'"]+\.mp4[^'"]*)/gi,
      /src\s*[:=]\s*["']([^"']+\.mp4[^"']*)/gi,
    ]
  },

  // Extracteur générique pour nouveaux hébergeurs
  'generic': {
    patterns: [
      /(?:file|source|src|video_url|stream_url)\s*[:=]\s*["']([^"']+\.(?:mp4|m3u8|webm)[^"']*)/gi,
      /player\.src\(['"]([^'"]+\.(?:mp4|m3u8)[^'"]*)/gi,
      /videojs\(['"][^'"]*['"],\s*{[^}]*src:\s*['"]([^'"]+\.(?:mp4|m3u8)[^'"]*)/gi,
    ]
  }
};

// Parser HTML ultra-rapide (remplace Puppeteer)
async function parseEmbedHTML(url, timeoutMs = 3000) {
  const cacheKey = `parse_${url}`;
  const cached = parseCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await request(url, {
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
        "referer": refererFor(url) || url,
      },
      signal: controller.signal,
      maxRedirections: 3,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.body) return [];
    
    const html = await response.body.text();
    const hostname = getHostname(url);
    
    // Sélectionne l'extracteur approprié
    const extractor = HOST_EXTRACTORS[hostname] || HOST_EXTRACTORS['generic'];
    const found = new Set();
    
    // Applique tous les patterns de l'extracteur
    for (const pattern of extractor.patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const videoUrl = match[1];
        if (videoUrl && !isBlocked(videoUrl)) {
          // Résout les URLs relatives
          try {
            const absolute = new URL(videoUrl, url).toString();
            found.add(absolute);
          } catch {
            // Si c'est déjà absolu
            if (videoUrl.startsWith('http')) {
              found.add(videoUrl);
            }
          }
        }
      }
    }
    
    const results = Array.from(found);
    
    // Cache le résultat
    parseCache.set(cacheKey, {
      data: results,
      timestamp: Date.now()
    });
    
    return results;
    
  } catch (error) {
    console.warn(`[PARSER] Erreur pour ${url}:`, error.message);
    return [];
  }
}

// Test de connectivité d'une URL
async function probeUrl(u) {
  try {
    const ref = refererFor(u);
    const { statusCode } = await request(u, {
      method: "HEAD",
      headers: {
        ...(ref ? { referer: ref } : {}),
        "user-agent": "Mozilla/5.0 (compatible; VideoBot/1.0)"
      },
      maxRedirections: 0,
      timeout: 5000,
    });
    return statusCode;
  } catch {
    return 0;
  }
}

// Convertit en lien jouable (direct ou proxifié)
async function makePlayableLink(u) {
  const sc = await probeUrl(u);
  if (sc === 200 || sc === 206 || sc === 302) {
    return u; // Direct OK
  }
  // Sinon proxy pour contourner les restrictions
  return `/stream?u=${encodeURIComponent(u)}`;
}

// Résolution optimisée d'un embed
async function resolveFromEmbed(url, perLinkTimeoutMs = 1000) {
  try {
    const videoUrls = await parseEmbedHTML(url, perLinkTimeoutMs);
    
    const results = [];
    for (const videoUrl of videoUrls) {
      if (isBlocked(videoUrl)) continue;
      
      // Teste la qualité/accessibilité
      const playableUrl = await makePlayableLink(videoUrl);
      
      results.push({
        url: playableUrl,
        originalUrl: videoUrl,
        mimeType: videoUrl.includes('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp4',
        status: 200,
        embedSource: url
      });
    }
    
    return results;
    
  } catch (error) {
    console.warn(`[RESOLVER] Erreur embed ${url}:`, error.message);
    return [];
  }
}

// Filtre et trie les résultats
function filterAndRank(found = []) {
  // Déduplication par URL
  const dedup = Array.from(new Map(found.map((x) => [x.url, x])).values());

  // Filtre : garde seulement les vidéos valides
  const kept = dedup.filter((x) => {
    if (isBlocked(x.url)) return false;
    
    const mt = (x.mimeType || "").toLowerCase();
    const byUrl = VIDEO_REGEX.test(x.url) || /m3u8/i.test(x.url);
    const byType = mt.includes("video/") || mt.includes("mpegurl") || mt.includes("octet-stream");
    
    return byUrl || byType;
  });

  // Priorise les liens avec timestamp/token
  const withExpiry = kept.filter((x) => hasExpiryParam(x.url));
  const withoutExpiry = kept.filter((x) => !hasExpiryParam(x.url));
  
  // Si on a des liens avec expiry, on privilégie ceux-là
  const pool = withExpiry.length > 0 ? withExpiry : kept;

  // Tri final : qualité + type + présence d'expiry
  return pool.sort((a, b) => {
    // 1. Priorise les liens avec expiry
    const expiryA = hasExpiryParam(a.url) ? 0 : 1;
    const expiryB = hasExpiryParam(b.url) ? 0 : 1;
    if (expiryA !== expiryB) return expiryA - expiryB;
    
    // 2. Priorise par type de fichier
    const rankA = rankExt(a.url);
    const rankB = rankExt(b.url);
    if (rankA !== rankB) return rankA - rankB;
    
    // 3. Priorise les qualités plus élevées
    const qualityA = (a.url.match(/(\d{3,4})p/) || ['', '720'])[1];
    const qualityB = (b.url.match(/(\d{3,4})p/) || ['', '720'])[1];
    return parseInt(qualityB) - parseInt(qualityA);
  });
}

// Résolution multiple avec concurrence limitée
async function resolveMany(urls = [], perLinkTimeoutMs = 1000) {
  const concurrency = Math.min(5, urls.length || 1); // Augmenté à 5 (vs 3 avant)
  const queue = [...urls];
  const results = [];

  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      if (!url) continue;
      
      try {
        const resolved = await resolveFromEmbed(url, perLinkTimeoutMs);
        results.push(...resolved);
      } catch (error) {
        console.warn(`[WORKER] Erreur résolution ${url}:`, error.message);
      }
    }
  }

  // Lance les workers en parallèle
  await Promise.all(
    Array.from({ length: concurrency }, () => worker())
  );

  // Filtre et trie les résultats
  const filtered = filterAndRank(results);
  
  return filtered;
}

// Nettoyage périodique du cache
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of parseCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      parseCache.delete(key);
    }
  }
}, 5 * 60 * 1000); // Toutes les 5 minutes

// --- Serveur HTTP ---
const app = express();
app.use(cors());
app.use(express.json({ limit: "256kb" }));

// Middleware de logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Route proxy streaming (identique mais avec headers améliorés)
app.get("/stream", async (req, res) => {
  try {
    const target = req.query.u;
    if (!target) return res.status(400).send("Parameter 'u' required");
    
    const ref = refererFor(target);
    const upstream = await request(target, {
      method: "GET",
      headers: {
        ...(ref ? { referer: ref } : {}),
        "user-agent": "Mozilla/5.0 (compatible; VideoBot/1.0)",
        "accept": "*/*",
        "accept-encoding": "identity", // Évite la compression pour le streaming
        ...(req.headers.range ? { range: req.headers.range } : {}),
      },
      maxRedirections: 5,
    });

    // Copie les headers essentiels
    const headers = upstream.headers;
    if (headers["content-type"]) res.setHeader("content-type", headers["content-type"]);
    if (headers["content-length"]) res.setHeader("content-length", headers["content-length"]);
    if (headers["accept-ranges"]) res.setHeader("accept-ranges", headers["accept-ranges"]);
    if (headers["content-range"]) res.setHeader("content-range", headers["content-range"]);
    
    // CORS pour les players
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-headers", "range");

    res.status(upstream.statusCode);
    upstream.body.pipe(res);
    
  } catch (error) {
    console.error("[PROXY] Erreur:", error.message);
    res.status(502).send("Upstream error");
  }
});

// Route principale de résolution
app.post("/resolve", async (req, res) => {
  try {
    const {
      episodeId = null,
      urls = [],
      perLinkTimeoutMs = 1000,
    } = req.body || {};

    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: "Parameter 'urls' (array) required" });
    }

    console.log(`[RESOLVE] Episode: ${episodeId}, URLs: ${urls.length}, Timeout: ${perLinkTimeoutMs}ms`);
    
    const startTime = Date.now();
    const links = await resolveMany(urls, Math.min(perLinkTimeoutMs, 3000));
    const duration = Date.now() - startTime;
    
    console.log(`[RESOLVE] Résolu ${links.length} liens en ${duration}ms`);
    
    res.json({ 
      episodeId, 
      links,
      meta: {
        resolvedCount: links.length,
        inputCount: urls.length,
        durationMs: duration,
        cacheSize: parseCache.size
      }
    });
    
  } catch (error) {
    console.error("[RESOLVE] Erreur:", error);
    res.status(500).json({ 
      error: error.message || "Internal server error",
      episodeId: req.body?.episodeId || null 
    });
  }
});

// Route de statut et debug
app.get("/status", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    cacheSize: parseCache.size,
    memory: process.memoryUsage(),
    extractors: Object.keys(HOST_EXTRACTORS).length
  });
});

// Nettoyage au démarrage
parseCache.clear();

app.listen(PORT, () => {
  console.log(`[RESOLVER] 🚀 Serveur optimisé sur http://localhost:${PORT}`);
  console.log(`[RESOLVER] 📈 Extracteurs disponibles: ${Object.keys(HOST_EXTRACTORS).join(', ')}`);
})