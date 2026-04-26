import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { edits, photos } from "@/lib/db/schema";
import { requireDbUser, UnauthorizedError } from "@/lib/auth/current-user";

const Body = z.object({
  photoId: z.uuid(),
  params: z.unknown(),
  prompt: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const userId = await requireDbUser();
    const body = Body.parse(await req.json());

    // Verify ownership
    const [photo] = await db
      .select({ id: photos.id })
      .from(photos)
      .where(and(eq(photos.id, body.photoId), eq(photos.userId, userId)))
      .limit(1);
    if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [edit] = await db
      .insert(edits)
      .values({
        photoId: body.photoId,
        params: body.params as never,
        prompt: body.prompt ?? null,
        title: body.title ?? null,
      })
      .returning();

    return NextResponse.json({ edit });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Bad request", issues: err.issues }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
