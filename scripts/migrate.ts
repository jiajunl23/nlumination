/**
 * Apply Drizzle-generated migrations to the configured Neon database.
 *
 * `drizzle-kit push` requires an interactive TTY for its safety prompt;
 * this script runs the same migrations non-interactively for use in CI
 * (and from the agent shell).
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

async function main() {
  const sql = neon(url!);
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✓ Migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
