// scripts/validate-details.mjs
import fs from "node:fs/promises";
import path from "node:path";

const dir = path.join(process.cwd(), "data", "details");

const stripBOM = (s) => s.replace(/^\uFEFF/, "");

async function run() {
  let files;
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch (e) {
    console.error("Details dir introuvable:", dir, e.message);
    process.exit(1);
  }

  let bad = 0;
  for (const f of files) {
    const p = path.join(dir, f);
    try {
      const raw = await fs.readFile(p, "utf8");
      const txt = stripBOM(raw).trim();
      JSON.parse(txt);
    } catch (e) {
      bad++;
      console.error(`INVALID ${f} -> ${e.message}`);
    }
  }
  console.log(`Checked ${files.length} files — invalid: ${bad}`);
  if (bad > 0) process.exit(2);
}
run();
