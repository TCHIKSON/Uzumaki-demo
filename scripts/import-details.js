// scripts/import-details.js
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "url";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });
function normSeason(s) {
  const v = String(s || "").toLowerCase();
  if (["film","movie","special"].includes(v)) return 1;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
function normLang(l) {
  const v = String(l || "").toLowerCase();
  if (["vf","fr","francais"].includes(v)) return "vf";
  return "vostfr";
}

async function main() {
  const DATA_DIR_DETAILS= process.env.DATA_DIR_DETAILS || path.join(process.cwd(), "data/details");
  const detailsDir = path.join(DATA_DIR_DETAILS, "/details");

  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db(process.env.MONGO_DB_NAME);
  const col = db.collection(process.env.MONGO_COL_DETAILS || "details");

  const files = await fs.readdir(detailsDir);
  let count = 0;

  for (const f of files) {
    if (!f.endsWith(".json")) continue;

    // exemples acceptés: slug_1_vostfr.json | slug-1-vf.json | slug_1_FR.json
    const base = f.replace(/\.json$/i, "");
    const parts = base.split(/[_-]/g);
    if (parts.length < 3) {
      console.warn("Nom inattendu, ignoré:", f);
      continue;
    }
    const lang = normLang(parts.pop());
    const season = normSeason(parts.pop());
    const slug = parts.join("-");

    try {
      const txt = await fs.readFile(path.join(detailsDir, f), "utf8");
      const json = JSON.parse(txt);

      const doc = {
        slug,
        season,
        lang,
        title: json.title || `${slug} - S${season} ${lang.toUpperCase()}`,
        episodes: json.episodes || [],
        updatedAt: Math.floor(Date.now() / 1000),
        // copie champs utiles si présents:
        ...Object.fromEntries(
          Object.entries(json).filter(([k]) => !["episodes"].includes(k))
        ),
      };

      await col.updateOne(
        { slug, season, lang },
        { $set: doc },
        { upsert: true }
      );
      count++;
    } catch (e) {
      console.error("Erreur import", f, e.message);
    }
  }

  console.log(`Import details OK (${count} fiches)`);
  await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
