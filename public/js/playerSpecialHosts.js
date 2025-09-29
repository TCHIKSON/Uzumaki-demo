// playerSpecialHosts.js
function typeFromUrl(url = "") {
  const u = url.toLowerCase();
  if (u.endsWith(".m3u8")) return "hls";
  if (u.endsWith(".mpd"))  return "dash";
  return "file";
}

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); }
  catch { return ""; }
}

/**
 * Essaie de transformer un embed spécial (sibnet/sendvid/sandvide)
 * en URL directe lisible par <video>.
 * Retour: { type: 'file'|'hls'|'dash', url: string } | null
 */
export async function resolveSpecialHost(embedUrl) {
  const host = hostOf(embedUrl);

  // --- SIBNET ---
  if (host.endsWith("sibnet.ru")) {
    try {
      const mod = await import("./playerGetSibnet.js");
      const SibnetExtractor = mod.default || mod.SibnetExtractor;
      const extractId = mod.extractFromUrl || (u => SibnetExtractor.extractVideoId(u));
      const extractor = new SibnetExtractor();
      const videoId   = await extractId(embedUrl);
      const directUrl = await extractor.getDirectLink(videoId);
      if (directUrl) return { type: typeFromUrl(directUrl), url: directUrl };
    } catch (e) {
      console.warn("[SpecialHosts] Sibnet: extraction échouée (CORS possible)", e);
    }
  }

  // --- SENDVID / SANDVIDE ---
  if (host.endsWith("sendvid.com") || host.includes("videos2.sendvid.com") || host.endsWith("sandvide.com")) {
    try {
      const mod = await import("./playerGetSendvid.js");
      const fn = mod.extractFromUrl || mod.getDirectLink || mod.default;
      if (typeof fn === "function") {
        const directUrl = await fn(embedUrl);
        if (directUrl) return { type: typeFromUrl(directUrl), url: directUrl };
      }
    } catch (e) {
      console.warn("[SpecialHosts] Sendvid: extraction échouée (CORS possible)", e);
    }
  }

  return null;
}
