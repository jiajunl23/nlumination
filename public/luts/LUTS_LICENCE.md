# LUT Library Licence & Attribution

This directory ships **137 photographic look-up tables (LUTs)** in
HaldCLUT level 6 (216×216 PNG, 36³-equivalent 3-D LUT) sourced from two
independently-licensed upstream collections.

**The LUT files are the only thing covered by this notice.** The
NLumination application code that *uses* the LUTs is licensed
separately and is **not** a derivative work of these tables (see the
ShareAlike scope statement below).

If you fork or redistribute NLumination, ship this file alongside the
contents of `public/luts/`.

---

## Bundle layout

```
public/luts/
├── mit/             ← 51 LUTs · MIT-licensed
├── cc-by-sa/        ← 86 LUTs · CC BY-SA 4.0
├── manifest.json    ← machine-readable index (id, source, license, attribution, …)
└── LUTS_LICENCE.md  ← this file
```

The two bundles are kept physically separate so the CC BY-SA
ShareAlike clause has an unambiguous scope.

---

## Bundle 1 — `mit/` (51 LUTs)

**Source:** [t3mujinpack](https://github.com/t3mujinpack/t3mujinpack) — Darktable / RawTherapee film-stock simulation pack.
**Author:** João Almeida (2017).
**Licence:** MIT.
**Modifications applied:** original Hald level-12 PNGs (1728×1728) downsampled to Hald level 6 (216×216, 36³ effective LUT) via ImageMagick Lanczos. No colour data was altered beyond resampling.

### MIT licence text (verbatim)

```
MIT License

Copyright (c) 2017 João Almeida

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Bundle 2 — `cc-by-sa/` (86 LUTs)

**Source:** [RawTherapee Film Simulation Collection (2015-09-20 release)](https://rawpedia.rawtherapee.com/Film_Simulation), cherry-picked subset.
**Authors:** Pat David, Pavlov Dmitry, Michael Ezra (and other RawTherapee community contributors).
**Licence:** Creative Commons Attribution-ShareAlike 4.0 International (**CC BY-SA 4.0**) — see https://creativecommons.org/licenses/by-sa/4.0/legalcode for the full legal text.
**Modifications applied:** original Hald level-12 PNGs (1728×1728) downsampled to Hald level 6 (216×216, 36³ effective LUT) via ImageMagick Lanczos. No colour data was altered beyond resampling.

The ~80 cherry-picked entries cover six upstream sub-collections:
- `CreativePack-1` (33 creative looks: TealOrange, BleachBypass, FuturisticBleak, TensionGreen, FoggyNight, CandleLight, …)
- `Polaroid` colour & B&W instant-film simulations (22 selected from 92)
- `Lomography` (2 of 2: Redscale 100, X-Pro Slide 200)
- `Agfa` colour & B&W (5 of 5)
- `Rollei` B&W (4 of 4)
- `Fuji` and `Kodak` push/pull/cross-process variants not duplicated by Bundle 1 (20 of 109 — diverse selection)

The full per-file mapping (source filename → output filename → SPDX license tag) is in `manifest.json`.

### Required attribution (CC BY-SA §3.a.1)

When redistributing or displaying NLumination, the following credit line must be visible somewhere in the application's licence / about screen, or in the about-page of any redistribution:

> Photographic film-look LUTs (cc-by-sa/ bundle) © Pat David, Pavlov Dmitry, Michael Ezra and the RawTherapee community, used under CC BY-SA 4.0. Original collection: https://rawpedia.rawtherapee.com/Film_Simulation.

### ShareAlike (SA) scope

The CC BY-SA 4.0 ShareAlike clause requires that **adaptations of the LUT files** be released under the same (or a CC-BY-SA-compatible) licence. To keep this clause confined to the LUTs themselves:

- Files inside `public/luts/cc-by-sa/` are **direct adaptations** of upstream RawTherapee CLUTs (downsampled). They remain licensed CC BY-SA 4.0.
- Application source code in the rest of this repository is **not a derivative work** of the LUT data. The application reads LUT pixels at run-time via WebGL/WebGPU; this is "use of" the LUTs, not "adaptation of" them, in the sense Creative Commons defines (the application code does not embed nor depend structurally on the LUT contents — replacing the LUTs with any other 36³ LUT works without changing application code).
- This interpretation matches how RawTherapee, Darktable, GIMP, and similar projects treat included CC BY-SA assets: data files retain their license, application code is licensed independently.

If you redistribute *just the LUT files* (e.g. extracting them into a separate package), the package must remain CC BY-SA 4.0.

---

## Trademark disclaimer (nominative fair use)

Several LUT filenames reference photographic film stocks by their trademarked names (Kodak Portra, Fuji Velvia, Polaroid SX-70, Agfa Vista, Ilford HP5, Rollei Retro, etc.). These names are used **descriptively** to identify the film-stock the LUT was designed to approximate, in keeping with the upstream RawTherapee Film Simulation Collection's own disclaimer:

> *"The trademarked names which may appear in the filenames of the Hald CLUT images are there for informational purposes only. They serve only to inform the user which film stock the given Hald CLUT image is designed to approximate. As there is no way to convey this information other than by using the trademarked name, we believe this constitutes fair use. Neither the publisher nor the authors are affiliated with or endorsed by the companies that own the trademarks."* — RawTherapee Film Simulation Collection 2015-09-20 README.

NLumination is not affiliated with or endorsed by Eastman Kodak Company, FUJIFILM Corporation, Polaroid B.V., AGFA-Gevaert N.V., Harman Technology Limited / Ilford, Rollei GmbH & Co. KG, or any other film manufacturer.

---

## How the LUT files were generated

The pipeline in `scripts/build-luts.ts`:

1. Source HaldCLUT level-12 PNGs (1728×1728 = 144³ effective LUT) cloned from upstream repositories.
2. ImageMagick: `magick <src> -filter Lanczos -resize 216x216 -strip <dest>`. Lanczos was chosen over Mitchell or Catmull–Rom for the cleanest reconstruction of smooth gradients on a 8× downsample.
3. Output written to `public/luts/{mit,cc-by-sa}/<id>.png` along with a JSON entry in `public/luts/manifest.json`.

To regenerate the bundle from upstream:

```bash
# Clone sources (one-time)
mkdir -p /tmp/lut-research && cd /tmp/lut-research
git clone --depth 1 https://github.com/t3mujinpack/t3mujinpack.git
git clone --depth 1 --filter=blob:none --sparse https://github.com/cedeber/hald-clut.git
cd hald-clut && git sparse-checkout set "HaldCLUT/Film Simulation"

# Rebuild
cd <project-root>
pnpm tsx scripts/build-luts.ts
```

Build is idempotent and offline (no network calls beyond the one-time `git clone`).

> **Note on `cedeber/hald-clut`:** the *repository* is licensed GPL-3.0, but the `HaldCLUT/Film Simulation/` subtree is the original upstream RawTherapee work distributed under CC BY-SA 4.0 (see its `README.txt` inside that subtree). We `git sparse-checkout` only that subtree and treat it under the *upstream* RawTherapee licence, not the repository's GPL-3 cover.
