import crypto from "crypto";

export function withCacheHeaders(res, stat, body) {
  if (stat) {
    res.set("Last-Modified", stat.mtime.toUTCString());
  }
  const etag = crypto
    .createHash("md5")
    .update(JSON.stringify(body))
    .digest("hex");
  res.set("ETag", etag);
}

export function sendJson(res, stat, body, status = 200) {
  withCacheHeaders(res, stat, body);
  res.status(status).json(body);
}
