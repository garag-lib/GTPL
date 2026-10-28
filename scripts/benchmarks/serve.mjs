import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs",
);
const isolated = process.argv.includes("--isolated");
const portIndex = process.argv.indexOf("--port");
const port = portIndex < 0 ? 4173 : Number(process.argv[portIndex + 1]);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Puerto inválido. Usa --port 4173.");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".ttf": "font/ttf",
};
const server = createServer(async (request, response) => {
  if (isolated) {
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  }
  response.setHeader("Cache-Control", "no-store");
  try {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    const filename = path.resolve(
      root,
      `.${pathname === "/" ? "/index.html" : pathname}`,
    );
    if (!filename.startsWith(root + path.sep)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    if (!(await stat(filename)).isFile()) throw new Error("Not a file");
    response.setHeader(
      "Content-Type",
      types[path.extname(filename)] ?? "application/octet-stream",
    );
    response.end(await readFile(filename));
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Benchmark Lab: http://127.0.0.1:${port}/benchmarks.html${isolated ? " (COOP/COEP activados)" : ""}`,
  ),
);
