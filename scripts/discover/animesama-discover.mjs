// scripts/discover-anime-sama.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { discoverCatalog } from "./providers/anime-sama.mjs";

const PAGES = Number(
  process.env.DISCOVER_PAGES ||
    process.argv.find((a) => a.startsWith("--pages="))?.split("=")[1] ||
    2
);
const LANGS = (
  process.env.DISCOVER_LANGS ||
  process.argv.find((a) => a.startsWith("--langs="))?.split("=")[1] ||
  "vf,vostfr"
)
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const OUT = path.join(process.cwd(), "data", "warmup.json");

async function run() {
  const entries = await discoverCatalog({ pages: PAGES, langs: LANGS });
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(entries, null, 2), "utf8");
  console.log(`Écrit ${entries.length} entrées → ${OUT}`);
}

run().catch((e) => (console.error(e), process.exit(1)));
