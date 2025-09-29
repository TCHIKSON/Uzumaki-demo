// src/index.js
import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import path from "node:path";
import fssync from "node:fs"; // ⬅️ sync API
import fs from "node:fs/promises"; // ⬅️ promises API
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

import { MongoClient } from "mongodb";
import { createRouter } from "./routes.js";
import { connectToMongo } from "./db/mongo.js";
import { logger } from "./logger.js";
import { healthCheck } from "./health.js";
import { createAdminRouter } from "./admin.js";
import {attachResolverScheduler}  from "./resolverScheduler.js";
import { createResolverRouter } from "./resolverEndpoints.js";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(
  process.env.DATA_DIR || path.join(__dirname, "../data")
);

// Assure l’existence des dossiers nécessaires
fssync.mkdirSync(path.join(DATA_DIR, "details"), { recursive: true });

const app = express();
app.disable("x-powered-by");

// -------------
// Helmet  CSP
// -------------
app.use(
  helmet({
    crossOriginEmbedderPolicy: false, // utile pour iframes / players
  })
);

// ⚠️ Tant que ton gros <script> inline est dans ton HTML, on garde 'unsafe-inline'.
// Quand tu auras externalisé tout le JS, tu pourras l’enlever.
app.use(
  helmet.contentSecurityPolicy({
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "https:", "blob:"],
      "media-src": ["'self'", "https:", "http:", "blob:"],
      "connect-src": ["'self'", "https:", "http:"], // API  segments en dev
      "frame-src": ["'self'", "https:", "http:"], // fallback iframe
      "worker-src": ["'self'"],
      "frame-ancestors": ["'none'"], // anti clickjacking
    },
  })
);

attachResolverScheduler(app, {
  pythonPath: process.env.PYTHON_PATH || "python",
  resolverScript: process.env.RESOLVER_SCRIPT ||path.resolve(__dirname, "../ingestion/backup_resolve_anime.py"),
  inputDir: process.env.INPUT_DIR || path.resolve(DATA_DIR, "details"), // là où sont tes .json d’animes
  cronExpr: "0 */4 * * *", // toutes les 4 heures
  secret: process.env.CRON_SECRET || "change-me"
});

// -------------
// CORS
// -------------
/*const ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// En dev, autorise vite fait 127.0.0.1:5500 si rien n’est défini
if (!ORIGINS.length && process.env.NODE_ENV !== "production") {
  ORIGINS.push("http://127.0.0.1:5500", "http://localhost:5500");
}

const corsOptions = {
  origin: (origin, cb) => {
    // Autorise aussi les requêtes sans Origin (curl/Postman)
    if (!origin) return cb(null, true);
    return cb(null, ORIGINS.includes(origin));
  },
  credentials: false,
  methods: ["GET", "HEAD", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Accept", "If-None-Match"],
  exposedHeaders: ["ETag"],
};*/
const anyCors = cors({
  origin: "*", // <-- renvoie toujours Access-Control-Allow-Origin: *
  credentials: false,
  methods: ["GET", "HEAD", "OPTIONS","POST"],
  allowedHeaders: ["Content-Type", "Accept", "If-None-Match"],
  exposedHeaders: ["ETag"],
  maxAge: 86400,
});

// prévol (OPTIONS) pour toutes les routes
app.options("*", anyCors);

// et CORS sur toutes les réponses
app.use(anyCors);

// Ceinture  bretelles : on pose quand même l'entête au cas où
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// -------------
// Middlewares
// -------------
app.use(compression());
app.use(express.json({ limit: "1mb" }));

// Petit logger maison (remplace morgan)
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    logger.info({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      ms: Date.now() - start,
    });
  });
  next();
});

// -------------
// Statique
// -------------
// Assets app (player.css, /vendor, /js/player.js, …)
app.use(
  express.static(path.join(process.cwd(), "public"), {
    etag: true,
    maxAge: "1h",
  })
);

//app.use("/resolver", createResolverRouter());

// Fichiers de données (SWR  ETag)
app.use(
  "/data",
  express.static(DATA_DIR, {
    etag: true,
    maxAge: "1h",
    setHeaders: (res) => {
      res.setHeader(
        "Cache-Control",
        "public, max-age=3600, stale-while-revalidate=86400"
      );
    },
  })
);
app.use("/api/admin", createAdminRouter({ dataDir: DATA_DIR }));
// -------------
// Healthcheck
// -------------
app.get("/health", async (_req, res) => {
  try {
    const h = await healthCheck();
    res.json(h);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// -------------
// Routes API
// -------------
const db = await connectToMongo()
app.use("/", createRouter({ dataDir: DATA_DIR ,db}));

// --------- BACKUP RESOLVE: /api/backup-link ---------



// -------------
// 404 JSON
// -------------
app.use((req, res) =>
  res.status(404).json({ error: true, message: "Not Found" })
);

// -------------
// Start
// -------------
app.listen(PORT, "0.0.0.0", () => {
  logger.info({ msg: `[api] listening on http://localhost:${PORT}` });
  logger.info({ msg: `[api] data dir: ${DATA_DIR}` });
  logger.info({ msg: `[api] try: GET /animes.json` });
  logger.info({ msg: `[api] try: GET /api/animes?q=clev&limit=5` });
});
