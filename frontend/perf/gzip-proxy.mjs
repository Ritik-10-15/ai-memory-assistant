// Local stand-in for production's Caddy `encode gzip`: forwards
// 127.0.0.1:5080 → 127.0.0.1:5000 and gzips text responses, so local page
// loads transfer the same compressed bytes as the deployed site.
//   node perf/gzip-proxy.mjs
import http from "node:http";
import zlib from "node:zlib";

const TARGET = { host: "127.0.0.1", port: 5000 };
const PORT = Number(process.env.PROXY_PORT ?? 5080);
const COMPRESSIBLE = /^(text\/|application\/(json|javascript)|image\/svg)/;

http
  .createServer((req, res) => {
    const upstream = http.request(
      { ...TARGET, method: req.method, path: req.url, headers: { ...req.headers, host: `${TARGET.host}:${TARGET.port}` } },
      (up) => {
        const type = String(up.headers["content-type"] ?? "");
        const gzip = /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? "")) && COMPRESSIBLE.test(type);
        const headers = { ...up.headers };
        if (gzip) {
          delete headers["content-length"];
          headers["content-encoding"] = "gzip";
          headers.vary = "Accept-Encoding";
        }
        res.writeHead(up.statusCode ?? 502, headers);
        (gzip ? up.pipe(zlib.createGzip({ flush: zlib.constants.Z_SYNC_FLUSH })) : up).pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  })
  .listen(PORT, "127.0.0.1", () => console.log(`gzip proxy on http://127.0.0.1:${PORT}`));
