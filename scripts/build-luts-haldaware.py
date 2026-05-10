#!/usr/bin/env python3
"""
Hald-aware downsampling for the LUT library.

Spatial resampling (ImageMagick `-resize`) corrupts a Hald CLUT because
adjacent pixels map to *different* LUT inputs — Lanczos blurs across
unrelated cube entries and produces nonsense colors at level boundaries.

The correct pipeline:
  1. Decode src Hald-12 PNG (1728×1728) into a 144³ float cube using
     the standard layout (R fastest, then G, then B).
  2. Trilinear-resample the cube to 36³ in cube space.
  3. Re-encode as Hald-6 PNG (216×216) using the same layout.

This script overwrites the PNGs that scripts/build-luts.ts produced
(those used spatial Lanczos and are wrong). After running this, the
manifest.json and embeddings stay valid (filenames unchanged).

Usage:
    python3 scripts/build-luts-haldaware.py

Requires: numpy, PIL.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image


# Source paths (cloned to /tmp by the prior scripts/build-luts.ts run).
SRC_T3MUJIN = Path("/tmp/lut-research/t3mujinpack/haldcluts")
SRC_RAWTHERAPEE = Path("/tmp/lut-research/hald-clut/HaldCLUT/Film Simulation")

DEST_ROOT = Path("public/luts")
DEST_MIT = DEST_ROOT / "mit"
DEST_CCBYSA = DEST_ROOT / "cc-by-sa"

SRC_LEVEL = 12  # Hald-12 source PNGs (1728×1728)
DST_LEVEL = 6   # Hald-6 destination (216×216, 36³ effective LUT)


# RT cherry-pick (must match scripts/build-luts.ts; copied here so this
# script can run standalone).
RT_CHERRYPICK = [
    # CreativePack-1 (33 creative looks)
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
    # Polaroid Color (17)
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
    # Polaroid B&W (5)
    "Black and White/Polaroid/Polaroid 664.png",
    "Black and White/Polaroid/Polaroid 665 3.png",
    "Black and White/Polaroid/Polaroid 665 Negative HC.png",
    "Black and White/Polaroid/Polaroid 667.png",
    "Black and White/Polaroid/Polaroid 672.png",
    # Lomography (2)
    "Color/Lomography/Lomography Redscale 100.png",
    "Color/Lomography/Lomography X-Pro Slide 200.png",
    # Agfa Color (3)
    "Color/Agfa/Agfa Precisa 100.png",
    "Color/Agfa/Agfa Ultra Color 100.png",
    "Color/Agfa/Agfa Vista 200.png",
    # Rollei B&W (4)
    "Black and White/Rollei/Rollei IR 400.png",
    "Black and White/Rollei/Rollei Ortho 25.png",
    "Black and White/Rollei/Rollei Retro 100 Tonal.png",
    "Black and White/Rollei/Rollei Retro 80s.png",
    # Agfa B&W (2)
    "Black and White/Agfa/Agfa APX 100.png",
    "Black and White/Agfa/Agfa APX 25.png",
    # Fuji diversity (10)
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
    # Kodak diversity (10)
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
]


def slug(s: str) -> str:
    """Match the slugify rule used in scripts/build-luts.ts so produced
    filenames stay identical (manifest references won't break)."""
    import re
    s = re.sub(r"\.png$", "", s, flags=re.IGNORECASE)
    s = re.sub(r"^t3mujinpack\s*-\s*", "", s, flags=re.IGNORECASE)
    s = re.sub(r"[/\\]", "-", s)
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-").lower()
    return s


def hald_png_to_cube(path: Path, level: int) -> np.ndarray:
    """Decode Hald-N PNG → cube of shape (N², N², N², 3) in [0, 1] floats.

    Layout (R fastest in linear pixel order):
      x = R + (G mod N) * N²
      y = (G // N) + B * N
    """
    img = Image.open(path).convert("RGB")
    arr = np.asarray(img, dtype=np.uint8)
    side = level ** 3
    if arr.shape != (side, side, 3):
        raise ValueError(f"unexpected size {arr.shape} for Hald-{level}: {path}")
    cube_size = level ** 2  # entries per axis (e.g. 144 for Hald-12)

    # Vectorised gather. Build (cube_size,)³ index grids.
    rs, gs, bs = np.meshgrid(
        np.arange(cube_size),
        np.arange(cube_size),
        np.arange(cube_size),
        indexing="ij",
    )
    xs = rs + (gs % level) * cube_size
    ys = (gs // level) + bs * level
    cube = arr[ys, xs].astype(np.float32) / 255.0
    return cube


def trilinear_resample(cube: np.ndarray, dst_size: int) -> np.ndarray:
    """Trilinear-sample an N³ cube to dst_size³ in cube coordinate space."""
    src_size = cube.shape[0]
    coords = np.arange(dst_size, dtype=np.float32) * (src_size - 1) / (dst_size - 1)
    rs, gs, bs = np.meshgrid(coords, coords, coords, indexing="ij")
    x0 = np.clip(np.floor(rs).astype(np.int64), 0, src_size - 2)
    y0 = np.clip(np.floor(gs).astype(np.int64), 0, src_size - 2)
    z0 = np.clip(np.floor(bs).astype(np.int64), 0, src_size - 2)
    fx = (rs - x0)[..., None]
    fy = (gs - y0)[..., None]
    fz = (bs - z0)[..., None]
    c000 = cube[x0, y0, z0]
    c100 = cube[x0 + 1, y0, z0]
    c010 = cube[x0, y0 + 1, z0]
    c110 = cube[x0 + 1, y0 + 1, z0]
    c001 = cube[x0, y0, z0 + 1]
    c101 = cube[x0 + 1, y0, z0 + 1]
    c011 = cube[x0, y0 + 1, z0 + 1]
    c111 = cube[x0 + 1, y0 + 1, z0 + 1]
    c00 = c000 * (1 - fx) + c100 * fx
    c01 = c001 * (1 - fx) + c101 * fx
    c10 = c010 * (1 - fx) + c110 * fx
    c11 = c011 * (1 - fx) + c111 * fx
    c0 = c00 * (1 - fy) + c10 * fy
    c1 = c01 * (1 - fy) + c11 * fy
    return c0 * (1 - fz) + c1 * fz


def cube_to_hald_png(cube: np.ndarray, level: int, out_path: Path) -> None:
    """Encode cube of shape (N², N², N², 3) → Hald-N PNG (N³ × N³)."""
    cube_size = level ** 2
    side = level ** 3
    if cube.shape != (cube_size, cube_size, cube_size, 3):
        raise ValueError(f"cube shape {cube.shape} doesn't match level {level}")
    arr = np.zeros((side, side, 3), dtype=np.uint8)
    rs, gs, bs = np.meshgrid(
        np.arange(cube_size),
        np.arange(cube_size),
        np.arange(cube_size),
        indexing="ij",
    )
    xs = rs + (gs % level) * cube_size
    ys = (gs // level) + bs * level
    arr[ys, xs] = np.clip(cube[rs, gs, bs] * 255.0 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(arr).save(out_path, optimize=True)


def hald_resize(src: Path, dst: Path, src_level: int, dst_level: int) -> None:
    cube = hald_png_to_cube(src, src_level)
    if src_level != dst_level:
        cube = trilinear_resample(cube, dst_level ** 2)
    cube_to_hald_png(cube, dst_level, dst)


def build_t3mujin() -> int:
    if not SRC_T3MUJIN.exists():
        print(f"ERROR: t3mujinpack source not found at {SRC_T3MUJIN}", file=sys.stderr)
        return 0
    DEST_MIT.mkdir(parents=True, exist_ok=True)
    files = sorted(
        f for f in os.listdir(SRC_T3MUJIN)
        if f.lower().endswith(".png") and "identity" not in f.lower()
    )
    print(f"[t3mujinpack] {len(files)} files…")
    for i, f in enumerate(files):
        out_id = "t3-" + slug(f)
        dst = DEST_MIT / f"{out_id}.png"
        hald_resize(SRC_T3MUJIN / f, dst, SRC_LEVEL, DST_LEVEL)
        if (i + 1) % 10 == 0 or i + 1 == len(files):
            print(f"  [{i+1}/{len(files)}] {f}")
    return len(files)


def build_rawtherapee() -> int:
    if not SRC_RAWTHERAPEE.exists():
        print(f"ERROR: RT source not found at {SRC_RAWTHERAPEE}", file=sys.stderr)
        return 0
    DEST_CCBYSA.mkdir(parents=True, exist_ok=True)
    print(f"[rawtherapee] {len(RT_CHERRYPICK)} files…")
    n = 0
    for i, rel in enumerate(RT_CHERRYPICK):
        src = SRC_RAWTHERAPEE / rel
        if not src.exists():
            print(f"  skip (not found): {rel}", file=sys.stderr)
            continue
        out_id = "rt-" + slug(rel)
        dst = DEST_CCBYSA / f"{out_id}.png"
        hald_resize(src, dst, SRC_LEVEL, DST_LEVEL)
        n += 1
        if n % 10 == 0 or i + 1 == len(RT_CHERRYPICK):
            print(f"  [{n}] {rel}")
    return n


def main() -> None:
    n1 = build_t3mujin()
    n2 = build_rawtherapee()
    print(f"\nDone. {n1} MIT + {n2} CC-BY-SA = {n1 + n2} LUTs rebuilt (Hald-aware).")


if __name__ == "__main__":
    main()
