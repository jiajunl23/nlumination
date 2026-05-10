#!/usr/bin/env python3
"""
Enrich the LUT manifest with colorist-grade descriptions and tags.

The initial build script generated descriptions like "Film simulation
of Kodak Portra 400 (color negative)." which are fine for keyword
search but anaemic for cosine-similarity retrieval — a user prompt
like "soft warm portrait classic" doesn't have much lexical or
semantic overlap with the original templated string.

This script rewrites descriptions and tags for every LUT *except*
CreativePack-1 (which already has hand-written copy from the build).
The knowledge base captures the canonical "character" of each film
stock the way colorists describe it: "creamy highlights", "lifted
blacks", "punchy saturation", etc. Variant modifiers (push/pull,
NC/VC/UC, Cold/Warm) compose on top.

Usage:
    python3 scripts/enrich-lut-descriptions.py
    pnpm tsx scripts/embed-luts.ts        # re-embed with the new text

The manifest's `embedding` field is preserved on entries we don't
touch, but anything we rewrite will need re-embedding to take effect
in the cosine retriever.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

MANIFEST_PATH = Path("public/luts/manifest.json")

# Common tag bundles reused across many entries.
COLORIST_PORTRAIT = ["portrait", "warm", "natural-skin", "wedding", "editorial"]
COLORIST_LANDSCAPE = ["landscape", "saturated", "outdoor"]
COLORIST_VINTAGE_NEG = ["vintage", "analog", "film-grain", "nostalgic"]
COLORIST_BW = ["black-and-white", "monochrome", "documentary"]
COLORIST_INSTANT = ["instant", "polaroid", "snapshot", "lo-fi"]


# ── Film-stock knowledge base ──────────────────────────────────────────
# Keyed by canonical base name (variants stripped). Each entry supplies
# the colourist-style description and a tag bag. variant copy is composed
# on top in compose_description().
FILM_DB: dict[str, dict] = {
    # ── Kodak portrait ────────────────────────────────────────────────
    "Kodak Portra 160": {
        "summary": "soft, low-contrast portrait colour negative; creamy skin tones, gentle highlight rolloff, fine grain",
        "tags": COLORIST_PORTRAIT + ["low-contrast", "soft", "fine-grain", "kodak", "portra"],
    },
    "Kodak Portra 400": {
        "summary": "the modern wedding-and-editorial classic — warm golden skin tones, milky highlights, faintly lifted blacks, very forgiving exposure latitude",
        "tags": COLORIST_PORTRAIT + ["lifted-blacks", "wedding", "editorial", "kodak", "portra"],
    },
    "Kodak Portra 800": {
        "summary": "high-speed Portra variant — same warm-leaning skin tones with visible grain, slightly more contrast, low-light wedding workhorse",
        "tags": COLORIST_PORTRAIT + ["high-iso", "visible-grain", "low-light", "kodak", "portra"],
    },
    # NC / VC / UC variants of Portra share the base mood, get modifier
    "Kodak Portra 160 NC": {
        "summary": "neutral-colour Portra 160 — desaturated portrait look, very low contrast, journalism-friendly",
        "tags": COLORIST_PORTRAIT + ["neutral", "desaturated", "muted", "documentary", "kodak", "portra"],
    },
    "Kodak Portra 160 VC": {
        "summary": "vivid-colour Portra 160 — slightly punchier saturation than the standard Portra, keeps soft skin",
        "tags": COLORIST_PORTRAIT + ["vivid", "saturated", "kodak", "portra"],
    },
    "Kodak Portra 400 NC": {
        "summary": "neutral-colour Portra 400 — flattering muted portrait look, lifted blacks, journalist-natural",
        "tags": COLORIST_PORTRAIT + ["neutral", "muted", "lifted-blacks", "documentary", "kodak", "portra"],
    },
    "Kodak Portra 400 VC": {
        "summary": "vivid-colour Portra 400 — punchier saturation while keeping creamy skin tones; commercial portrait staple",
        "tags": COLORIST_PORTRAIT + ["vivid", "saturated", "commercial", "kodak", "portra"],
    },
    "Kodak Portra 400 UC": {
        "summary": "ultra-saturated Portra 400 — boldest of the Portra family, vivid skin and clothing colour, advertising-bright",
        "tags": COLORIST_PORTRAIT + ["highly-saturated", "vivid", "advertising", "kodak", "portra"],
    },
    # ── Kodak colour neg, others ─────────────────────────────────────
    "Kodak Ektar 100": {
        "summary": "fine-grain, ultra-saturated colour neg — landscape-ready, deep blues and greens, contrasty",
        "tags": COLORIST_LANDSCAPE + ["highly-saturated", "fine-grain", "deep-blue", "deep-green", "kodak", "ektar"],
    },
    "Kodak Gold 200": {
        "summary": "warm everyday colour neg — sunny golden cast, mid-saturation, classic 90s family-album look",
        "tags": ["warm", "vintage", "sunny", "amber", "casual", "snapshot", "kodak", "gold", "nostalgic"],
    },
    "Kodak ColorPlus 200": {
        "summary": "budget warm colour neg — gentle saturation, slightly lifted blacks, faintly retro feel",
        "tags": ["warm", "vintage", "lifted-blacks", "casual", "kodak", "colorplus", "nostalgic"],
    },
    "Kodak Ultra Max 400": {
        "summary": "punchy consumer colour neg — moderate-to-high saturation, slightly cooler than Gold, dependable contrast",
        "tags": ["saturated", "punchy", "casual", "kodak", "ultramax"],
    },
    # ── Kodak slide ────────────────────────────────────────────────────
    "Kodak Ektachrome 100 G": {
        "summary": "neutral-tone Ektachrome — clean, slightly cool slide film with fine grain and moderate saturation",
        "tags": ["slide", "neutral", "cool", "fine-grain", "kodak", "ektachrome"],
    },
    "Kodak Ektachrome 100 GX": {
        "summary": "warm-tone Ektachrome — sunny slide film, golden highlights, moderate saturation",
        "tags": ["slide", "warm", "sunny", "kodak", "ektachrome"],
    },
    "Kodak Ektachrome 100 VS": {
        "summary": "vivid-saturation Ektachrome — bold blues and reds, contrasty, commercial-bright",
        "tags": ["slide", "highly-saturated", "vivid", "commercial", "kodak", "ektachrome"],
    },
    "Kodak Elite Chrome 200": {
        "summary": "consumer slide film — saturated, contrasty, cool-leaning",
        "tags": ["slide", "saturated", "cool", "kodak", "elite"],
    },
    "Kodak Elite Chrome 400": {
        "summary": "high-speed Elite Chrome — visible grain, punchy slide-film saturation",
        "tags": ["slide", "saturated", "high-iso", "visible-grain", "kodak", "elite"],
    },
    "Kodak Kodachrome 25": {
        "summary": "legendary Kodachrome 25 — fine grain, deep reds, archival warmth, vintage National Geographic feel",
        "tags": ["slide", "vintage", "deep-red", "warm", "fine-grain", "iconic", "kodak", "kodachrome", "nostalgic"],
    },
    "Kodak Kodachrome 64": {
        "summary": "Kodachrome 64 — slightly faster Kodachrome, same warm vintage colour science, deep blues",
        "tags": ["slide", "vintage", "deep-blue", "warm", "iconic", "kodak", "kodachrome", "nostalgic"],
    },
    "Kodak Kodachrome 200": {
        "summary": "high-speed Kodachrome — late-era Kodak slide with grainier vintage warmth",
        "tags": ["slide", "vintage", "warm", "visible-grain", "kodak", "kodachrome", "nostalgic"],
    },
    # t3mujinpack misspells "Kodakchrome" — alias to the same entries
    "Kodak Kodakchrome 25": {
        "summary": "legendary Kodachrome 25 — fine grain, deep reds, archival warmth, vintage National Geographic feel",
        "tags": ["slide", "vintage", "deep-red", "warm", "fine-grain", "iconic", "kodak", "kodachrome", "nostalgic"],
    },
    "Kodak Kodakchrome 64": {
        "summary": "Kodachrome 64 — slightly faster Kodachrome, same warm vintage colour science, deep blues",
        "tags": ["slide", "vintage", "deep-blue", "warm", "iconic", "kodak", "kodachrome", "nostalgic"],
    },
    "Kodak Kodakchrome 200": {
        "summary": "high-speed Kodachrome — late-era Kodak slide with grainier vintage warmth",
        "tags": ["slide", "vintage", "warm", "visible-grain", "kodak", "kodachrome", "nostalgic"],
    },
    "Kodak E-100 GX Ektachrome 100": {
        "summary": "warm-tone Ektachrome 100 — sunny slide-film palette, gentle saturation",
        "tags": ["slide", "warm", "sunny", "kodak", "ektachrome"],
    },
    "Kodak Elite 100 XPRO": {
        "summary": "cross-processed Kodak Elite 100 — green/yellow shadow shift, magenta highlights, lo-fi creative look",
        "tags": ["cross-processed", "creative", "lo-fi", "lomography", "green-shift", "magenta", "kodak"],
    },
    # base form for when XPRO suffix has been stripped to a variant
    "Kodak Elite 100": {
        "summary": "Kodak Elite 100 — saturated everyday Kodak slide, blue-leaning, contrasty",
        "tags": ["slide", "saturated", "blue-leaning", "kodak", "elite"],
    },
    # E-100 GX Ektachrome variants — one with trailing "100" already in DB,
    # and one without (after smart-strip removed it)
    "Kodak E-100 GX Ektachrome": {
        "summary": "warm-tone Ektachrome 100 — sunny slide-film palette, gentle saturation",
        "tags": ["slide", "warm", "sunny", "kodak", "ektachrome"],
    },
    "Kodak Elite Color 200": {
        "summary": "saturated everyday slide film, blue-leaning, contrasty",
        "tags": ["slide", "saturated", "blue-leaning", "kodak"],
    },
    "Kodak Elite Color 400": {
        "summary": "high-speed Elite Color — visible grain, blue-leaning saturation, sharp contrast",
        "tags": ["slide", "saturated", "high-iso", "visible-grain", "blue-leaning", "kodak"],
    },
    "Kodak Elite ExtraColor 100": {
        "summary": "extra-saturated Kodak Elite — extreme colour pop, deep blue skies, advertising-vivid",
        "tags": ["slide", "highly-saturated", "vivid", "advertising", "deep-blue", "kodak"],
    },
    # ── Fuji portrait neg ────────────────────────────────────────────
    "Fuji Pro 160C": {
        "summary": "Fuji Pro 160C — neutral colour portrait neg, low-contrast, slightly cool skin compared to Portra",
        "tags": COLORIST_PORTRAIT + ["neutral", "cool-skin", "low-contrast", "fuji", "pro"],
    },
    "Fuji 160C": {
        "summary": "Fuji Pro 160C — neutral colour portrait neg, low-contrast, slightly cool skin",
        "tags": COLORIST_PORTRAIT + ["neutral", "cool-skin", "low-contrast", "fuji", "pro"],
    },
    "Fuji Pro 400H": {
        "summary": "the wedding-aesthetic darling — pastel greens, soft mint shadows, low contrast, faintly cool skin",
        "tags": COLORIST_PORTRAIT + ["pastel", "mint", "low-contrast", "wedding", "soft", "fuji", "pro", "400h"],
    },
    "Fuji 400H": {
        "summary": "the wedding-aesthetic darling — pastel greens, soft mint shadows, low contrast, faintly cool skin",
        "tags": COLORIST_PORTRAIT + ["pastel", "mint", "low-contrast", "wedding", "soft", "fuji", "pro", "400h"],
    },
    "Fuji Pro 800Z": {
        "summary": "high-speed Fuji portrait neg — visible grain, slightly cooler than Pro 400H, dim-light wedding choice",
        "tags": COLORIST_PORTRAIT + ["high-iso", "visible-grain", "cool-leaning", "low-light", "fuji", "pro", "800z"],
    },
    "Fuji 800Z": {
        "summary": "high-speed Fuji portrait neg — visible grain, slightly cooler than Pro 400H, low-light",
        "tags": COLORIST_PORTRAIT + ["high-iso", "visible-grain", "cool-leaning", "low-light", "fuji", "pro", "800z"],
    },
    # ── Fuji Superia consumer ─────────────────────────────────────────
    "Fuji Superia 100": {
        "summary": "everyday Fuji colour neg — green-leaning saturation, fine grain, snappy contrast",
        "tags": ["casual", "green-leaning", "saturated", "snappy", "fine-grain", "fuji", "superia"],
    },
    "Fuji Superia 200": {
        "summary": "everyday Fuji 200 — neutral saturation, slight green cast, casual snapshots",
        "tags": ["casual", "snapshot", "green-leaning", "fuji", "superia"],
    },
    "Fuji Superia 400": {
        "summary": "everyday Fuji 400 — slight green cast, mid saturation, ISO 400 versatility",
        "tags": ["casual", "snapshot", "green-leaning", "fuji", "superia"],
    },
    "Fuji Superia 800": {
        "summary": "fast Fuji Superia — visible grain, green-leaning, low-light snapshot",
        "tags": ["casual", "high-iso", "visible-grain", "green-leaning", "fuji", "superia"],
    },
    "Fuji Superia 1600": {
        "summary": "ultra-fast Superia — heavy grain, green cast, gritty low-light feel",
        "tags": ["casual", "high-iso", "grainy", "gritty", "green-leaning", "low-light", "fuji", "superia"],
    },
    "Fuji Superia HG 1600": {
        "summary": "Superia HG 1600 — high-grain budget low-light, vintage early-2000s colour",
        "tags": ["casual", "high-iso", "grainy", "vintage", "fuji", "superia"],
    },
    "Fuji Superia Reala 100": {
        "summary": "Superia Reala 100 — finer-grain consumer Fuji with slightly improved skin tones",
        "tags": ["casual", "fine-grain", "fuji", "superia", "reala"],
    },
    "Fuji Superia 200 XPRO": {
        "summary": "cross-processed Superia 200 — blue-green shadows, magenta-yellow highlights, lo-fi lomography vibe",
        "tags": ["cross-processed", "lo-fi", "lomography", "blue-green", "magenta", "creative", "fuji"],
    },
    # ── Fuji slide ────────────────────────────────────────────────────
    "Fuji Astia 100F": {
        "summary": "soft-skin Fuji slide — muted saturation, creamy portrait-friendly slide film",
        "tags": ["slide", "soft", "muted", "natural-skin", "portrait", "fuji", "astia"],
    },
    "Fuji Astia 100": {
        "summary": "soft-skin Fuji slide — muted saturation, creamy portrait-friendly slide film",
        "tags": ["slide", "soft", "muted", "natural-skin", "portrait", "fuji", "astia"],
    },
    "Fuji Astia 100 Generic": {
        "summary": "soft-skin Fuji slide — muted saturation, creamy portrait-friendly slide film",
        "tags": ["slide", "soft", "muted", "natural-skin", "portrait", "fuji", "astia"],
    },
    "Fuji Provia 100F": {
        "summary": "the standard pro slide film — neutral colour, fine grain, moderate saturation, balanced contrast",
        "tags": ["slide", "neutral", "fine-grain", "balanced", "fuji", "provia"],
    },
    "Fuji Provia 400F": {
        "summary": "high-speed Provia — moderate-saturation slide for low light, visible grain",
        "tags": ["slide", "neutral", "high-iso", "visible-grain", "fuji", "provia"],
    },
    "Fuji Provia 400X": {
        "summary": "Provia 400X — punchier replacement for 400F, slightly more saturation",
        "tags": ["slide", "saturated", "high-iso", "fuji", "provia"],
    },
    "Fuji Velvia 50": {
        "summary": "the landscape photographer's signature — extreme saturation, deep emerald greens, brilliant blues, contrasty",
        "tags": COLORIST_LANDSCAPE + ["slide", "highly-saturated", "deep-green", "deep-blue", "contrasty", "fuji", "velvia"],
    },
    "Fuji Velvia 100": {
        "summary": "Velvia 100 — slightly less saturated than Velvia 50 but still vivid; landscape-vibrant",
        "tags": COLORIST_LANDSCAPE + ["slide", "highly-saturated", "vivid", "fuji", "velvia"],
    },
    "Fuji Sensia 100": {
        "summary": "consumer slide film — moderate saturation, slightly green-leaning, balanced contrast",
        "tags": ["slide", "balanced", "green-leaning", "fuji", "sensia"],
    },
    "Fuji Fortia SP 50": {
        "summary": "limited-edition Fortia — Velvia-extreme saturation with magenta-shifted skin tones, cherry-blossom legend",
        "tags": ["slide", "highly-saturated", "magenta-skin", "extreme", "fuji", "fortia"],
    },
    # ── Fuji Pack film (FP-100c) ──────────────────────────────────────
    "Fuji FP-100c": {
        "summary": "Fuji FP-100c instant peel-apart film — natural saturation, snappy contrast, instant-photo character",
        "tags": COLORIST_INSTANT + ["fuji", "fp-100c", "peel-apart"],
    },
    "Fuji FP-100c Cool": {
        "summary": "cool variant of FP-100c instant film — bluer cast, cinematic instant-photo feel",
        "tags": COLORIST_INSTANT + ["cool", "blue-leaning", "cinematic", "fuji", "fp-100c"],
    },
    "Fuji FP-100c Negative": {
        "summary": "the FP-100c negative side — high-contrast, cool, lo-fi process look",
        "tags": COLORIST_INSTANT + ["cool", "high-contrast", "lo-fi", "creative", "fuji", "fp-100c"],
    },
    # ── Cinestill ─────────────────────────────────────────────────────
    "CineStill 50D": {
        "summary": "CineStill 50D — daylight cinema-stock colour neg, halation glow on highlights, neutral skin, classic cinematic",
        "tags": ["cinematic", "halation", "glow", "neutral", "daylight", "cinestill", "modern-film"],
    },
    "CineStill 800T": {
        "summary": "the tungsten-balanced cinema-stock — signature red halation around lights, cool ambient, neon-night urban look",
        "tags": ["cinematic", "halation", "neon", "tungsten", "night", "urban", "cool", "cinestill", "modern-film"],
    },
    # ── Agfa colour ───────────────────────────────────────────────────
    "Agfa Vista 100": {
        "summary": "warm budget colour neg — soft saturation, sunny European holiday-snapshot feel",
        "tags": ["warm", "vintage", "casual", "agfa", "vista", "sunny", "holiday", "nostalgic"],
    },
    "Agfa Vista 200": {
        "summary": "Agfa Vista 200 — warm casual colour neg, slight magenta cast, sunny",
        "tags": ["warm", "vintage", "magenta-tinted", "casual", "agfa", "vista", "sunny", "nostalgic"],
    },
    "Agfa Vista 400": {
        "summary": "high-speed Vista — visible grain, warm magenta-tint, vintage European look",
        "tags": ["warm", "vintage", "high-iso", "visible-grain", "magenta-tinted", "agfa", "vista", "nostalgic"],
    },
    "Agfa Precisa 100": {
        "summary": "Agfa Precisa 100 — neutral slide film, balanced colour, fine grain",
        "tags": ["slide", "neutral", "balanced", "fine-grain", "agfa", "precisa"],
    },
    "Agfa Ultra Color 100": {
        "summary": "Agfa Ultra Color — saturated slide film, deep blues, snappy contrast",
        "tags": ["slide", "saturated", "deep-blue", "punchy", "agfa", "ultra"],
    },
    # ── B&W stocks ────────────────────────────────────────────────────
    "Kodak Tri-X 400": {
        "summary": "the documentary classic — high contrast, gritty grain, deep blacks, news-photographer iconic",
        "tags": COLORIST_BW + ["high-contrast", "grainy", "deep-blacks", "iconic", "newspaper", "gritty", "kodak", "tri-x"],
    },
    "Kodak T-Max 3200": {
        "summary": "ultra-fast T-Max — heavy grain, low-light B&W reportage, wide tonal range",
        "tags": COLORIST_BW + ["high-iso", "grainy", "low-light", "reportage", "kodak", "tmax"],
    },
    "Ilford HP5 Plus 400": {
        "summary": "the versatile B&W workhorse — moderate contrast, smooth tonality, iconic British documentary look",
        "tags": COLORIST_BW + ["balanced", "smooth", "documentary", "iconic", "ilford", "hp5"],
    },
    "Ilford FP4 125": {
        "summary": "fine-grain Ilford B&W — smooth midtones, classic landscape and portrait B&W",
        "tags": COLORIST_BW + ["fine-grain", "smooth", "landscape", "portrait", "ilford", "fp4"],
    },
    "Ilford XP2": {
        "summary": "C-41 process B&W — chromogenic, smooth grain, low contrast, processed in colour-neg chemistry",
        "tags": COLORIST_BW + ["chromogenic", "smooth", "low-contrast", "ilford", "xp2"],
    },
    "Ilford Delta 100": {
        "summary": "fine-grain Ilford Delta — smooth tonality, modern T-grain B&W, landscape-detail",
        "tags": COLORIST_BW + ["fine-grain", "smooth", "modern", "landscape", "ilford", "delta"],
    },
    "Ilford Delta 400": {
        "summary": "balanced Ilford Delta 400 — moderate grain, modern tonality, versatile",
        "tags": COLORIST_BW + ["balanced", "modern", "ilford", "delta"],
    },
    "Ilford Delta 3200": {
        "summary": "ultra-fast Ilford Delta — heavy grain, deep blacks, gritty dim-light B&W",
        "tags": COLORIST_BW + ["high-iso", "grainy", "deep-blacks", "low-light", "gritty", "ilford", "delta"],
    },
    "Fuji Neopan Acros 100": {
        "summary": "fine-grain Fuji B&W — smooth midtones, slight magenta-cast in shadows when scanned, landscape favourite",
        "tags": COLORIST_BW + ["fine-grain", "smooth", "landscape", "fuji", "acros"],
    },
    "Fuji Neopan 1600": {
        "summary": "fast Fuji B&W — heavy grain, contrasty street-photography",
        "tags": COLORIST_BW + ["high-iso", "grainy", "contrasty", "street", "fuji", "neopan"],
    },
    "AGFA APX 100": {
        "summary": "Agfa APX 100 — fine-grain traditional B&W, neutral tonality, classic European look",
        "tags": COLORIST_BW + ["fine-grain", "neutral", "classic", "european", "agfa", "apx"],
    },
    "AGFA APX 25": {
        "summary": "Agfa APX 25 — extremely fine-grain slow B&W, ultra-smooth tonality, fine-art landscape",
        "tags": COLORIST_BW + ["extra-fine-grain", "smooth", "fine-art", "landscape", "agfa", "apx"],
    },
    "Agfa APX 100": {
        "summary": "Agfa APX 100 — fine-grain traditional B&W, neutral tonality, classic European look",
        "tags": COLORIST_BW + ["fine-grain", "neutral", "classic", "european", "agfa", "apx"],
    },
    "Agfa APX 25": {
        "summary": "Agfa APX 25 — extremely fine-grain slow B&W, ultra-smooth tonality, fine-art landscape",
        "tags": COLORIST_BW + ["extra-fine-grain", "smooth", "fine-art", "landscape", "agfa", "apx"],
    },
    "Rollei IR 400": {
        "summary": "Rollei infrared B&W — surreal foliage tones, dreamy white leaves, infrared-photography classic",
        "tags": COLORIST_BW + ["infrared", "surreal", "dreamy", "fine-art", "rollei", "ir"],
    },
    "Rollei Ortho 25": {
        "summary": "orthochromatic Rollei — slow speed, no red sensitivity, ethereal light-skin pale-lip vintage portrait look",
        "tags": COLORIST_BW + ["orthochromatic", "vintage", "ethereal", "portrait", "rollei", "ortho"],
    },
    "Rollei Retro 100 Tonal": {
        "summary": "Rollei Retro 100 Tonal — smooth tonality, fine-grain classic B&W with retro warm-tinted print feel",
        "tags": COLORIST_BW + ["fine-grain", "smooth", "vintage", "retro", "warm-toned", "rollei", "retro"],
    },
    "Rollei Retro 80s": {
        "summary": "Rollei Retro 80s — slightly warmer-toned vintage B&W with sepia-leaning shadows",
        "tags": COLORIST_BW + ["vintage", "retro", "sepia-leaning", "warm-toned", "rollei"],
    },
}


# ── Polaroid stock knowledge ───────────────────────────────────────────
POLAROID_DB: dict[str, dict] = {
    "Polaroid 669": {
        "summary": "Polaroid 669 peel-apart — soft contrast, pastel skin, faintly washed colour, '70s instant-photo nostalgia",
        "tags": COLORIST_INSTANT + ["pastel", "vintage", "soft", "70s", "peel-apart", "nostalgic"],
    },
    "Polaroid 690": {
        "summary": "Polaroid 690 — stronger saturation than 669, instant peel-apart with vivid colour pop",
        "tags": COLORIST_INSTANT + ["saturated", "vintage", "peel-apart", "nostalgic"],
    },
    "Polaroid PX-70": {
        "summary": "Polaroid PX-70 (Impossible Project) — modern recreation of SX-70, pastel mid-tones, faintly cyan shadows",
        "tags": COLORIST_INSTANT + ["pastel", "cyan-shadow", "modern-instant", "impossible", "sx-70-style"],
    },
    "Polaroid PX-680": {
        "summary": "Polaroid PX-680 (Impossible Project) — modern Polaroid 600-series instant film, slightly warmer than PX-70",
        "tags": COLORIST_INSTANT + ["pastel", "warm", "modern-instant", "impossible", "600-series"],
    },
    "Polaroid PX-100UV+": {
        "summary": "Polaroid PX-100UV+ (Impossible Project) — tungsten-balanced modern instant, cool shadow cast",
        "tags": COLORIST_INSTANT + ["cool", "blue-leaning", "tungsten", "modern-instant", "impossible"],
    },
    "Polaroid Time Zero (Expired)": {
        "summary": "expired Polaroid Time Zero — heavily faded vintage instant, lifted blacks, bleached colours, washed pastel feel — classic vintage faded look",
        "tags": COLORIST_INSTANT + ["vintage", "expired", "faded", "lifted-blacks", "bleached", "washed", "pastel", "nostalgic"],
    },
    "Polaroid Polachrome": {
        "summary": "Polaroid Polachrome — instant slide film, saturated, contrasty, vintage 80s presentation feel",
        "tags": COLORIST_INSTANT + ["slide", "saturated", "vintage", "80s", "high-contrast", "nostalgic"],
    },
    # B&W
    "Polaroid 664": {
        "summary": "Polaroid 664 — peel-apart B&W instant, balanced contrast, instant-photo grain",
        "tags": COLORIST_BW + COLORIST_INSTANT + ["peel-apart", "balanced", "polaroid"],
    },
    "Polaroid 665": {
        "summary": "Polaroid 665 — peel-apart B&W with positive and negative print, sharp documentary feel",
        "tags": COLORIST_BW + COLORIST_INSTANT + ["peel-apart", "sharp", "documentary", "polaroid"],
    },
    "Polaroid 665 Negative HC": {
        "summary": "Polaroid 665 Negative HC — high-contrast B&W instant negative, gritty newspaper feel",
        "tags": COLORIST_BW + COLORIST_INSTANT + ["high-contrast", "gritty", "newspaper", "polaroid"],
    },
    "Polaroid 667": {
        "summary": "Polaroid 667 — high-speed B&W instant peel-apart, moderate grain, low-light reportage",
        "tags": COLORIST_BW + COLORIST_INSTANT + ["high-iso", "low-light", "reportage", "polaroid"],
    },
    "Polaroid 672": {
        "summary": "Polaroid 672 — medium-speed peel-apart B&W with smooth tonality",
        "tags": COLORIST_BW + COLORIST_INSTANT + ["smooth", "balanced", "polaroid"],
    },
}


# ── Lomography ────────────────────────────────────────────────────────
LOMO_DB: dict[str, dict] = {
    "Lomography Redscale 100": {
        "summary": "Lomography Redscale — film loaded backwards, flame-orange-to-red cast across the entire image, alien sunset look",
        "tags": ["lomography", "creative", "amber", "redscale", "warm", "extreme", "alien", "sunset"],
    },
    "Lomography X-Pro Slide 200": {
        "summary": "Lomography cross-processed slide — surreal saturation, blue-green shadows, magenta highlights, lomography signature",
        "tags": ["lomography", "cross-processed", "creative", "blue-green", "magenta", "saturated", "surreal", "lo-fi"],
    },
}


# ── Variant modifier suffixes ─────────────────────────────────────────
# Maps a normalised variant token (after stripping numeric prefixes) to
# a phrase + extra tags appended to the base description.
PUSHPULL_DB: dict[str, dict] = {
    "+": {"phrase": "pushed +1 stop, slightly more contrast and grain", "tags": ["pushed", "high-contrast"]},
    "++": {"phrase": "pushed +2 stops, increased grain and contrast", "tags": ["pushed", "very-high-contrast", "grainy"]},
    "+++": {"phrase": "pushed +3 stops, heavy grain and harsh contrast", "tags": ["pushed", "extreme-contrast", "grainy"]},
    "-": {"phrase": "pulled -1 stop, softer contrast and lifted shadows", "tags": ["pulled", "low-contrast", "soft"]},
    "--": {"phrase": "pulled -2 stops, very soft, lifted shadows and washed feel", "tags": ["pulled", "very-low-contrast", "washed", "lifted-blacks"]},
    "-- ++": {"phrase": "pulled then push-developed — washed but high-contrast paradox", "tags": ["pulled", "pushed", "lifted-blacks", "high-contrast"]},
}

POLAROID_VARIANT_DB: dict[str, dict] = {
    "Cold": {"phrase": "cold variant — bluer cast, cinematic instant feel", "tags": ["cool", "blue-leaning", "cinematic"]},
    "Warm": {"phrase": "warm variant — amber cast, sunny instant feel", "tags": ["warm", "amber", "sunny"]},
}

OTHER_VARIANT_DB: dict[str, dict] = {
    "HC": {"phrase": "high-contrast variant", "tags": ["high-contrast", "punchy"]},
    "XPRO": {"phrase": "cross-processed variant — green/blue shadows, magenta highlights", "tags": ["cross-processed", "lo-fi", "lomography"]},
    "Generic": {"phrase": "", "tags": []},
}


_BRAND_DEDUP = re.compile(r"^(Agfa|Rollei|Fuji|Kodak|Polaroid|Lomography|Ilford)\s+\1\b")


def _dedup_brand(s: str) -> str:
    """Collapse 'Agfa Agfa Precisa' → 'Agfa Precisa'.

    build-luts.ts emits filmStock as `${brand} ${parsedNameFromFilename}`,
    and the parsed name often already includes the brand, producing the
    duplicated prefix. Strip it once at the start.
    """
    m = _BRAND_DEDUP.match(s)
    if m:
        return s[m.end() - len(m.group(1)) :]
    return s


def parse_filmstock(film_stock: str) -> tuple[str, list[str]]:
    """Strip variant suffixes from a film-stock string.

    Returns (canonical_base, [variant_tokens]).
    Examples:
      'Kodak Kodak Portra 400 4 ++' -> ('Kodak Portra 400', ['++'])
      'Polaroid 669 Cold 3'         -> ('Polaroid 669', ['Cold'])
      'Polaroid Time Zero (Expired) Cold 4'
                                    -> ('Polaroid Time Zero (Expired)', ['Cold'])
      'Kodak Kodak Portra 800 HC'   -> ('Kodak Portra 800', ['HC'])
      'Fuji Fuji Astia 100 Generic' -> ('Fuji Astia 100', [])
    """
    s = _dedup_brand(film_stock.strip())
    variants: list[str] = []

    # Recognise polaroid-only variants Cold/Warm
    for v in ("Cold", "Warm"):
        m = re.search(rf"\s+{v}(?:\s+\d+)?(?:\s+[-+]+)?$", s)
        if m:
            variants.append(v)
            s = s[: m.start()].strip()
            break

    # 'Generic' suffix — descriptive only, dropped silently
    if s.endswith(" Generic"):
        s = s[: -len(" Generic")].strip()

    # HC suffix
    if s.endswith(" HC"):
        variants.append("HC")
        s = s[:-3].strip()

    # XPRO suffix
    if s.endswith(" XPRO"):
        variants.append("XPRO")
        s = s[:-5].strip()

    # Push/pull suffix: trailing '++ ++', '+++', '++', '+', '-- --', '-- ++', '--', '-'
    pp_match = re.search(r"\s+(\d+\s+)?([-+]+(?:\s+[-+]+)?)\s*$", s)
    if pp_match:
        token = pp_match.group(2).strip()
        variants.append(token)
        s = s[: pp_match.start()].strip()
    else:
        # Trailing index like "Polaroid 669 3" or "Kodak Portra 400 4" — strip
        # ONLY when the remainder still contains a digit (i.e. the speed
        # number stays), OR when the trailing token is a small 1-digit index
        # (so "Time Zero (Expired) 4" → "Time Zero (Expired)" but
        # "Polaroid 669" stays — three-digit speeds aren't indices).
        ix = re.search(r"\s+(\d+)\s*$", s)
        if ix:
            stripped = s[: ix.start()].strip()
            num = ix.group(1)
            if re.search(r"\d", stripped) or len(num) == 1:
                s = stripped

    return s, variants


def lookup(film_stock: str, db: dict[str, dict]) -> dict | None:
    """Try DB hits in order: full → base-after-strip → fuzzy-suffix-trim."""
    if film_stock in db:
        return db[film_stock]
    base, _ = parse_filmstock(film_stock)
    if base in db:
        return db[base]
    return None


def compose(lut: dict) -> tuple[str, list[str]] | None:
    """Generate (description, tags) for a non-CreativePack-1 LUT.

    Returns None if we don't have knowledge — caller keeps the existing
    description rather than overwriting with a worse template.
    """
    stock = lut.get("filmStock") or ""
    bundle = lut.get("bundle", "")
    cat = lut.get("category", "")
    pp = lut.get("pushPull")  # set on RT entries by build-luts.ts

    base, variants = parse_filmstock(stock)
    # If pushPull was already extracted, prefer it
    if pp and pp not in variants:
        variants.insert(0, pp)

    # Choose knowledge base by category
    info: dict | None = None
    if "polaroid" in cat or "Polaroid" in stock:
        info = lookup(stock, POLAROID_DB) or lookup(base, POLAROID_DB)
    if info is None and ("lomography" in cat or "Lomography" in stock):
        info = lookup(stock, LOMO_DB) or lookup(base, LOMO_DB)
    if info is None:
        info = lookup(stock, FILM_DB) or lookup(base, FILM_DB)

    if info is None:
        return None

    summary = info["summary"]
    tags = list(info["tags"])

    for v in variants:
        v_clean = v.strip()
        mod = (
            POLAROID_VARIANT_DB.get(v_clean)
            or OTHER_VARIANT_DB.get(v_clean)
            or PUSHPULL_DB.get(v_clean)
        )
        if mod:
            if mod["phrase"]:
                summary += f"; {mod['phrase']}"
            tags.extend(mod["tags"])

    # Always include the original `cat` derived tags + brand/stock token
    tags.append(cat)
    tags.append(stock.lower())

    # Dedupe, drop empties, cap at 14 tags (RAG embed builder takes top 10)
    seen: set[str] = set()
    deduped: list[str] = []
    for t in tags:
        if not t:
            continue
        tl = t.lower()
        if tl in seen:
            continue
        seen.add(tl)
        deduped.append(t)

    return summary, deduped[:14]


def main() -> None:
    if not MANIFEST_PATH.exists():
        raise SystemExit(f"manifest not found: {MANIFEST_PATH}")
    manifest = json.loads(MANIFEST_PATH.read_text())
    enriched = 0
    skipped_nokb = []
    for lut in manifest["luts"]:
        # CreativePack-1 already has hand-written copy from the build script.
        if "rt-color-creativepack-1" in lut.get("id", ""):
            continue
        result = compose(lut)
        if result is None:
            skipped_nokb.append(lut["id"])
            continue
        summary, tags = result
        lut["description"] = summary
        lut["tags"] = tags
        # Drop the embedding so the next embed-luts run picks up the new copy.
        if "embedding" in lut:
            del lut["embedding"]
        enriched += 1

    # Bookkeeping: also drop top-level embedding meta so embed-luts re-runs cleanly.
    for k in ("embeddingsGeneratedAt",):
        if k in manifest:
            del manifest[k]

    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Enriched {enriched} LUT descriptions.")
    if skipped_nokb:
        print(f"Skipped (no knowledge): {len(skipped_nokb)}")
        for s in skipped_nokb[:20]:
            print(f"  - {s}")


if __name__ == "__main__":
    main()
