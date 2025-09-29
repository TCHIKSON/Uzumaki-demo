import fssync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DATA_DIR   = process.env.DATA_DIR || "/app/data";
const SEED_DIR   = path.join(process.cwd(), "seed-data"); // là où on a copié avec Dockerfile

async function seedIfEmpty() {
  if (!fssync.existsSync(DATA_DIR)) fssync.mkdirSync(DATA_DIR, { recursive: true });

  const entries = await fs.readdir(DATA_DIR);
  if (entries.length > 0) return; // déjà peuplé

  if (!fssync.existsSync(SEED_DIR)) return; // rien à seeder
  console.log(`[seed] Seeding data from ${SEED_DIR} to ${DATA_DIR} ...`);

  // copie récursive simple
  async function copyDir(src, dst) {
    await fs.mkdir(dst, { recursive: true });
    const items = await fs.readdir(src, { withFileTypes: true });
    for (const it of items) {
      const s = path.join(src, it.name);
      const d = path.join(dst, it.name);
      if (it.isDirectory()) await copyDir(s, d);
      else await fs.copyFile(s, d);
    }
  }

  await copyDir(SEED_DIR, DATA_DIR);
  console.log(`[seed] Done.`);
}

(async () => {
  try {
    await seedIfEmpty();
  } catch (e) {
    console.error("[seed] error:", e);
  }

  // démarre l’API
  const child = spawn("node", ["src/index.js"], { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 1));
})();
