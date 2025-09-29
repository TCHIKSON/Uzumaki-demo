// db/mongo.js (ESM)
import { MongoClient } from "mongodb";

let client;
let db;

export async function connectToMongo() {
  if (db) return db;
  const uri = process.env.MONGO_URI;
  const name = process.env.MONGO_DB_NAME;
  if (!uri || !name) {
    console.warn("[mongo] MONGO_URI/MONGO_DB_NAME non définis → mode disque");
    return null; // on laisse le fallback disque
  }
  client = new MongoClient(uri, { maxPoolSize: 10 });
  await client.connect();
  db = client.db(name);
  console.log(`[mongo] Connecté à ${name}`);

  // Index utiles (idempotents)
  await db.collection(process.env.MONGO_COL_ANIMES || "animes").createIndexes([
    { key: { title: "text", slug: 1 }, name: "title_text_slug_idx" },
  ]);
//await db.collection(process.env.MONGO_COL_DETAILS || "details").createIndexes([
  //{ key: { slug: 1, season: 1, lang: 1 }, name: "slug_season_lang_unique", unique: true },
  //{ key: { slug: 1 }, name: "by_slug" },
//])
await db.collection(process.env.MONGO_COL_BACKUPS || "backup_resolvers").createIndexes([
  { key: { slug: 1, season: 1, lang: 1, episode: 1 }, name: "by_show_season_lang_ep", unique: true },
  { key: { slug: 1 }, name: "by_slug" },
]);

await db.collection(process.env.MONGO_COL_RESOLVER_CACHE || "resolver_cache").createIndexes([
  { key: { requestKey: 1 }, name: "by_key", unique: true },
  // TTL basé sur un champ Date par document → expiration variable
  { key: { expireAt: 1 }, name: "ttl", expireAfterSeconds: 0 },
]);

  return db;
}

export function getDb() {
  return db || null;
}

export async function closeMongo() {
  if (client) await client.close();
}
