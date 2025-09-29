// src/resolverEndpoints.js
import express from "express";
import cors from "cors";
import puppeteer from "puppeteer";
import { request } from "undici";
import crypto from "node:crypto";

// Extensions vidéo reconnues ( HLS)
const VIDEO_REGEX = /\.(mp4|m4v|webm|ogv|mov|m3u8|ts)(\?.)?$/i;

// Classement formats (préférence)
function rankExt(u = "") {
  const p = u.toLowerCase();
  if (p.endsWith(".mp4")) return 0;
  if (p.endsWith(".webm")) return 1;
  if (p.endsWith(".mov")) return 2;
  if (p.endsWith(".m3u8")) return 3;
  if (p.endsWith(".ts")) return 4;
  return 9;
}

// Heuristique “timestamp/expiry” (e=, exp=, etc.)
const EXPIRY_PATTERNS = [
  /(?:^|[?&#])(e|exp|expires|expiry)=\d{9,13}(?:$|[&#])/i,
  /(?:^|[?&#])token_expires=\d{9,13}(?:$|[&#])/i,
  /(?:^|[?&#])st=[A-Za-z0-9_-]&e=\d{9,13}(?:$|[&#])/i,
];
function hasExpiryParam(u = "") { return EXPIRY_PATTERNS.some(rx => rx.test(u)); }

// (Optionnel) Bloqueurs simples de pubs/analytics
const BLOCKED_HOSTS = [
  /(?:^|\.)yandex\.ru$/i,
  /(?:^|\.)yastatic\.net$/i,
  /(?:^|\.)adriver\.ru$/i,
  /(?:^|\.)betweendigital\.com$/i,
];
function isBlocked(urlStr) {
  try { return BLOCKED_HOSTS.some(rx => rx.test(new URL(urlStr).hostname)); }
  catch { return false; }
}

let browserPromise;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox","--disable-setuid-sandbox","--autoplay-policy=no-user-gesture-required"],
    });
  }
  return browserPromise;
}

function refererFor(u) {
  try { return `${new URL(u).origin}/`; }
  catch { return undefined; }
}

async function probeUrl(u) {
  try {
    const ref = refererFor(u);
    const { statusCode } = await request(u, {
      method: "HEAD",
      headers: ref ? { referer: ref, "user-agent": "Mozilla/5.0" }
                   : { "user-agent": "Mozilla/5.0" },
      maxRedirections: 0,
    });
    return statusCode;
  } catch { return 0; }
}

async function makePlayableLink(u) {
  const sc = await probeUrl(u);
  // direct si accessible
  if (sc === 200 || sc === 206) return u;
  // sinon propose le proxy local (rajoute Referer)
  return `/resolver/stream?u=${encodeURIComponent(u)}`;
}

function filterAndRank(found = []) {
  // dédup
  const dedup = Array.from(new Map(found.map(x => [x.url, x])).values());
  // ne garder que les “semblent vidéo/HLS/3xx”
  const kept = dedup.filter(x => {
    if (isBlocked(x.url)) return false;
    const mt = (x.mimeType || "").toLowerCase();
    const byUrl = VIDEO_REGEX.test(x.url) || /m3u8/i.test(x.url);
    const byType =
      mt.startsWith("video/") ||
      mt.includes("application/vnd.apple.mpegurl") ||
      mt.includes("application/x-mpegurl") ||
      mt.includes("mpegurl") ||
      (mt.includes("octet-stream") && /m3u8|mpegurl/i.test(x.url));
    const is3xx = x.status >= 300 && x.status < 400;
    return byUrl || byType || is3xx;
  });

  // liens avec timestamp en priorité
  const withExp = kept.filter(x => hasExpiryParam(x.url));
  const pool = withExp.length ? withExp : kept;

  // tri 3xx > timestamp > extension
  return pool.sort((a, b) => {
    const ra = (a.status >= 300 && a.status < 400) ? 0 : 1;
    const rb = (b.status >= 300 && b.status < 400) ? 0 : 1;
    if (ra !== rb) return ra - rb;
    const ta = hasExpiryParam(a.url) ? 0 : 1;
    const tb = hasExpiryParam(b.url) ? 0 : 1;
    if (ta !== tb) return ta - tb;
    return rankExt(a.url) - rankExt(b.url);
  });
}

async function resolveFromEmbed(url, perLinkTimeoutMs = 2500) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  const found = [];
  const seen = new Set();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  );

  const ref = refererFor(url);
  if (ref) await page.setExtraHTTPHeaders({ "accept-language": "fr-FR,fr;q=0.9,en;q=0.8", referer: ref });

  // bloque ressources inutiles
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    try {
      const rt = req.resourceType();
      if (rt === "image" || rt === "font" || rt === "stylesheet" || rt === "other") return req.abort();
      return req.continue();
    } catch { try { req.continue(); } catch {} }
  });

  page.on("response", async (resp) => {
    try {
      const rurl = resp.url();
      if (isBlocked(rurl) || seen.has(rurl)) return;
      const headers = resp.headers();
      const ctype = (headers["content-type"] || "").toLowerCase();
      const status = resp.status();

      // suit les redirections pour capter la vraie URL signée
      if (status >= 300 && status < 400) {
        const loc = headers["location"];
        if (loc) {
          try {
            const abs = new URL(loc, rurl).toString();
            if (!seen.has(abs)) {
              seen.add(abs);
              found.push({ url: abs, mimeType: "unknown", status });
            }
          } catch {}
        }
      }

      const byUrl = VIDEO_REGEX.test(rurl) || /m3u8/i.test(rurl);
      const byType =
        ctype.startsWith("video/") ||
        ctype.includes("application/vnd.apple.mpegurl") ||
        ctype.includes("application/x-mpegurl") ||
        ctype.includes("mpegurl") ||
        (ctype.includes("octet-stream") && /m3u8|mpegurl/i.test(rurl));

      if (!(byUrl || byType || (status >= 300 && status < 400))) return;

      // si petit, on tente de confirmer HLS
      try {
        const buf = await resp.buffer();
        if (buf && buf.length < 512 * 1024 && /#EXTM3U/i.test(buf.toString("utf8"))) {
          // confirmé HLS (info)
        }
      } catch {}

      seen.add(rurl);
      found.push({ url: rurl, mimeType: ctype || "unknown", status });
    } catch {}
  });

  try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 }); } catch {}
  try { await page.mouse.click(10, 10); } catch {}

  // essaie aussi dans les iframes de déclencher jwplayer/plyr/<video>
  for (const fr of page.frames()) {
    try {
      await fr.evaluate(() => {
        const v = document.querySelector("video");
        if (v) { v.muted = true; v.play().catch(() => {}); }
        document.documentElement.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    } catch {}
    try {
      const pl = await fr.evaluate(() => {
        const out = [];
        try {
          // @ts-ignore jwplayer
          if (typeof jwplayer === "function") {
            // @ts-ignore
            const p = jwplayer();
            if (p && p.getPlaylist) {
              for (const it of (p.getPlaylist() || [])) {
                const f = it?.file || it?.sources?.[0]?.file;
                if (f) out.push(f);
              }
            }
          }
        } catch {}
        try {
          const v = document.querySelector("video");
          if (v) {
            const srcs = Array.from(v.querySelectorAll("source")).map(n=>n.src).filter(Boolean);
            out.push(v.currentSrc, v.src, ...srcs);
          }
        } catch {}
        return Array.from(new Set(out.filter(Boolean)));
      });
      if (Array.isArray(pl)) {
        for (const u of pl) if (!seen.has(u)) { seen.add(u); found.push({ url: u, mimeType: "unknown", status: 200 }); }
      }
    } catch {}
  }

  // laisse le temps aux requêtes réseau de partir
  await new Promise(r => setTimeout(r, perLinkTimeoutMs));
  try { await page.close(); } catch {}

  const ranked = filterAndRank(found);

  // transforme en liens jouables (directs ou proxifiés)
  const playable = [];
  for (const it of ranked) {
    if (isBlocked(it.url)) continue;
    playable.push({ ...it, url: await makePlayableLink(it.url) });
  }
  // dédup finale
  return Array.from(new Map(playable.map(x => [x.url, x])).values());
}

async function resolveMany(urls = [], perLinkTimeoutMs = 2500) {
  const queue = urls.slice();
  const results = [];
  const workers = Math.min(3, queue.length || 1);

  async function worker() {
    while (queue.length) {
      const u = queue.shift();
      try { results.push(...(await resolveFromEmbed(u, perLinkTimeoutMs))); }
      catch {}
    }
  }
  await Promise.all(Array.from({ length: workers }, () => worker()));
  // tri final
  return Array.from(new Map(results.map(x => [x.url, x])).values())
              .sort((a,b) => rankExt(a.url) - rankExt(b.url));
}

export function createResolverRouter() {
  const router = express.Router();
  router.use(cors());
  router.use(express.json({ limit: "256kb" }));

  // proxy de flux (ajoute Referer)
  router.get("/stream", async (req, res) => {
    try {
      const target = req.query.u;
      if (!target) return res.status(400).send("u required");
      const ref = refererFor(target);
      const upstream = await request(target, {
        method: "GET",
        headers: { ...(ref ? { referer: ref } : {}), "user-agent": "Mozilla/5.0" },
        maxRedirections: 5,
      });
      const h = upstream.headers;
      if (h["content-type"])  res.setHeader("content-type",  h["content-type"]);
      if (h["content-length"])res.setHeader("content-length",h["content-length"]);
      if (h["accept-ranges"]) res.setHeader("accept-ranges", h["accept-ranges"]);
      if (h["content-range"]) res.setHeader("content-range", h["content-range"]);
      res.status(upstream.statusCode);
      upstream.body.pipe(res);
    } catch { res.status(502).send("Bad upstream"); }
  });

  // résolution d’embed(s)
  router.post("/resolve", async (req, res) => {
    try {
      const { episodeId = null, urls = [], perLinkTimeoutMs = 2500 } = req.body || {};
      if (!Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: "urls[] required" });
      }
      const links = await resolveMany(urls, perLinkTimeoutMs);
      res.json({ episodeId, links });
    } catch (e) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  return router;
}
function makeRequestKey(urls, ua = "") {
  const uniq = [...new Set((urls || []).filter(Boolean))].sort();
  const payload = JSON.stringify({ urls: uniq, ua, v: process.env.RESOLVER_PARSER_VERSION || 1 });
  return crypto.createHash("sha1").update(payload).digest("hex");
}

