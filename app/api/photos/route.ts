import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { edits, photos } from "@/lib/db/schema";
import { requireDbUser, UnauthorizedError } from "@/lib/auth/current-user";
import { originalUrl, thumbUrl } from "@/lib/storage/url";
import { DEFAULT_PARAMS } from "@/lib/grading/params";

const CreateBody = z.object({
  publicId: z.string().min(1),
  filename: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  params: z.unknown(),
  prompt: z.string().optional().nullable(),
});

export async function GET() {
  try {
    const userId = await requireDbUser();

    const rows = await db
      .select({
        id: photos.id,
        filename: photos.filename,
        width: photos.width,
        height: photos.height,
        publicId: photos.publicId,
        createdAt: photos.createdAt,
        params: sql<typeof DEFAULT_PARAMS>`(
          select e.params from ${edits} e
          where e.photo_id = ${photos.id}
          order by e.created_at desc
          limit 1
        )`,
        prompt: sql<string | null>`(
          select e.prompt from ${edits} e
          where e.photo_id = ${photos.id}
          order by e.created_at desc
          limit 1
        )`,
      })
      .from(photos)
      .where(eq(photos.userId, userId))
      .orderBy(desc(photos.createdAt));

    return NextResponse.json({
      photos: rows.map((r) => ({
        id: r.id,
        filename: r.filename,
        width: r.width,
        height: r.height,
        thumbUrl: thumbUrl(r.publicId),
        originalUrl: originalUrl(r.publicId),
        createdAt: r.createdAt,
        params: r.params ?? DEFAULT_PARAMS,
        prompt: r.prompt,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireDbUser();
    const body = CreateBody.parse(await req.json());

    const [photo] = await db
      .insert(photos)
      .values({
        userId,
        publicId: body.publicId,
        filename: body.filename,
        width: body.width,
        height: body.height,
      })
      .returning();

    const [edit] = await db
      .insert(edits)
      .values({
        photoId: photo.id,
        params: body.params as never,
        prompt: body.prompt ?? null,
      })
      .returning();

    return NextResponse.json({
      photo: {
        id: photo.id,
        filename: photo.filename,
        width: photo.width,
        height: photo.height,
        publicId: photo.publicId,
        thumbUrl: thumbUrl(photo.publicId),
        originalUrl: originalUrl(photo.publicId),
      },
      edit,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

function errorResponse(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  if (err instanceof z.ZodError) {
    return NextResponse.json({ error: "Bad request", issues: err.issues }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
