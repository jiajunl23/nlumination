/**
 * Build the LUT library shipped at public/luts/.
 *
 *   pnpm tsx scripts/build-luts.ts
 *
 * Pipeline: source HaldCLUT-12 PNGs (1728×1728 = 144³ effective LUT)
 * → ImageMagick Lanczos resample → HaldCLUT-6 PNG (216×216 = 36³).
 *
 * 36³ is comfortably above the 33³ resolution Lightroom and DaVinci
 * sliders use, well below the 65³ point at which storage cost stops
 * paying for itself, and matches the Hald 6 layout natively (no off-grid
 * interpolation artefacts).
 *
 * Sources (verified license; see LUTS_LICENCE.md for full attribution):
 *   • t3mujinpack — MIT (João Almeida, 2017). Film stock simulations.
 *     https://github.com/t3mujinpack/t3mujinpack
 *   • RawTherapee Film Simulation Collection (cherry-picked subset)
 *     — CC BY-SA 4.0 (Pat David, Pavlov Dmitry, Michael Ezra, 2015).
 *     https://rawpedia.rawtherapee.com/Film_Simulation
 *
 * The CC BY-SA bundle goes to public/luts/cc-by-sa/ — kept physically
 * separate from MIT bundle so the ShareAlike scope is unambiguous.
 *
 * Re-run idempotent: overwrites any existing PNG under public/luts/.
 */
import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, basename } from "node:path";

// ── Source paths (cloned to /tmp during research; see LUTS_LICENCE.md) ──
const SRC_T3MUJIN = "/tmp/lut-research/t3mujinpack/haldcluts";
const SRC_RAWTHERAPEE = "/tmp/lut-research/hald-clut/HaldCLUT/Film Simulation";

const DEST_ROOT = "public/luts";
const DEST_MIT = join(DEST_ROOT, "mit");
const DEST_CCBYSA = join(DEST_ROOT, "cc-by-sa");

// Hald level 6 is 6²×6² = 36×36 layout = 216×216 pixels = 36³ effective LUT.
const TARGET_PX = 216;

// ── Manifest entry shape (also re-exported as type for downstream RAG) ──

type Category =
  | "film-color-negative"
  | "film-color-slide"
  | "film-bw"
  | "instant-color"
  | "instant-bw"
  | "creative-cinematic"
  | "creative-mood"
  | "creative-vintage"
  | "creative-other"
  | "lomography"
  | "anchor";

interface LutEntry {
  /** URL-safe stable id; use as both filename and lookup key. */
  id: string;
  /** Path under /public for the deployed app. */
  filename: string;
  /** Source bundle for license routing. */
  bundle: "mit" | "cc-by-sa";
  /** SPDX license id. */
  license: "MIT" | "CC-BY-SA-4.0";
  /** Short attribution string suitable for inline credits. */
  attribution: string;
  source: "t3mujinpack" | "rawtherapee-film-simulation";
  sourceUrl: string;
  /** Original filename (preserves film-stock + push/pull notation). */
  sourceFilename: string;
  /** High-level look category for UI grouping + RAG pre-filter. */
  category: Category;
  /** Coarse style tags for keyword search. RAG embedding goes on description. */
  tags: string[];
  /** One-sentence prose description. Generated; can be improved later. */
  description: string;
  /** Optional film-stock identifier. */
  filmStock?: string;
  /** RT push/pull notation: "--" | "-" | "" | "+" | "++". */
  pushPull?: string;
}

// ── Cherry-pick lists ──────────────────────────────────────────────────

/**
 * RT Film Simulation cherry-pick. We take everything in:
 *   - CreativePack-1 (33; the only "creative look" pack in the corpus)
 *   - Polaroid Color (sample of 15)
 *   - Polaroid B&W (5)
 *   - Lomography (2)
 *   - Rollei B&W (4 = all)
 *   - Agfa B&W (2 = all)
 *   - Agfa Color (3 = all)
 *   - Push/pull/faded variants from Fuji + Kodak that complement t3mujin
 *
 * t3mujinpack already covers the canonical Fuji/Kodak "normal" film
 * stocks at MIT — so RT's contribution is the *creative looks* and the
 * stock variants t3mujin doesn't ship.
 */
