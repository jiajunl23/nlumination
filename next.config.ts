import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const projectRoot = dirname(fileURLToPath(import.meta.url));

// Hardening headers. CSP intentionally omitted here — Clerk's hosted flows
// + Next.js hydration require unsafe-inline scripts, and a strict CSP needs
// per-route testing we haven't done yet. These four are uncontroversial:
//   - X-Frame-Options=DENY    : no clickjacking via iframe embedding
//   - X-Content-Type-Options  : block MIME-type sniffing (defends served images)
//   - Referrer-Policy         : don't leak full URLs to upstream APIs
//   - Permissions-Policy      : we don't need camera/mic/geolocation/payment;
//                               denying preemptively reduces drive-by feature
//                               permission prompts.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
