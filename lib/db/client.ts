import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * The Neon HTTP driver wants a URL at construction time and validates the
 * shape eagerly. To keep the project buildable without a configured
 * DATABASE_URL (e.g. in CI, or before the user sets up Neon), we hand it a
 * syntactically valid placeholder. Any actual query against this client
 * will still fail loudly — and the routes that use it return a clear
 * "DB not configured" message.
 */

const PLACEHOLDER =
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn("DATABASE_URL not set — DB calls will fail at request time");
}

const sql = neon(url ?? PLACEHOLDER);
export const db = drizzle(sql, { schema });
export const isDbConfigured = Boolean(url);
export { schema };
