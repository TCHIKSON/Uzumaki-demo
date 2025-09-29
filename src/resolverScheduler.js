// resolverScheduler.js
// Programme un run toutes les 4h et expose un POST /internal/run-resolver
// pour déclenchement manuel. Lance backup_resolve_anime.py pour chaque .json trouvé.

import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import cron from "node-cron";
import { globSync } from "glob";

/**
 * @param {import('express').Express} app
 * @param {{
 *   pythonPath?: string,              // ex: "python" ou "C:\\Python312\\python.exe"
 *   resolverScript: string,           // chemin absolu vers backup_resolve_anime.py
 *   inputDir: string,                 // dossier contenant les .json à résoudre
 *   cronExpr?: string,                // par défaut: "0 *4 * * *" (toutes les 4h)
 *   secret?: string                   // token simple pour sécuriser l’endpoint
 * }} opts
 */
export function attachResolverScheduler(app, opts) {
  const pythonPath   = opts.pythonPath || "python";
  const resolverPath = path.resolve(opts.resolverScript);
  const inputDir     = path.resolve(opts.inputDir);
  const cronExpr     = opts.cronExpr || "0 */4 * * *";
  const secret       = opts.secret || "";

  if (!fs.existsSync(resolverPath)) {
    throw new Error(`backup_resolve_anime.py introuvable: ${resolverPath}`);
  }
  if (!fs.existsSync(inputDir)) {
    throw new Error(`inputDir introuvable: ${inputDir}`);
  }

  async function runOne(file) {
    return new Promise((resolve) => {
      const args = [resolverPath, file];
      const cp = spawn(pythonPath, args, { shell: false,cwd: path.dirname(resolverPath), });
      let stdout = "", stderr = "";
      cp.stdout.on("data", d => stdout += d.toString());
      cp.stderr.on("data", d => stderr += d.toString());
      cp.on("close", code => {
        resolve({ file, code, ok: code === 0, stdout, stderr });
      });
    });
  }

  async function runAll() {
    const files = globSync(path.join(inputDir, "*.json"));
    const results = [];
    // séquentiel (plus sûr pour éviter d’ouvrir trop d’onglets/playwright d’un coup)
    for (const f of files) {
      /* eslint-disable no-await-in-loop */
      const r = await runOne(f);
      console.log(`[resolver] ${path.basename(f)} -> code=${r.code}`);
      results.push({ file: f, code: r.code, ok: r.ok });
    }
    return results;
  }

  // Endpoint interne pour déclenchement manuel (optionnel)
  app.post("/internal/run-resolver", async (req, res) => {
    if (secret) {
      const got = req.headers["x-cron-secret"];
      if (got !== secret) return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    try {
      const results = await runAll();
      return res.json({ ok: results.every(r => r.ok), ran: results.length, results });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // Planification toutes les 4h
  cron.schedule(cronExpr, async () => {
    try {
      console.log(`[resolver] CRON ${cronExpr} → runAll()`);
      await runAll();
    } catch (e) {
      console.error("[resolver] cron error:", e);
    }
  }, { timezone: "Europe/Paris" });

  console.log(`[resolver] prêt. Cron: "${cronExpr}" | inputDir=${inputDir}`);
}

//module.exports = { attachResolverScheduler };