const RT_CHERRYPICK: ReadonlyArray<string> = [
  // CreativePack-1 — 33 creative looks (cinematic, mood, vintage, pastel)
  "Color/CreativePack-1/Anime.png",
  "Color/CreativePack-1/BleachBypass1.png",
  "Color/CreativePack-1/BleachBypass2.png",
  "Color/CreativePack-1/BleachBypass3.png",
  "Color/CreativePack-1/BleachBypass4.png",
  "Color/CreativePack-1/CandleLight.png",
  "Color/CreativePack-1/ColorNegative.png",
  "Color/CreativePack-1/CrispWarm.png",
  "Color/CreativePack-1/CrispWinter.png",
  "Color/CreativePack-1/DropBlues.png",
  "Color/CreativePack-1/EdgyEmber.png",
  "Color/CreativePack-1/FallColors.png",
  "Color/CreativePack-1/FoggyNight.png",
  "Color/CreativePack-1/FuturisticBleak1.png",
  "Color/CreativePack-1/FuturisticBleak2.png",
  "Color/CreativePack-1/FuturisticBleak3.png",
  "Color/CreativePack-1/FuturisticBleak4.png",
  "Color/CreativePack-1/HorrorBlue.png",
  "Color/CreativePack-1/LateSunset.png",
  "Color/CreativePack-1/Moonlight.png",
  "Color/CreativePack-1/NightFromDay.png",
  "Color/CreativePack-1/RedBlueYellow.png",
  "Color/CreativePack-1/Smokey.png",
  "Color/CreativePack-1/SoftWarming.png",
  "Color/CreativePack-1/TealMagentaGold.png",
  "Color/CreativePack-1/TealOrange.png",
  "Color/CreativePack-1/TealOrange1.png",
  "Color/CreativePack-1/TealOrange2.png",
  "Color/CreativePack-1/TealOrange3.png",
  "Color/CreativePack-1/TensionGreen1.png",
  "Color/CreativePack-1/TensionGreen2.png",
  "Color/CreativePack-1/TensionGreen3.png",
  "Color/CreativePack-1/TensionGreen4.png",

  // Polaroid Color (17 of 80; cover instant-photo gamut)
  "Color/Polaroid/Polaroid 669 3.png",
  "Color/Polaroid/Polaroid 669 5 ++.png",
  "Color/Polaroid/Polaroid 669 Cold 3.png",
  "Color/Polaroid/Polaroid 690 3.png",
  "Color/Polaroid/Polaroid 690 Cold 3.png",
  "Color/Polaroid/Polaroid 690 Warm 3.png",
  "Color/Polaroid/Polaroid PX-100UV+ Cold 3.png",
  "Color/Polaroid/Polaroid PX-100UV+ Warm 3.png",
  "Color/Polaroid/Polaroid PX-680 3.png",
  "Color/Polaroid/Polaroid PX-680 Cold 3.png",
  "Color/Polaroid/Polaroid PX-680 Warm 3.png",
  "Color/Polaroid/Polaroid PX-70 3.png",
  "Color/Polaroid/Polaroid PX-70 Cold 3.png",
  "Color/Polaroid/Polaroid PX-70 Warm 3.png",
  "Color/Polaroid/Polaroid Polachrome.png",
  "Color/Polaroid/Polaroid Time Zero (Expired) 4.png",
  "Color/Polaroid/Polaroid Time Zero (Expired) Cold 4.png",

  // Polaroid B&W (5)
  "Black and White/Polaroid/Polaroid 664.png",
  "Black and White/Polaroid/Polaroid 665 3.png",
  "Black and White/Polaroid/Polaroid 665 Negative HC.png",
  "Black and White/Polaroid/Polaroid 667.png",
  "Black and White/Polaroid/Polaroid 672.png",

  // Lomography (2 = all)
  "Color/Lomography/Lomography Redscale 100.png",
  "Color/Lomography/Lomography X-Pro Slide 200.png",

  // Agfa Color (3 = all)
  "Color/Agfa/Agfa Precisa 100.png",
  "Color/Agfa/Agfa Ultra Color 100.png",
  "Color/Agfa/Agfa Vista 200.png",

  // Rollei B&W (4 = all)
  "Black and White/Rollei/Rollei IR 400.png",
  "Black and White/Rollei/Rollei Ortho 25.png",
  "Black and White/Rollei/Rollei Retro 100 Tonal.png",
  "Black and White/Rollei/Rollei Retro 80s.png",

  // Agfa B&W (2 = all)
  "Black and White/Agfa/Agfa APX 100.png",
  "Black and White/Agfa/Agfa APX 25.png",

  // Fuji diversity — push/pull, instant negative, cross-processed (10)
  "Color/Fuji/Fuji 400H 3 +.png",
  "Color/Fuji/Fuji 800Z 4 ++.png",
  "Color/Fuji/Fuji Superia 200 XPRO.png",
  "Color/Fuji/Fuji Superia 1600 4 ++.png",
  "Color/Fuji/Fuji FP-100c Cool 3.png",
  "Color/Fuji/Fuji FP-100c Negative 3.png",
  "Color/Fuji/Fuji Sensia 100.png",
  "Color/Fuji/Fuji Superia Reala 100.png",
  "Color/Fuji/Fuji Provia 400X.png",
  "Color/Fuji/Fuji Astia 100 Generic.png",

  // Kodak diversity — pushed Portra, cross-processed Elite, vintage Kodachrome (10)
  "Color/Kodak/Kodak Portra 800 HC.png",
  "Color/Kodak/Kodak Elite 100 XPRO.png",
  "Color/Kodak/Kodak Elite Color 200.png",
  "Color/Kodak/Kodak Elite Color 400.png",
  "Color/Kodak/Kodak Elite ExtraColor 100.png",
  "Color/Kodak/Kodak Kodachrome 25.png",
  "Color/Kodak/Kodak Kodachrome 64 Generic.png",
  "Color/Kodak/Kodak Portra 400 4 ++.png",
  "Color/Kodak/Kodak Portra 160 1 -.png",
  "Color/Kodak/Kodak E-100 GX Ektachrome 100.png",
];

