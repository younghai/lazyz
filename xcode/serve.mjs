/**
 * 정적 서버 — 의존성 0개.
 *
 *   /          → 제품 소개
 *   /status    → 상태 페이지
 *   /plan      → 포크 이행 계획
 */

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname);
const PORT = Number(process.env.PORT ?? 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
};

const ALIASES = {
  "/": "/web/index.html",
  "/status": "/STATUS.html",
  "/plan": "/08-검토/포크-이행-계획.md",
};


createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let path = decodeURIComponent(url.pathname);

  path = ALIASES[path === "/" ? "/" : path.replace(/\/$/, "")] ?? path;

  // 루트 밖으로 나가는 경로는 거절한다.
  const target = join(ROOT, normalize(path));
  if (!target.startsWith(ROOT) || !existsSync(target) || !statSync(target).isFile()) {
    res.writeHead(404, { "content-type": TYPES[".html"] });
    res.end(`<!doctype html><meta charset="utf-8"><p>없다: ${path}</p><p><a href="/">목록</a></p>`);
    return;
  }

  res.writeHead(200, {
    "content-type": TYPES[extname(target)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(target).pipe(res);
}).listen(PORT, () => {
  process.stdout.write(`xcode 로컬 서버 → http://localhost:${PORT}\n`);
});
