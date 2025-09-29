// src/health.js
import fs from 'node:fs/promises';
import path from 'node:path';

export async function healthCheck() {
  const base = path.join(process.cwd(), 'data');
  const detailsDir = path.join(base, 'details');
  const statBase = await fs.stat(base);
  await fs.mkdir(detailsDir, { recursive: true });
  const list = await fs.readdir(detailsDir);
  return {
    ok: true,
    dataDirMtime: statBase.mtimeMs,
    detailsCount: list.length
  };
}
