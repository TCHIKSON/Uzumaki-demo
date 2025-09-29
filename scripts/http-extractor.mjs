import { load as loadHTML } from "cheerio";
import { fetch } from "undici";
import pRetry from "p-retry";
import { extractSeasonFromAnimeSama } from "./providers/anime-sama.mjs";

const UA =
  process.env.SCRAPER_UA ||
  "Mozilla/5.0 (SmartTVApp) AppleWebKit/537.36 Chrome/121 Safari/537.36";
const hlsRe = /https?:\/\/[^\s"'<>]+\.m3u8(?:\?[^\s"'<>]*)?/gi;
const dashRe = /https?:\/\/[^\s"'<>]+\.mpd(?:\?[^\s"'<>]*)?/gi;
const iframeRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
const vttRe = /https?:\/\/[^\s"'<>]+\.vtt(?:\?[^\s"'<>]*)?/gi;

async function get(url) {
  return pRetry(
    async () => {
      const res = await fetch(url, {
        headers: { "user-agent": UA, "accept-language": "fr,en;q=0.8" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
    { retries: 3, factor: 1.8, minTimeout: 400 }
  );
}

export async function extractDetailsFromPage({
  url,
  slug,
  season = "1",
  lang = "fr",
  showTitle,
}) {
  try {
    const u = new URL(url);
    if (
      u.hostname.endsWith("anime-sama.fr") ||
      u.hostname.endsWith("www.anime-sama.fr")
    ) {
      return extractSeasonFromAnimeSama({ url, slug, season, lang, showTitle });
    }
  } catch {}

  const html = await get(url);
  const $ = loadHTML(html);
  // scripts inline
  const scripts = $("script:not([src])")
    .map((i, el) => $(el).text())
    .get()
    .join("\n");
  const text = `${html}\n${scripts}`;

  const hls = [...new Set(text.match(hlsRe) || [])].map((url) => ({
    type: "hls",
    url,
  }));
  const dash = [...new Set(text.match(dashRe) || [])].map((url) => ({
    type: "dash",
    url,
  }));
  const subtitles = [...new Set(text.match(vttRe) || [])].map((url) => ({
    label: "Français",
    lang: "fr",
    url,
  }));
  const iframes = [];
  let m;
  while ((m = iframeRe.exec(html)) !== null)
    iframes.push({ type: "iframe", url: m[1] });
  const sources = [...hls, ...dash, ...iframes];

  const episode = {
    showTitle: showTitle || slug,
    season,
    number: 1,
    title: "Épisode 1",
    sources: sources.length ? sources : [{ type: "iframe", url }],
    subtitles,
  };

  return {
    id: `${slug}_${season}_${lang}`,
    title: showTitle || slug,
    lang,
    season,
    episodes: [episode],
    updatedAt: Date.now(),
    meta: {
      sourceUrl: url,
      counts: {
        hls: hls.length,
        dash: dash.length,
        iframes: iframes.length,
        subs: subtitles.length,
      },
    },
  };
}
