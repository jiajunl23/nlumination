import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js convention: load .env.local first, then .env as fallback.
config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
