# NLumination

A web-based color grading tool that lets anyone transform their photos using
natural language prompts. Lightroom-grade controls, no plugin to install,
and the smart-prompt parser runs entirely in the browser — no LLM call.

## Stack

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind v4
- **Auth**: Clerk
- **Database**: Neon (serverless Postgres) via Drizzle ORM
- **Storage**: Cloudinary (image CDN + transformations, free 25 GB no card)
- **Image processing**: WebGL2 (custom GLSL, all client-side)
- **NL parser**: in-house multi-intent compositional parser (zh + en)

## Local development

```bash
pnpm install
cp .env.local.example .env.local   # then fill in keys
pnpm db:push                        # apply schema to your Neon DB
pnpm dev
```

Open <http://localhost:3000>.

If `.env.local` is missing, Clerk falls back to keyless mode (a temporary
development app is created automatically). Saving to gallery requires real
Neon + R2 credentials.

## Service setup

### Clerk

1. Create an app at <https://dashboard.clerk.com>.
2. Copy the publishable + secret keys into `.env.local`.
3. (Optional) Configure a webhook on `user.created` pointing to
   `/api/webhooks/clerk` for eager DB user creation. The app also creates
   the row lazily if the webhook hasn't fired.

### Neon

1. Create a project at <https://console.neon.tech>.
2. Copy the **pooled** connection string (with `?sslmode=require`) into
   `DATABASE_URL`.
3. Run `pnpm db:push` to create the `users`, `photos`, `edits` tables.

### Cloudinary

1. Create a free account at <https://cloudinary.com> (no credit card required).
2. From the **Dashboard** copy the **Cloud name**, **API Key**, and
   **API Secret**, and paste them into `CLOUDINARY_CLOUD_NAME`,
   `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Set
   `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` to the same cloud name (the public
   one is used by the gallery to construct image URLs).
3. No CORS / bucket / public-read setup needed — Cloudinary serves
   uploaded images publicly via `https://res.cloudinary.com/{cloud_name}/...`
   by default, and applies the `c_limit,w_720,q_auto,f_auto` transform
   on the fly for gallery thumbnails.

The free Programmable Media plan gives you 25 GB storage, 25 GB monthly
bandwidth, and 25,000 transformations. When you hit a limit Cloudinary
stops serving (no surprise bills) — exactly what we want.

## Useful scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Local dev server (Turbopack). |
| `pnpm build` / `pnpm start` | Production build / start. |
| `pnpm db:generate` | Drizzle: generate a migration from schema diff. |
| `pnpm db:push` | Drizzle: push current schema to the configured DB. |
| `pnpm db:studio` | Open Drizzle Studio (web DB viewer). |
| `pnpm test:parser` | Smoke-test the NL parser with built-in cases. |

## Keyboard shortcuts (editor)

| Key | Action |
|---|---|
| `B` (hold) | View original (release to return to graded) |
| `⌘/Ctrl + S` | Save edit to gallery |
| `⌘/Ctrl + E` | Export current grade as JPG |

## Deployment

Vercel works out of the box. Set the same env vars in the project settings
and connect the repo. The `proxy.ts` (Clerk middleware) is deployed
automatically.