// ── Filename → metadata heuristics ─────────────────────────────────────

/** Slugify a filename / arbitrary label to lowercase-kebab. */
function slug(s: string): string {
  return s
    .replace(/\.png$/i, "")
    .replace(/^t3mujinpack\s*-\s*/i, "")
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

/**
 * Categorise a t3mujinpack filename.
 * Pattern: "t3mujinpack - <Category> - <Brand> <Stock> [variant].png"
 */
function categoriseT3Mujin(filename: string): {
  category: Category;
  filmStock: string;
  tags: string[];
  description: string;
} {
  const m = filename.match(/^t3mujinpack\s*-\s*([^-]+)\s*-\s*(.+)\.png$/i);
  if (!m) {
    return {
      category: "film-color-negative",
      filmStock: filename.replace(/\.png$/i, ""),
      tags: ["film"],
      description: filename.replace(/\.png$/i, ""),
    };
  }
  const cat = m[1].trim().toLowerCase();
  const stock = m[2].trim();
  let category: Category = "film-color-negative";
  const tags: string[] = ["film"];
  if (cat.includes("black and white")) {
    category = "film-bw";
    tags.push("black-and-white", "monochrome");
  } else if (cat.includes("color slide") || cat.includes("colour slide")) {
    category = "film-color-slide";
    tags.push("color", "slide", "transparency", "saturated");
  } else {
    category = "film-color-negative";
    tags.push("color", "negative");
  }
  // brand cues
  const stockLower = stock.toLowerCase();
  if (stockLower.includes("kodak")) tags.push("kodak");
  if (stockLower.includes("fuji")) tags.push("fuji");
  if (stockLower.includes("agfa")) tags.push("agfa");
  if (stockLower.includes("ilford")) tags.push("ilford");
  if (stockLower.includes("cinestill")) tags.push("cinestill", "warm");
  if (stockLower.includes("portra")) tags.push("portra", "portrait", "warm");
  if (stockLower.includes("velvia")) tags.push("velvia", "saturated", "vivid");
  if (stockLower.includes("provia")) tags.push("provia", "neutral");
  if (stockLower.includes("ektar")) tags.push("ektar", "saturated");
  if (stockLower.includes("tri-x") || stockLower.includes("tri x")) tags.push("tri-x", "grainy");
  if (stockLower.includes("hp5")) tags.push("hp5", "grainy");
  if (stockLower.includes("delta 3200") || stockLower.includes("t-max 3200") || stockLower.includes("neopan 1600") || stockLower.includes("superia 1600")) {
    tags.push("high-iso", "grainy");
  }
  return {
    category,
    filmStock: stock,
    tags,
    description: `Film simulation of ${stock} (${cat.toLowerCase()}).`,
  };
}

/** Strip RT's push/pull suffix. Returns {base, pushPull, fadedNote}. */
function parseRtVariant(stock: string): {
  base: string;
  pushPull: string;
  isFaded: boolean;
} {
  // RT convention: "Stock -- ++" means combinations of pull/push.
  const m = stock.match(/^(.+?)\s+([-+]{1,2})(?:\s+([-+]{1,2}))?\s*$/);
  if (!m) return { base: stock, pushPull: "", isFaded: false };
  const pp = (m[2] + (m[3] ? " " + m[3] : "")).trim();
  return { base: m[1].trim(), pushPull: pp, isFaded: false };
}

/** Categorise RT filename by relative path under Film Simulation/. */
function categoriseRt(relPath: string): {
  category: Category;
  filmStock: string;
  tags: string[];
  description: string;
  pushPull?: string;
} {
  const parts = relPath.split("/");
  const colourGroup = parts[0]; // "Color" or "Black and White"
  const brand = parts[1]; // "CreativePack-1" | "Polaroid" | ...
  const file = basename(parts[parts.length - 1], ".png");

  const tags: string[] = [];
  let category: Category = "film-color-negative";
  let filmStock = file;
  let description = file;
  let pushPull: string | undefined;

  if (brand === "CreativePack-1") {
    // Creative looks — manually mapped to richer tags / descriptions.
    const creativeMap: Record<string, { tags: string[]; description: string; cat: Category }> = {
      Anime: { tags: ["creative", "anime", "stylised", "saturated"], description: "Stylised anime-look color treatment.", cat: "creative-other" },
      BleachBypass1: { tags: ["creative", "bleach-bypass", "cinematic", "high-contrast", "desaturated"], description: "Bleach-bypass cinematic process — high contrast, partial silver retention.", cat: "creative-cinematic" },
      BleachBypass2: { tags: ["creative", "bleach-bypass", "cinematic", "high-contrast", "desaturated"], description: "Bleach-bypass variant 2.", cat: "creative-cinematic" },
      BleachBypass3: { tags: ["creative", "bleach-bypass", "cinematic", "high-contrast", "desaturated"], description: "Bleach-bypass variant 3.", cat: "creative-cinematic" },
      BleachBypass4: { tags: ["creative", "bleach-bypass", "cinematic", "high-contrast", "desaturated"], description: "Bleach-bypass variant 4.", cat: "creative-cinematic" },
      CandleLight: { tags: ["creative", "warm", "amber", "candlelight", "intimate"], description: "Warm candlelit interior tone.", cat: "creative-mood" },
      ColorNegative: { tags: ["creative", "negative", "inverted"], description: "Inverted color-negative effect.", cat: "creative-other" },
      CrispWarm: { tags: ["creative", "warm", "clean", "high-clarity"], description: "Crisp warm clean tones; high-clarity warmth.", cat: "creative-mood" },
      CrispWinter: { tags: ["creative", "cool", "blue", "icy", "clean", "nordic"], description: "Crisp cool winter palette; icy nordic feel.", cat: "creative-mood" },
      DropBlues: { tags: ["creative", "blue", "muted", "moody"], description: "Muted blue-dominant mood.", cat: "creative-mood" },
      EdgyEmber: { tags: ["creative", "ember", "warm", "high-contrast", "dramatic"], description: "Ember-warm high-contrast dramatic look.", cat: "creative-cinematic" },
      FallColors: { tags: ["creative", "autumn", "warm", "saturated", "orange"], description: "Saturated autumn fall-colors palette.", cat: "creative-mood" },
      FoggyNight: { tags: ["creative", "fog", "mood", "low-saturation", "blue", "atmospheric"], description: "Foggy nighttime atmosphere; muted blue.", cat: "creative-mood" },
      FuturisticBleak1: { tags: ["creative", "scifi", "cool", "desaturated", "cinematic", "futuristic"], description: "Bleak futuristic sci-fi tone — cool, desaturated.", cat: "creative-cinematic" },
      FuturisticBleak2: { tags: ["creative", "scifi", "cool", "desaturated", "cinematic", "futuristic"], description: "Bleak futuristic variant 2.", cat: "creative-cinematic" },
      FuturisticBleak3: { tags: ["creative", "scifi", "cool", "desaturated", "cinematic", "futuristic"], description: "Bleak futuristic variant 3.", cat: "creative-cinematic" },
      FuturisticBleak4: { tags: ["creative", "scifi", "cool", "desaturated", "cinematic", "futuristic"], description: "Bleak futuristic variant 4.", cat: "creative-cinematic" },
      HorrorBlue: { tags: ["creative", "horror", "blue", "mood", "dark"], description: "Horror blue cast; dark unsettling mood.", cat: "creative-mood" },
      LateSunset: { tags: ["creative", "warm", "golden-hour", "amber", "sunset"], description: "Late-sunset warm amber palette.", cat: "creative-mood" },
      Moonlight: { tags: ["creative", "blue", "cool", "night", "low-light"], description: "Cool moonlit night tone.", cat: "creative-mood" },
      NightFromDay: { tags: ["creative", "blue", "night", "underexposed", "cool"], description: "Day-for-night conversion — underexposed cool blue.", cat: "creative-mood" },
      RedBlueYellow: { tags: ["creative", "saturated", "primary-colors", "vibrant"], description: "Saturated primary-colors look (red-blue-yellow boost).", cat: "creative-other" },
      Smokey: { tags: ["creative", "muted", "smokey", "desaturated", "moody"], description: "Smokey muted desaturated mood.", cat: "creative-mood" },
      SoftWarming: { tags: ["creative", "warm", "soft", "gentle", "subtle"], description: "Soft gentle warming tone.", cat: "creative-mood" },
      TealMagentaGold: { tags: ["creative", "teal", "magenta", "gold", "cinematic", "complementary"], description: "Teal-magenta-gold complementary cinematic palette.", cat: "creative-cinematic" },
      TealOrange: { tags: ["creative", "teal", "orange", "blockbuster", "cinematic", "hollywood"], description: "Teal-and-orange Hollywood blockbuster look.", cat: "creative-cinematic" },
      TealOrange1: { tags: ["creative", "teal", "orange", "blockbuster", "cinematic"], description: "Teal-and-orange variant 1.", cat: "creative-cinematic" },
      TealOrange2: { tags: ["creative", "teal", "orange", "blockbuster", "cinematic"], description: "Teal-and-orange variant 2.", cat: "creative-cinematic" },
      TealOrange3: { tags: ["creative", "teal", "orange", "blockbuster", "cinematic"], description: "Teal-and-orange variant 3.", cat: "creative-cinematic" },
      TensionGreen1: { tags: ["creative", "green", "tense", "matrix", "cinematic", "thriller"], description: "Green-tinted thriller mood (Matrix-style).", cat: "creative-cinematic" },
      TensionGreen2: { tags: ["creative", "green", "tense", "matrix", "cinematic", "thriller"], description: "Green-tinted thriller variant 2.", cat: "creative-cinematic" },
      TensionGreen3: { tags: ["creative", "green", "tense", "matrix", "cinematic", "thriller"], description: "Green-tinted thriller variant 3.", cat: "creative-cinematic" },
      TensionGreen4: { tags: ["creative", "green", "tense", "matrix", "cinematic", "thriller"], description: "Green-tinted thriller variant 4.", cat: "creative-cinematic" },
    };
    const m = creativeMap[file];
    if (m) {
      return { category: m.cat, filmStock: file, tags: m.tags, description: m.description };
    }
  }

  if (brand === "Polaroid") {
    const isBw = colourGroup === "Black and White";
    category = isBw ? "instant-bw" : "instant-color";
    tags.push("instant", "polaroid", isBw ? "monochrome" : "color");
    if (file.toLowerCase().includes("sx 70") || file.toLowerCase().includes("sx-70")) tags.push("sx-70", "vintage");
    if (file.toLowerCase().includes("time zero")) tags.push("time-zero", "vintage", "soft");
    if (file.toLowerCase().includes("polachrome")) tags.push("polachrome", "saturated");
    description = `Polaroid ${isBw ? "B&W" : "color"} instant-film simulation: ${file}.`;
    return { category, filmStock: file, tags, description };
  }

  if (brand === "Lomography") {
    category = "lomography";
    tags.push("lomography", "lo-fi", "saturated", "vintage");
    if (file.toLowerCase().includes("redscale")) tags.push("redscale", "warm", "amber");
    if (file.toLowerCase().includes("x-pro") || file.toLowerCase().includes("xpro")) tags.push("cross-processed", "saturated", "vivid");
    description = `Lomography ${file} — lo-fi creative film effect.`;
    return { category, filmStock: file, tags, description };
  }

  if (brand === "Rollei" || brand === "Agfa" || brand === "Ilford" || brand === "Kodak" || brand === "Fuji") {
    const isBw = colourGroup === "Black and White";
    const variant = parseRtVariant(file);
    pushPull = variant.pushPull || undefined;
    category = isBw ? "film-bw" : variant.base.toLowerCase().includes("velvia") || variant.base.toLowerCase().includes("provia") || variant.base.toLowerCase().includes("astia") || variant.base.toLowerCase().includes("ektachrome") || variant.base.toLowerCase().includes("kodakchrome") ? "film-color-slide" : "film-color-negative";
    tags.push("film", brand.toLowerCase(), isBw ? "black-and-white" : "color");
    if (isBw) tags.push("monochrome");
    if (variant.pushPull.includes("--")) tags.push("pulled", "low-contrast");
    if (variant.pushPull.includes("++")) tags.push("pushed", "high-contrast");
    description = `${brand} ${variant.base} film simulation${variant.pushPull ? ` (${variant.pushPull} variant)` : ""}.`;
    filmStock = `${brand} ${variant.base}`;
    return { category, filmStock, tags, description, pushPull };
  }

  return { category, filmStock, tags, description };
}

// ── Build pipeline ─────────────────────────────────────────────────────

function resampleHald(srcPath: string, destPath: string): void {
  const r = spawnSync(
    "magick",
    [srcPath, "-filter", "Lanczos", "-resize", `${TARGET_PX}x${TARGET_PX}`, "-strip", destPath],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    throw new Error(`magick failed for ${srcPath}: ${r.stderr || r.stdout}`);
  }
}

function buildT3Mujin(): LutEntry[] {
  if (!existsSync(SRC_T3MUJIN)) {
    throw new Error(`t3mujinpack not found at ${SRC_T3MUJIN}; clone it first`);
  }
  mkdirSync(DEST_MIT, { recursive: true });
  const out: LutEntry[] = [];
  const files = readdirSync(SRC_T3MUJIN)
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .filter((f) => !f.toLowerCase().includes("identity"))
    .sort();
  console.log(`[t3mujinpack] processing ${files.length} files…`);
  for (const f of files) {
    const meta = categoriseT3Mujin(f);
    const id = "t3-" + slug(f);
    const destFile = `${id}.png`;
    const destAbs = join(DEST_MIT, destFile);
    resampleHald(join(SRC_T3MUJIN, f), destAbs);
    out.push({
      id,
      filename: `mit/${destFile}`,
      bundle: "mit",
      license: "MIT",
      attribution: "© 2017 João Almeida — t3mujinpack (MIT)",
      source: "t3mujinpack",
      sourceUrl: "https://github.com/t3mujinpack/t3mujinpack",
      sourceFilename: f,
      category: meta.category,
      tags: meta.tags,
      description: meta.description,
      filmStock: meta.filmStock,
    });
    process.stdout.write(".");
  }
  process.stdout.write("\n");
  return out;
}

function buildRawTherapee(): LutEntry[] {
  if (!existsSync(SRC_RAWTHERAPEE)) {
    throw new Error(`RawTherapee Film Simulation not found at ${SRC_RAWTHERAPEE}; sparse-clone it first`);
  }
  mkdirSync(DEST_CCBYSA, { recursive: true });
  const out: LutEntry[] = [];
  console.log(`[rawtherapee] processing ${RT_CHERRYPICK.length} cherry-picked files…`);
  let missing = 0;
  for (const rel of RT_CHERRYPICK) {
    const srcAbs = join(SRC_RAWTHERAPEE, rel);
    if (!existsSync(srcAbs)) {
      console.warn(`  skip (not found): ${rel}`);
      missing++;
      continue;
    }
    const meta = categoriseRt(rel);
    const fileBase = basename(rel, ".png");
    const id = "rt-" + slug(rel);
    const destFile = `${id}.png`;
    const destAbs = join(DEST_CCBYSA, destFile);
    resampleHald(srcAbs, destAbs);
    out.push({
      id,
      filename: `cc-by-sa/${destFile}`,
      bundle: "cc-by-sa",
      license: "CC-BY-SA-4.0",
      attribution:
        "© Pat David, Pavlov Dmitry, Michael Ezra — RawTherapee Film Simulation Collection (CC BY-SA 4.0). " +
        "Trademarked names used nominatively (fair use).",
      source: "rawtherapee-film-simulation",
      sourceUrl: "https://rawpedia.rawtherapee.com/Film_Simulation",
      sourceFilename: fileBase + ".png",
      category: meta.category,
      tags: meta.tags,
      description: meta.description,
      filmStock: meta.filmStock,
      pushPull: meta.pushPull,
    });
    process.stdout.write(".");
  }
  process.stdout.write("\n");
  if (missing > 0) console.warn(`  ${missing} cherry-pick entries not found in source`);
  return out;
}

function writeManifest(entries: LutEntry[]): void {
  const path = join(DEST_ROOT, "manifest.json");
  const totalBytes = entries.reduce((s, e) => {
    const fp = join("public/luts", e.filename);
    try {
      return s + statSync(fp).size;
    } catch {
      return s;
    }
  }, 0);
  const byBundle = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.bundle] = (acc[e.bundle] ?? 0) + 1;
    return acc;
  }, {});
  const byCategory = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + 1;
    return acc;
  }, {});

  const doc = {
    version: 1,
    generatedAt: new Date().toISOString(),
    haldLevel: 6,
    haldPx: TARGET_PX,
    effectiveLutSize: 36,
    counts: { total: entries.length, byBundle, byCategory },
    diskBytes: totalBytes,
    luts: entries,
  };
  writeFileSync(path, JSON.stringify(doc, null, 2), "utf8");
  console.log(`Wrote ${path} — ${entries.length} entries, ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
}

function main(): void {
  console.log("Building LUT library →", DEST_ROOT);
  const t3 = buildT3Mujin();
  const rt = buildRawTherapee();
  const all = [...t3, ...rt];
  writeManifest(all);
  console.log(`Done. Total LUTs: ${all.length}`);
}

main();
