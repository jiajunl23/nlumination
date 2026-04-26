<div align="center">

# NLumination

**Tell your photos how to feel.**

Natural-language color grading in the browser. Type a sentence, get a Lightroom-grade edit.

[**Try it →**](https://nlumination.app)  ·  [Editor](https://nlumination.app/editor)  ·  [Gallery](https://nlumination.app/gallery)

</div>

---

## What it does

You upload a photo. You type something like:

> *moody, blue shadows, protect highlights*

NLumination parses that into pro adjustments — exposure, white balance, tone curve, HSL, split-tone — and renders the result on a WebGL2 pipeline at full resolution, on your device. No upload, no LLM call, no waiting.

Then you fine-tune with sliders. Or you don't. Either is fine.

## Why it's different

- **Compositional intent parser.** Not a keyword lookup. Phrases compose: *"slightly warmer, less contrast in the shadows, push the blues toward teal"* moves four sliders, not one.
- **Pixels stay on your device.** Decoding, grading, and preview all happen client-side via WebGL2. The only thing that ever leaves your machine is a JPEG you explicitly chose to save.
- **Pro controls behind plain language.** Every prompt resolves to the same parameter set a colorist would reach for: WB, exposure, contrast, tone, HSL per-channel, curves, split-tone, vignette, optional 3D LUT.
- **Reversible by design.** Edits are stored as parameter deltas, not flattened pixels. You can re-open any saved edit and keep grading.

## A taste

| Prompt | What moves |
|---|---|
| `cinematic teal & orange` | Split-tone shadows → teal, highlights → orange; subtle contrast bump |
| `golden hour, soft` | WB warmer; clarity down; lift shadows; soft S-curve |
| `crush the blacks, keep skin warm` | Black point down; HSL orange luminance preserved |
| `desaturate everything except the red dress` | Global saturation down; HSL red saturation up |

## Quickstart

```bash
pnpm install
cp .env.local.example .env.local   # then fill in keys
pnpm db:push                        # apply schema to your Neon DB
pnpm dev
```

Open <http://localhost:3000>. If `.env.local` is missing, Clerk runs in keyless dev mode — saving to the gallery requires real credentials.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) · React 19 · TypeScript |
| Styling | Tailwind v4 |
| Auth | Clerk |
| Database | Neon (serverless Postgres) + Drizzle ORM |
| Storage | Cloudinary (image CDN + transformations) |
| Pixels | WebGL2 / custom GLSL — fully client-side |
| Prompts | In-house compositional NL parser (no LLM) |

## Service setup

<details>
<summary><strong>Clerk</strong></summary>

1. Create an app at <https://dashboard.clerk.com>.
2. Copy the publishable + secret keys into `.env.local`.
3. (Optional) Add a webhook on `user.created` pointing to `/api/webhooks/clerk` for eager DB user creation. The app also creates the row lazily if the webhook hasn't fired.

</details>

<details>
<summary><strong>Neon</strong></summary>

1. Create a project at <https://console.neon.tech>.
2. Copy the **pooled** connection string (with `?sslmode=require`) into `DATABASE_URL`.
3. Run `pnpm db:push` to create the `users`, `photos`, `edits` tables.

</details>

<details>
<summary><strong>Cloudinary</strong></summary>

1. Create a free account at <https://cloudinary.com> (no credit card required).
2. From the **Dashboard** copy the **Cloud name**, **API Key**, and **API Secret**, and paste them into `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Set `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` to the same cloud name.
3. No CORS or bucket setup needed. Free tier: 25 GB storage, 25 GB monthly bandwidth, 25k transformations. When you hit a limit Cloudinary stops serving — no surprise bills.

</details>

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Local dev server (Turbopack). |
| `pnpm build` · `pnpm start` | Production build / start. |
| `pnpm db:generate` | Drizzle: generate a migration from the schema diff. |
| `pnpm db:push` | Drizzle: push current schema to the configured DB. |
| `pnpm db:studio` | Open Drizzle Studio. |
| `pnpm test:parser` | Smoke-test the NL parser with built-in cases. |

## Keyboard shortcuts

| Key | Action |
|---|---|
| `B` (hold) | View original — release to return to graded |
| `⌘ / Ctrl + S` | Save edit to gallery |
| `⌘ / Ctrl + E` | Export current grade as JPG |

## Deployment

Vercel works out of the box. Set the same env vars in the project settings and connect the repo. The Clerk middleware (`proxy.ts`) is deployed automatically.

---

<div align="center">

Built for photographers who'd rather describe a feeling than chase a slider.

</div>
