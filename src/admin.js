// src/admin.js
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import express from "express";
import multer from "multer";

const upload = multer({ dest: "/tmp" });

export function createAdminRouter({ dataDir }) {
  const router = express.Router();

  // simple anti flood (optionnel)
  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  // Auth middleware
  router.use((req, res, next) => {
    const auth = req.headers["authorization"] || "";
    const ok = auth === `Bearer ${process.env.ADMIN_TOKEN}`;
    if (!ok) return res.status(401).json({ error: "unauthorized" });
    next();
  });

  /**
   * POST /api/admin/push
   * Form-data:
   *  - files: (input multiple) un ou plusieurs fichiers JSON
   *  - dests: (facultatif) même nombre d’items que files, chemins relatifs (ex: "details/slug_1_vostfr.json")
   *  - overwrite: "1" pour écraser (par défaut oui)
   */
  router.post("/push", upload.array("files", 50), async (req, res) => {
    try {
      const overwrite = String(req.body.overwrite ?? "1") === "1";
      const dests = Array.isArray(req.body.dests)
        ? req.body.dests
        : (req.body.dests ? [req.body.dests] : []);

      if (!req.files?.length) {
        return res.status(400).json({ error: "no_files" });
      }

      const results = [];
      for (let i = 0; i < req.files.length; i++) {
        const f = req.files[i];
        // destination : si fournie dans dests[i], sinon on garde le nom fourni par le client
        const fileName = dests[i] || f.originalname;
        const safeRel = fileName.replace(/^\/*/, ""); // strip leading slashes
        const outAbs = path.join(dataDir, safeRel);

        // empêche de sortir de DATA_DIR
        const outDir = path.dirname(outAbs);
        if (!outAbs.startsWith(path.resolve(dataDir))) {
          results.push({ file: f.originalname, status: "rejected:bad_path" });
          continue;
        }

        // must be .json
        if (!/\.json$/i.test(outAbs)) {
          results.push({ file: f.originalname, status: "rejected:not_json" });
          continue;
        }

        // parse pour valider
        const raw = await fs.readFile(f.path, "utf8");
        try { JSON.parse(raw); } catch (e) {
          results.push({ file: f.originalname, status: "rejected:invalid_json", msg: e.message });
          continue;
        }

        // mkdir + write
        await fs.mkdir(outDir, { recursive: true });

        if (!overwrite && fsSync.existsSync(outAbs)) {
          results.push({ file: f.originalname, status: "skipped:exists" });
        } else {
          await fs.writeFile(outAbs, raw, "utf8");
          results.push({ file: f.originalname, status: "ok", dest: path.relative(dataDir, outAbs) });
        }
      }

      return res.json({ ok: true, results });
    } catch (e) {
      return res.status(500).json({ error: "internal", message: e.message });
    }
  });

  return router;
}
