import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "url";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
      console.log("Connecté à MongoDB",process.env.MONGO_URI);

  // data à la racine du projet, pas dans scripts/
  const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
  const indexPath = path.join(DATA_DIR, "animes.json");

  const txt = await fs.readFile(indexPath, "utf8");
  const list = JSON.parse(txt);

  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db(process.env.MONGO_DB_NAME);
  const col = db.collection(process.env.MONGO_COL_ANIMES || "animes");

  for (const item of list) {
    const doc = {
      slug: item.slug || item.id || "",
      title: item.title,
      image: item.image || "",
      genres: item.genres || [],
      year: item.year || null,
      ...item,
    };
    await col.updateOne({ slug: doc.slug }, { $set: doc }, { upsert: true });
  }
  console.log(`Import OK (${list.length} items)`);
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
