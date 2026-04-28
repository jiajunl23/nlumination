# Week 1 — NLumination

> A photo-grading app that takes plain English ("moody, blue shadows, protect highlights") and moves the right Lightroom-grade sliders. Pixels never leave the browser; the prompt parser runs in <1 ms with no LLM call.

This is the first week. We started from `create-next-app` and ended with a deployed-ready app that can grade arbitrary photos through chat-style prompts, with auth, gallery persistence, and a full visual identity.

---

## What shipped

### 1. WebGL2 grading pipeline
A two-pass GPU pipeline written in custom GLSL — every adjustment a colorist would reach for, applied at the photo's native resolution on the user's device.

- **Pass 1 — grade** to an intermediate FBO sized to the image aspect: white balance, exposure, contrast, full tone (highlights / shadows / whites / blacks), HSL per band (8 hue bands × {hue, saturation, luminance}), tone curve, split-tone (shadows + highlights), vignette, optional 3D LUT layer.
- **Pass 2 — letterbox** that FBO into the visible canvas so arbitrary photo aspects render cleanly without distortion.
- Reinhard tonemap on input + inverse-Reinhard on output for a clean linear-space grade with sRGB roundtrip.
- ResizeObserver is rAF-debounced so the intermediate FBO doesn't churn during animations.

### 2. Compositional NL parser (no LLM)
A deterministic, pure-TypeScript parser that walks user input left-to-right doing longest-match against a phrase index, then composes modifiers with intents.

- **42 intents** spanning light, tone, color, effects, and named looks — covered by **101 unique surface phrases**.
- **6 modifier classes** (`very`, `really`, `subtly`, `a bit`, `less`, `no`) with **13 phrases**, attaching forward / backward / either based on position rules.
- **8 named look presets** (cinematic, film, vintage, bright & airy, moody, morning mist, cyberpunk, golden hour) that resolve to multi-slider param snapshots.
- **13 quick-pick chips** in the prompt UI for instant "I don't know what to type" recovery.
- **Smart fallback suggester** for unmatched runs — combines prefix/substring matches with character-level Levenshtein, filters out stop-words ("and", "the", "like", "make", etc.) and < 3-char tokens so connective fluff doesn't manufacture spurious "did you mean" noise, and dedupes by intent so users see three distinct ideas rather than three spellings of the same look. Threshold tightened from 0.7 → 0.55 after iteration.
- Runs in **<1 ms** per prompt. No network call. Same input → same output, every time.

### 3. Image-aware adaptive parser (Friday)
The prompt magnitudes used to be fixed (`+0.4 EV` for "brighten" regardless of the photo). Now they adapt:

- On photo upload, a 256-px CPU downsample computes mean luminance, standard deviation, mean RGB, and 5th/95th-percentile luminance — single pass, ~5 ms.
- Each intent declares an optional `adaptive` key. The parser multiplies its delta by a per-image scaler:
  - `brighten` → strong on dark photos, gentle on bright ones.
  - `warm` → muted on already-warm photos, full on cool ones.
  - `protect highlights` → full effect when there's clipping, near-zero when there isn't.
  - `crush blacks`, `lift shadows`, `more contrast`, etc. — all targeted similarly.
- Verified synthetic: `brighten` `0.40 EV` default → `0.32` on bright, `0.60` on dark; `protect highlights` `−45` → `−47` clipped, `−9` not clipped; `warm` `22` → `6.6` on sunset, `29` on cool.

### 4. Chat-style prompt UI
The prompt isn't a single input box — it's a conversation.

- User prompts render as chat bubbles. Every reply shows `applied: +0.40 EV, blue shadows, moody` derived from before/after diff plus the parser's understood-intents list.
- Each reply also surfaces `→ if you want more <look>, slide <X> <direction>` — pulled from a curated lookup keyed by intent description, so users learn which slider to reach for next.
- **Welcome message with starter examples** — the chat seeds with five clickable example prompts (cinematic, moody+blue shadows, warmer, bluer sky, bright and airy) so first-time users have an obvious starting point. Replaced the cramped chip strip that used to sit below the input.
- **`examples` command** — typing "examples", "more", "help", "ideas", or "inspire me" replies with a curated set of 14 prompts spanning looks, color, tone, and compound forms ("subtly warmer and a bit moody", "protect highlights, lift shadows") so users can see what the parser is capable of when they get stuck.
- Sliders moved into a collapsible "Adjustments" section *below* the chat, so the prompt is the primary control. Sliders are still always one click away.

