import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { edits, photos } from "@/lib/db/schema";
import { thumbUrl } from "@/lib/storage/url";
import { DEFAULT_PARAMS, type GradingParams } from "@/lib/grading/params";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  const { userId } = await auth.protect();

  const rows = await db
    .select({
      id: photos.id,
      filename: photos.filename,
      width: photos.width,
      height: photos.height,
      publicId: photos.publicId,
      createdAt: photos.createdAt,
      latestEditParams: sql<GradingParams>`(
        select e.params from ${edits} e
        where e.photo_id = ${photos.id}
        order by e.created_at desc
        limit 1
      )`,
    })
    .from(photos)
    .where(eq(photos.userId, userId))
    .orderBy(desc(photos.createdAt));

  const photoList = rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    width: r.width,
    height: r.height,
    thumbUrl: thumbUrl(r.publicId),
    params: r.latestEditParams ?? DEFAULT_PARAMS,
  }));

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-[--color-border] bg-[--color-bg-elev-1] px-6 py-3">
        <Link href="/" className="flex items-center gap-2 text-sm font-medium tracking-tight">
          <span className="inline-block h-2 w-2 rounded-full bg-[--color-accent] shadow-[0_0_10px_var(--color-accent-glow)]" />
          N<span className="text-[--color-accent]">L</span>umination
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/editor"
            className="text-xs text-[--color-fg-muted] transition hover:text-[--color-fg]"
          >
            Editor
          </Link>
          <UserButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 p-6">
        <h1 className="mb-1 text-2xl font-medium tracking-tight">Gallery</h1>
        <p className="mb-6 text-sm text-[--color-fg-muted]">
          Your saved edits. Tap any card to keep refining it.
        </p>
        <GalleryGrid initial={photoList} />
      </main>
    </div>
  );
}
