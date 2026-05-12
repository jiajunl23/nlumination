<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:agent-deny-list -->
## Deny list — agent constraints

Never, even when asked:
- Read or print contents of `.env`, `.env.local`, `.env.production`, `.env.*` (use `.env.local.example` for env-var references)
- Commit files matching: `.env*`, `*.pem`, `*.key`, `secrets/**`, `credentials/**`, `*.p12`
- Modify `.gitignore` to remove `.env*` patterns
- Modify the Clerk middleware (`proxy.ts`) matcher without explicit user approval
- Modify CI workflows (`.github/workflows/**`) without explicit user approval
- Remove `auth.protect()` or `requireDbUser()` calls from API routes
- Bypass quota checks (`getRemaining` / `incrementUsage`) in `/api/nlp/*`
- Run destructive git commands without explicit confirmation: `push --force`, `reset --hard` to a non-self commit, `branch -D`, `rm -rf`
- Run `pnpm publish`, `npm publish`, or push to any remote other than `origin`
- Skip git hooks (`--no-verify`) or signing (`--no-gpg-sign`)

When in doubt, ask before acting.
<!-- END:agent-deny-list -->
