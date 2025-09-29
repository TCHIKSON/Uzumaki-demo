import fs from "node:fs/promises";
import path from "node:path";

const tpl = process.env.WARMUP_URL_TEMPLATE || "";
if (!tpl) {
  console.error("WARMUP_URL_TEMPLATE manquant");
  process.exit(1);
}

const file = path.join(process.cwd(), "data", "warmup.json");
const list = JSON.parse(await fs.readFile(file, "utf8"));
let count = 0;

for (const item of list) {
  if (item.url && item.url.trim()) continue;
  item.url = tpl
    .replaceAll("{slug}", item.slug)
    .replaceAll("{season}", item.season)
    .replaceAll("{lang}", item.lang);
  count++;
}
await fs.writeFile(file, JSON.stringify(list, null, 2), "utf8");
console.log(`Mise à jour: ${count} url(s) ajoutée(s) dans warmup.json`);
