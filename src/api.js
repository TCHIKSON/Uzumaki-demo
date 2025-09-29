// api.js
// === CONFIG ===
// Mets ici ton endpoint public (https://tonapp.fly.dev)
const PROD_BASE = "https://uzumaki.fly.dev";

// En dev, si tu ouvres le fichier en local, on garde PROD.
// Si un jour tu lances ton API en local, change ici.
export const API_BASE =
  typeof window !== "undefined" ? PROD_BASE : PROD_BASE;

// Helpers
export const urlCatalogue = () => `${API_BASE}/animes.json`;

// Normalise le slug pour la route API (tirets) vs noms de fichiers (underscores)
export const toRouteSlug = (slug) =>
  String(slug || "").trim().toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/(^-|-$)/g, "");

// Langue route
export const toRouteLang = (l) => {
  const s = String(l || "vostfr").toLowerCase();
  if (s.includes("vost")) return "vostfr";
  if (s === "vf") return "vf";
  return "vostfr";
};

// Saison route (numérique; “film” => 1)
export const toRouteSeason = (v) => {
  const s = String(v ?? "1").toLowerCase();
  if (s === "film") return "1";
  const m = s.match(/\d+/);
  return m ? m[0] : "1";
};

export const urlDetails = (slug, season, lang) =>
  `${API_BASE}/api/anime/${toRouteSlug(slug)}/${toRouteSeason(season)}/${toRouteLang(lang)}`;
