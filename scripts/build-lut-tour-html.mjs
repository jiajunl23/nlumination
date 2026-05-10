// Build lut-tour/index.html from the screenshots + manifest metadata.
// Mirrors the same sort order used by the browser loop (bundle+category+id).
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/luts/manifest.json", "utf8"));
const luts = manifest.luts
  .map((l) => ({
    id: l.id,
    bundle: l.bundle,
    category: l.category,
    description: l.description ?? "",
    tags: (l.tags ?? []).slice(0, 6),
    license: l.license ?? "",
    sourceFilename: l.sourceFilename ?? "",
  }))
  .sort((a, b) =>
    (a.bundle + a.category + a.id).localeCompare(b.bundle + b.category + b.id),
  );

const files = new Set(readdirSync("lut-tour"));

const baselineExists = files.has("000-baseline.jpg");
const cards = luts
  .map((l, i) => {
    const idx = String(i + 1).padStart(3, "0");
    const fname = `${idx}-${l.id}.jpg`;
    if (!files.has(fname)) return "";
    const tagsHtml = l.tags
      .map((t) => `<span class="tag">${t}</span>`)
      .join("");
    return `
<article class="card">
  <img loading="lazy" src="${fname}" alt="${l.id}" />
  <div class="meta">
    <div class="row1"><span class="num">${idx}</span><code class="id">${l.id}</code></div>
    <div class="row2"><span class="bundle ${l.bundle}">${l.bundle}</span><span class="cat">${l.category}</span></div>
    <p class="desc">${l.description}</p>
    <div class="tags">${tagsHtml}</div>
  </div>
</article>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>LUT tour — 137 LUTs on LUT_test.JPEG</title>
<style>
  body { margin: 0; font: 14px/1.45 system-ui, -apple-system, sans-serif; background: #0e0e10; color: #e9e9ea; }
  header { padding: 24px; border-bottom: 1px solid #222; position: sticky; top: 0; background: #0e0e10cc; backdrop-filter: blur(8px); z-index: 5; }
  header h1 { margin: 0 0 6px; font-size: 18px; font-weight: 600; }
  header p { margin: 0; color: #8e8e93; font-size: 13px; }
  .legend { margin-top: 10px; display: flex; gap: 8px; font-size: 12px; }
  .legend .pill { padding: 3px 8px; border-radius: 99px; background: #1c1c1f; color: #9c9c9f; }
  .baseline { display: grid; place-items: center; padding: 20px; border-bottom: 1px solid #222; }
  .baseline img { max-width: 320px; border-radius: 8px; border: 1px solid #2a2a2e; }
  .baseline span { margin-top: 8px; color: #8e8e93; font-size: 12px; }
  main { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; padding: 20px; }
  .card { background: #16161a; border: 1px solid #232328; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
  .card img { width: 100%; height: auto; display: block; aspect-ratio: 1010/757; object-fit: cover; background: #000; }
  .meta { padding: 10px 12px 12px; }
  .row1 { display: flex; gap: 8px; align-items: baseline; }
  .num { color: #6e6e72; font-variant-numeric: tabular-nums; font-size: 12px; }
  .id { font-size: 11px; color: #c9c9cc; word-break: break-all; }
  .row2 { display: flex; gap: 6px; margin: 6px 0; font-size: 11px; }
  .bundle { padding: 2px 6px; border-radius: 4px; font-weight: 600; }
  .bundle.mit { background: #19311c; color: #6cd483; }
  .bundle.cc-by-sa { background: #2d2419; color: #d4b16c; }
  .cat { padding: 2px 6px; border-radius: 4px; background: #1c1c20; color: #9c9c9f; }
  .desc { margin: 6px 0 8px; color: #b6b6b9; font-size: 12px; min-height: 32px; }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .tag { padding: 2px 6px; border-radius: 4px; background: #1c1c20; color: #7a7a7f; font-size: 10.5px; }
</style>
</head>
<body>
<header>
  <h1>LUT tour — 137 LUTs applied to LUT_test.JPEG @ opacity 1.0</h1>
  <p>Generated from public/luts/manifest.json. Sort: bundle → category → id.</p>
  <div class="legend">
    <span class="pill">mit = t3mujinpack (51)</span>
    <span class="pill">cc-by-sa = RawTherapee Film Simulation (86)</span>
    <span class="pill">cards: ${luts.length}</span>
  </div>
</header>
${baselineExists ? `<section class="baseline"><div><img src="000-baseline.jpg" alt="baseline"/><div><span>baseline · LUT off</span></div></div></section>` : ""}
<main>
${cards}
</main>
</body>
</html>
`;

writeFileSync("lut-tour/index.html", html);
console.log(`wrote lut-tour/index.html — ${luts.length} cards`);
