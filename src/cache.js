// src/cache.js
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const mem = new Map(); // key -> { ts, data, etag }
const TTL_MS = Number(process.env.DETAILS_TTL_MS || 6 * 60 * 60 * 1000); // 6h par défaut
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DETAILS_DIR = path.join(DATA_DIR, 'details');


function toEtag(bufOrStr) {
  const buf = Buffer.isBuffer(bufOrStr)
    ? bufOrStr
    : Buffer.from(
        typeof bufOrStr === "string" ? bufOrStr : JSON.stringify(bufOrStr)
      );
  const hash = crypto.createHash("sha1").update(buf).digest("base64url");
  return `"W/${hash}"`; // weak etag OK pour JSON
}

export function getMem(key) {
  const hit = mem.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > TTL_MS) {
    mem.delete(key);
    return null;
  }
  return hit;
}

export function setMem(key, data) {
  const etag = toEtag(data);
  mem.set(key, { ts: Date.now(), data, etag });
  return etag;
}

export async function readDetailsFromDisk(id) {
  const file = path.join(DETAILS_DIR, `${id}.json`);
  const raw = await fs.readFile(file, "utf8");
  const txt = raw.replace(/^\uFEFF/, "").trim(); // strip BOM
  try {
    return JSON.parse(txt);
  } catch (err) {
    const e = new Error(`JSON_PARSE_ERROR in ${file}: ${err.message}`);
    e.code = "JSON_PARSE_ERROR";
    e.file = file;
    throw e;
  }
}

export function makeCacheHeaders(res, etag, lastModified) {
  res.setHeader("ETag", etag);
  if (lastModified)
    res.setHeader("Last-Modified", new Date(lastModified).toUTCString());
  // SWR pour résilience côté client
  res.setHeader(
    "Cache-Control",
    "public, max-age=300, stale-while-revalidate=86400"
  );
}
