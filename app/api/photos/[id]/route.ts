import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { edits, photos } from "@/lib/db/schema";
import { requireDbUser, UnauthorizedError } from "@/lib/auth/current-user";
import { originalUrl, thumbUrl } from "@/lib/storage/url";
import { cloudinary } from "@/lib/storage/cloudinary";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const userId = await requireDbUser();
    const { id } = await params;

    const [photo] = await db
      .select()
      .from(photos)
      .where(and(eq(photos.id, id), eq(photos.userId, userId)))
      .limit(1);
    if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const photoEdits = await db
      .select()
      .from(edits)
      .where(eq(edits.photoId, photo.id))
      .orderBy(desc(edits.createdAt));

    return NextResponse.json({
      photo: {
        id: photo.id,
        filename: photo.filename,
        width: photo.width,
        height: photo.height,
        publicId: photo.publicId,
        thumbUrl: thumbUrl(photo.publicId),
        originalUrl: originalUrl(photo.publicId),
        createdAt: photo.createdAt,
      },
      edits: photoEdits,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const userId = await requireDbUser();
    const { id } = await params;

    const [photo] = await db
      .select()
      .from(photos)
      .where(and(eq(photos.id, id), eq(photos.userId, userId)))
      .limit(1);
    if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Best-effort: drop the Cloudinary asset, then the DB row regardless.
    await cloudinary.uploader
      .destroy(photo.publicId, { invalidate: true })
      .catch((err) => console.warn("cloudinary destroy failed", err));
    await db.delete(photos).where(eq(photos.id, photo.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

function errorResponse(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
