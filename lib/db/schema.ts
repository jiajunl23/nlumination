import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  uuid,
  index,
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

export type DBUser = typeof users.$inferSelect;
export type DBPhoto = typeof photos.$inferSelect;
export type DBEdit = typeof edits.$inferSelect;
