import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
const root = join(import.meta.dirname, "..", "examples");
const types = { ".html": "text/html", ".svg": "image/svg+xml", ".json": "application/json" };
createServer(async (req, res) => {
  try {
    const p = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname.replace(/^\/$/, "/gallery.html")));
    const body = await readFile(p);
    res.writeHead(200, { "content-type": types[extname(p)] ?? "text/plain", "cache-control": "no-store" }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(4377);
