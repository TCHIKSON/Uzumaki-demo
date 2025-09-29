import fs from "fs";
import path from "path";

export function readJsonSafe(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    const data = JSON.parse(buf.toString("utf8"));
    const stat = fs.statSync(filePath);
    return { ok: true, data, stat };
  } catch (e) {
    return { ok: false, error: e };
  }
}

export function tryPaths(paths) {
  for (const p of paths) {
    const res = readJsonSafe(p);
    if (res.ok) return { ...res, path: p };
  }
  return { ok: false };
}
