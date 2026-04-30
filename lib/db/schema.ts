import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  uuid,
  index,
  date,
  primaryKey,
} from "drizzle-orm/pg-core";
import type { GradingParams } from "@/lib/grading/params";

/**
 * Single Clerk user → many photos → many edits.
 * For v1 we keep just the latest edit per photo (the editor saves an
 * "edit" row each time the user hits Save). The gallery shows the most
 * recent edit per photo as the thumbnail.
 */

export const users = pgTable("users", {
  // The Clerk userId (e.g. "user_2abc...") is the primary key.
  id: text("id").primaryKey(),
  email: text("email"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Cloudinary public_id (e.g. "users/user_xxx/abc123"). */
    publicId: text("public_id").notNull(),
    filename: text("filename").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("photos_user_id_idx").on(t.userId, t.createdAt)],
);

export const edits = pgTable(
  "edits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    photoId: uuid("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    params: jsonb("params").notNull().$type<GradingParams>(),
    prompt: text("prompt"),
    title: text("title"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("edits_photo_id_idx").on(t.photoId, t.createdAt)],
);

// Per-user daily LLM call counter for the NL editor's AI fallback path.
// Keyed on (userId, day-as-UTC-YYYY-MM-DD); the route does an atomic
// upsert/increment, so no transactional logic is needed.
export const llmUsage = pgTable(
  "llm_usage",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

export type DBUser = typeof users.$inferSelect;
export type DBPhoto = typeof photos.$inferSelect;
export type DBEdit = typeof edits.$inferSelect;
export type DBLlmUsage = typeof llmUsage.$inferSelect;
