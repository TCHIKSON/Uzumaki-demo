// scripts/import-backups.js
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "url";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });
function normLang(l) {
  const v = String(l || "").toLowerCase();
  return ["vf","fr","francais"].includes(v) ? "vf" : "vostfr";
}

async function main() {
  const DATA_DIR_BACKUP = process.env.DATA_DIR_BACKUP || path.join(process.cwd(), "data");
  const dir = path.join(DATA_DIR_BACKUP, "/BackupResolver");

  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db(process.env.MONGO_DB_NAME);
  const col = db.collection(process.env.MONGO_COL_BACKUPS || "backup_resolvers");

  const files = await fs.readdir(dir);
  let count = 0;

  for (const f of files) {
    if (!f.endsWith(".json")) continue;

    const filePath = path.join(dir, f);
    try {
      const txt = await fs.readFile(filePath, "utf8");
      const json = JSON.parse(txt);

      // Plusieurs formats possibles : on essaie de normaliser
      // Formats acceptés (exemples):
      // { slug, season, lang, episode, urls: [...] }
      // { show: slug, s: 1, l: "vf", ep: 3, url: "https://..." }
      // { slug, season, lang, episodes: { "1": ["..."], "2": ["..."] } }

      if (Array.isArray(json)) {
        // liste d'entrées unitaires
        for (const item of json) {
          await upsert(col, normalize(item));
          count++;
        }
      } else if (json.episodes && typeof json.episodes === "object") {
        // mapping episode -> urls
        const slug = json.slug || json.show || "";
        const season = Number(json.season ?? json.s ?? 1) || 1;
        const lang = normLang(json.lang ?? json.l ?? "vostfr");
        for (const [epStr, urlsMaybe] of Object.entries(json.episodes)) {
          const episode = Number(epStr);
          const urls = Array.isArray(urlsMaybe) ? urlsMaybe : [urlsMaybe].filter(Boolean);
          await upsert(col, { slug, season, lang, episode, urls });
          count++;
        }
      } else {
        // entrée unitaire
        await upsert(col, normalize(json));
        count++;
      }
    } catch (e) {
      console.error("Import backup KO:", f, e.message);
    }
  }

  console.log(`Import backups OK (${count} entrées)`);
  await client.close();
}

function normalize(item) {
  const slug = item.slug || item.show || "";
  const season = Number(item.season ?? item.s ?? 1) || 1;
  const lang = normLang(item.lang ?? item.l ?? "vostfr");
  const episode = Number(item.episode ?? item.ep ?? item.e ?? 1) || 1;
  let urls = item.urls;
  if (!Array.isArray(urls)) urls = [item.url || item.link].filter(Boolean);
  urls = (urls || []).filter(Boolean);
  return { slug, season, lang, episode, urls };
}

async function upsert(col, { slug, season, lang, episode, urls }) {
  if (!slug || !urls?.length) return;
  await col.updateOne(
    { slug, season, lang, episode },
    { $set: { slug, season, lang, episode, urls } },
    { upsert: true }
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