### 5. Editor UX polish
Most of the week's diff was here.

- **Frame-fit animation** — when a photo loads, the canvas frame transitions from full pane size to the photo's contain-fit pixel rectangle (700 ms ease-out). The border ends up hugging the image with no letterbox bands.
- **Photo fade-in** — to avoid a mid-resize FBO-realloc blink, the photo holds opacity-0 during the frame transition and fades in only after geometry settles.
- **Sticky left pane** — when chat history grows or Adjustments is expanded, the photo stays pinned to the top of the viewport. The right column scrolls independently. No more "where did my image go" moments.
- **Smoother Adjustments expand** — bumped to 500 ms ease-out so the open/close reads as motion rather than a snap.
- **Drag-and-drop or click** — DropZone uses an explicit `<div role="button">` + `inputRef.click()` pattern (after the original `<label>` + `<input>` pair turned out to fire the picker multiple times on some browsers).
- **"Or try our sample image" button** — a small ✨ pill below the drop area fetches a 2400-px / 816 KB sample (`/public/sample.jpg`, downsized from a 4.9 MB source) and decodes it through the same path as a real upload, so first-time visitors can play with the editor without uploading anything. Frame-fit, image stats, and the parser adapter all engage automatically.
- **Multi-viewport tested** — Playwright sweep across 375 × 667 (iPhone SE), 414 × 896 (iPhone 11), 768 × 1024 (tablet), 1440 × 900 (laptop), and 1920 × 1080 (desktop). Layout splits to dual-column at the `md` breakpoint and stacks single-column below; Adjustments scroll works at every size; zero console errors.

### 6. Visual identity
- **Wordmark** — "NLumination" in a single orange → magenta gradient (matching the hero "feel." text). Replaced an earlier dot-and-mixed-case version.
- **Hero typography** — "Tell your photos how to **feel.**" with the gradient term, on a neutral display sans.
- **Atmospherics** — three slow-drifting blurred radial-gradient blobs (orange / magenta / cyan, ~25% opacity, 50–65 s loops) layered behind the entire app. Respects `prefers-reduced-motion`. Replaced earlier hero-only inline gradients so landing and editor share one ambient layer.
- **Themed Clerk auth** — sign-in and sign-up surfaces (modal + dedicated routes + the user-button popover) re-skinned via `<ClerkProvider>` `appearance` overrides. Primary button is the same orange → magenta gradient as the wordmark.

### 7. Auth, persistence, and gallery
- **Clerk** integration with both modal (`openSignIn()`) and dedicated `/sign-in` and `/sign-up` routes.
- **Neon Postgres** + **Drizzle ORM** with three tables (`users`, `photos`, `edits`). Edits are stored as parameter snapshots, so any saved edit can be re-opened and tuned further — no flattened pixels.
- **Cloudinary** for image storage and CDN (chosen over R2 / S3 for the no-credit-card free tier). Signed direct uploads from the browser, on-the-fly thumbnail transforms.
- **Gallery** at `/gallery` — server component that joins photos with their latest edit's params. Click any card to re-open it in the editor with sliders pre-set.
- **Middleware-protected routes** via Clerk: `/gallery`, `/api/photos/*`, `/api/edits/*`, `/api/uploads/*` redirect to `/sign-in` if unauthenticated.

### 8. README + hero asset
- Hero SVG (`docs/hero.svg`) with the gradient wordmark and the signature wave blobs.
- Modern README: badge row (Next.js 16, React 19, TypeScript, Tailwind v4, WebGL2), CTA links, side-by-side feature cards, prompt → render ASCII flow diagram, collapsible service-setup details, deploy-to-Vercel button.

---

## Bugs we hit and fixed

A real list, in the order they bit us:

