import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { edits, photos } from "@/lib/db/schema";
import { thumbUrl } from "@/lib/storage/url";
import { DEFAULT_PARAMS, type GradingParams } from "@/lib/grading/params";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";
import styles from "@/components/gallery/gallery.module.css";

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

  const count = photoList.length;

  return (
    <div className="relative flex flex-1 flex-col">
      {/* Page-level atmosphere — sits behind the header + main, on top of
          the shared .bg-waves but below content. Pure CSS, no JS. */}
      <div className={styles.atmosphere} aria-hidden="true">
        <div className={styles.atmosphereTop} />
        <div className={styles.atmosphereHalo} />
        <div className={styles.atmospherePattern} />
      </div>

      <header className="relative z-10 flex items-center justify-between border-b border-[var(--color-border)]/60 bg-[color-mix(in_oklab,var(--color-bg-elev-1)_60%,transparent)] px-6 py-3 backdrop-blur-md">
        <Link
          href="/"
          className="bg-gradient-to-r from-[var(--color-accent)] via-[var(--color-accent-glow)] to-[var(--color-magenta)] bg-clip-text text-base font-semibold leading-none tracking-tight text-transparent transition hover:opacity-90"
        >
          NLumination
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/editor"
            className="text-xs text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]"
          >
            Editor
          </Link>
          <UserButton />
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-6 pb-16 pt-10 md:px-8">
        <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elev-1)]/80 px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--color-fg-muted)] backdrop-blur">
              Your library
            </div>
            <h1 className="text-3xl font-medium leading-[1.1] tracking-tight md:text-4xl">
              <span className="bg-gradient-to-r from-[var(--color-accent)] via-[var(--color-accent-glow)] to-[var(--color-magenta)] bg-clip-text text-transparent">
                Gallery
              </span>
            </h1>
            <p className="mt-2 max-w-xl text-sm text-[var(--color-fg-muted)]">
              Every photo you&rsquo;ve graded, with its latest look baked in.
              Tap any card to keep refining.
            </p>
          </div>

          {count > 0 && (
            <div className="flex items-center gap-2 text-xs text-[var(--color-fg-muted)]">
              <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elev-1)]/70 px-3 py-1 backdrop-blur">
                {count} {count === 1 ? "photo" : "photos"}
              </span>
              <Link
                href="/editor"
                className="rounded-full bg-[var(--color-fg)] px-3 py-1 font-medium text-[var(--color-bg)] transition hover:opacity-90"
              >
                + New edit
              </Link>
            </div>
          )}
        </div>

        <GalleryGrid initial={photoList} />
      </main>
    </div>
  );
}
