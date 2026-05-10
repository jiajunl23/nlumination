#!/usr/bin/env python3
"""Apply scripts/visual-description-patches.json to public/luts/manifest.json.

Each entry in the patch JSON maps a LUT id to a new {description, tags}
based on Claude's visual inspection of lut-tour/*.jpg. The original
knowledge-base descriptions (from enrich-lut-descriptions.py) survive
for any id not in the patch. The embedding field is dropped on every
patched entry so the next embed-luts run re-embeds them.
"""
import json
from pathlib import Path

MANIFEST = Path("public/luts/manifest.json")
PATCHES = Path("scripts/visual-description-patches.json")


def main() -> None:
    manifest = json.loads(MANIFEST.read_text())
    patches = json.loads(PATCHES.read_text())
    patches.pop("_meta", None)

    by_id = {l["id"]: l for l in manifest["luts"]}
    applied = 0
    missing: list[str] = []

    for lut_id, patch in patches.items():
        lut = by_id.get(lut_id)
        if not lut:
            missing.append(lut_id)
            continue
        lut["description"] = patch["description"]
        if "tags" in patch:
            lut["tags"] = patch["tags"]
        if "embedding" in lut:
            del lut["embedding"]
        applied += 1

    # also drop top-level embedding meta so embed-luts re-runs cleanly
    manifest.pop("embeddingsGeneratedAt", None)

    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Applied {applied} visual patches.")
    if missing:
        print(f"WARNING: {len(missing)} patch ids did not match a LUT:")
        for m in missing[:10]:
            print(f"  - {m}")


if __name__ == "__main__":
    main()