1. **Black canvas on first upload.** `handleImage` was calling `canvasRef.current.setImage(bmp)` before the Canvas had mounted (mount was conditional on `hasImage`). Fixed by lifting the source to state and passing it as a prop, so it auto-feeds when Canvas mounts.
2. **React 19 strict-mode double-mount lost the image.** First Pipeline got `setImage` then was disposed; the new Pipeline never got fed. Same fix as above — the prop now drives state-watching effects.
3. **Image upside-down.** `UNPACK_FLIP_Y_WEBGL=true` plus a non-flipped UV in the shader. Set the unpack to false and the fragment shader samples `vec2(v_uv.x, 1.0 - v_uv.y)`.
4. **"Mask over the image" washed-out look.** `hsvToRgb(hue, 0, 1)` was returning `(1, 1, 1)` (white) when split-tone saturation was zero — flooding the photo with a white tint. Fixed by passing saturation as both `s` and `v`, so `sat=0` maps to `(0,0,0)`.
5. **Tailwind v4 `bg-[--color-X]` emits invalid CSS.** v4's arbitrary-value syntax outputs `background-color: --color-X` (literal, no `var()` wrap). Codebase-wide swap to `bg-[var(--color-X)]` fixed every transparent card and the invisible hero gradient.
6. **`.bg-waves` stripped.** Tailwind v4 purges custom CSS that isn't inside `@layer utilities`. Moved the keyframes + utility there.
7. **DropZone fired the file picker twice.** A wrapping `<label>` + bubbling `<input>` click. Replaced with `<div role="button">` + explicit `inputRef.current.click()` and `e.stopPropagation()` on the input.
8. **Image flash during frame-fit.** ResizeObserver realloc'd the FBO mid-transition, so the user saw image → blank → image. Hold the photo at `opacity-0` until the frame transition settles, then fade in.
9. **Image jumped on Adjustments expand.** When the right column outgrew the viewport, body scroll appeared and the left pane shifted. Made the left pane sticky to the viewport so it never moves.
10. **`/sign-in` redirected to `/`.** Clerk auto-redirects authenticated users away from auth routes. Working as intended; tested by signing out first.
11. **Adjustments panel couldn't scroll once expanded.** The section used `max-h-[55vh]` but `max-h` inside a flex chain doesn't give descendants a definite height — so the inner `overflow-y-auto` never bounded its content and content past the fold was unreachable. Fixed by switching to a definite `h-[55vh]` / `h-12` with `transition-[height]`, adding `shrink-0` to the header, and lifting the scroll container up to the section wrapper so SliderPanel can stay a plain column. Verified via Playwright at 5 viewport sizes — `inner.scrollHeight` (736 px content) > `inner.clientHeight` at every size.

---

## Numbers

| Surface | Count |
|---|---|
| Commits this week | 13 (incl. initial) |
| Source files added | 60+ |
| NL intents | 42 |
| NL surface phrases | 101 |
| NL modifier classes | 6 |
| Named look presets | 8 |
| In-chat examples | 5 starter / 14 on `examples` command |
| GLSL shader files | 6 (vertex + grading + tonemap helpers) |
| Adaptive scalers | 10 |
| Stop-words filtered by suggester | 50+ |
| API routes | 3 (`photos`, `edits`, `uploads`) |
| Database tables | 3 (`users`, `photos`, `edits`) |
| Public pages | 4 (`/`, `/editor`, `/gallery`, `/sign-{in,up}`) |
| Parser latency | <1 ms |
| Image-stats latency | ~5 ms (one-shot per upload) |
| Viewports tested via Playwright | 5 (375 → 1920) |
| Sample image weight | 816 KB (down from 4.9 MB original) |

---

## Where it stands at end of week 1

- The editor works end-to-end on arbitrary photo sizes and aspects.
- A signed-in user can drop a photo, type plain English, fine-tune with sliders, save, and re-open from the gallery — all of it.
- Pixels never leave the device unless the user explicitly clicks "Save to gallery" (which uploads to Cloudinary).
- Visual identity is in place — gradient wordmark, waves background, themed auth, README with hero SVG.
- The deterministic parser handles 42 intents × 6 modifiers compositionally, adapts magnitudes to the photo content, and produces clean "did you mean" suggestions for typos and unknown phrases without noise.
- First-time users land on a chat that already contains five tappable examples — no blank-canvas paralysis. Typing "examples" surfaces 14 more.
- The codebase is on `main` at `github.com/jiajunl23/nlumination`, env vars staged for Vercel deploy.

## What's next (planned but not built)

- **Vercel deploy.** `.env.production` is already staged with the nine keys that need to live in Vercel.
- **LLM integration as fallback.** Plan: parser handles the 90% of prompts that match known phrases; anything unmatched goes to either a hosted Claude Haiku call or an on-device WebGPU model (Qwen2.5-0.5B / Llama-3.2-1B via `@mlc-ai/web-llm`). Architecture decided, implementation deferred to week 2.
- **Curve UI.** The shader supports a master tone curve, but there's no UI to draw it — sliders only touch summary stats today.
- **Batch / preset library.** Save and re-apply your own looks across photos.
