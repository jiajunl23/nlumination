// Tiny local writer for the LUT tour. Listens on 127.0.0.1:5555 and writes
// JPEG bodies to lut-tour/<idx>-<id>.jpg. Used by a browser-side loop that
// POSTs canvas snapshots after each __setLut call. Throwaway tool.
import { createServer } from "node:http";
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = "lut-tour";
mkdirSync(OUT, { recursive: true });

const seen = new Set();
let count = 0;

createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Filename",
    });
    res.end();
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end();
    return;
  }
  const filename = req.headers["x-filename"];
  if (!filename || typeof filename !== "string" || filename.includes("..") || filename.includes("/")) {
    res.writeHead(400);
    res.end("bad x-filename header");
    return;
  }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const buf = Buffer.concat(chunks);
    writeFileSync(`${OUT}/${filename}`, buf);
    if (!seen.has(filename)) {
      seen.add(filename);
      count++;
    }
    process.stdout.write(`[${count}] ${filename} ${buf.length}B\n`);
    res.writeHead(200, { "Access-Control-Allow-Origin": "*" });
    res.end("ok");
  });
}).listen(5555, "127.0.0.1", () => {
  console.log("lut-tour writer listening on 127.0.0.1:5555 → ./lut-tour/");
});
