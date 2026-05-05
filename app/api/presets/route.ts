/**
 * User-saved presets ("My Looks").
 *
 *   GET  /api/presets         → list current user's presets, newest first
 *   POST /api/presets         → save current params under a name
 *
 * Built-in presets (lib/nlp/presets.ts) are separate — those are code,
 * not stored rows. This route owns only the user-authored slice.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userPresets } from "@/lib/db/schema";
import { requireDbUser, UnauthorizedError } from "@/lib/auth/current-user";
import type { GradingParams } from "@/lib/grading/params";

const Body = z.object({
  name: z.string().trim().min(1).max(60),
  params: z.unknown(),
});

const PER_USER_LIMIT = 50;

export async function GET() {
  try {
    const userId = await requireDbUser();
    const rows = await db
      .select()
      .from(userPresets)
      .where(eq(userPresets.userId, userId))
      .orderBy(desc(userPresets.createdAt))
      .limit(PER_USER_LIMIT);
    return NextResponse.json({ presets: rows });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("/api/presets GET", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireDbUser();
    const body = Body.parse(await req.json());

    // Soft cap: 50 presets per user. Past that, oldest is evicted to keep
    // the row count bounded without a hard "you've hit the limit" UX.
    const existing = await db
      .select({ id: userPresets.id, createdAt: userPresets.createdAt })
      .from(userPresets)
      .where(eq(userPresets.userId, userId))
      .orderBy(desc(userPresets.createdAt));
    if (existing.length >= PER_USER_LIMIT) {
      const oldest = existing[existing.length - 1];
      await db.delete(userPresets).where(eq(userPresets.id, oldest.id));
    }

    const [row] = await db
      .insert(userPresets)
      .values({
        userId,
        name: body.name,
        params: body.params as GradingParams,
      })
      .returning();
    return NextResponse.json({ preset: row });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Bad request", issues: err.issues },
        { status: 400 },
      );
    }
    console.error("/api/presets POST", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
