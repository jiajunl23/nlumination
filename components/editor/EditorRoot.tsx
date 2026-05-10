"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import {
  ChevronDown,
  Cloud,
  Download,
  Loader2,
  RotateCcw,
  Sliders,
} from "lucide-react";
import { Canvas, type CanvasHandle } from "./Canvas";
import { DropZone } from "./DropZone";
import { SliderPanel } from "./SliderPanel";
import { BeforeAfterToggle } from "./BeforeAfterToggle";
import { ChatPanel } from "./ChatPanel";
import { DEFAULT_PARAMS, type GradingParams } from "@/lib/grading/params";
import { loadHaldClutByLutId } from "@/lib/webgl/hald-clut";
import { computeImageStats, type ImageStats } from "@/lib/grading/imageStats";
import {
  uploadAndCreatePhoto,
  uploadRenderedAsPhoto,
} from "@/lib/storage/upload";
import { originalUrl } from "@/lib/storage/url";
import { cn } from "@/lib/utils";
import editorStyles from "./editor.module.css";

export function EditorRoot() {
  const router = useRouter();
  const search = useSearchParams();
  const { isSignedIn } = useAuth();

  const canvasRef = useRef<CanvasHandle | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const [source, setSource] = useState<ImageBitmap | null>(null);
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  const [imageVisible, setImageVisible] = useState(false);
  const [stats, setStats] = useState<ImageStats | null>(null);
  const [params, setParams] = useState<GradingParams>(DEFAULT_PARAMS);
  const [hasImage, setHasImage] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);
  const [photoId, setPhotoId] = useState<string | null>(null);
  // Public Cloudinary CDN URL for the current photo, when one exists.
  // Null for fresh-uploads-not-yet-saved. ChatPanel uses this for the
  // VLM image analyst — saved photos get the cheap CDN path; fresh
  // uploads get downsampled-to-base64 client-side.
  const [cloudinaryUrl, setCloudinaryUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [adjustmentsOpen, setAdjustmentsOpen] = useState(false);

  const isPristine = params === DEFAULT_PARAMS;
  const renderParams = showOriginal ? DEFAULT_PARAMS : params;

  const handleImage = useCallback((bmp: ImageBitmap, file: File) => {
    setSource(bmp);
    setHasImage(true);
    setFilename(file.name);
    setPhotoId(null);
    setCloudinaryUrl(null);
  }, []);

  // Track the LUT id currently uploaded to the WebGL pipeline so we can
  // skip re-decoding when only lutOpacity changes (params.lutId unchanged).
  // Reset when the source image changes (loading a new photo wipes GL state).
  const appliedLutIdRef = useRef<string | null>(null);

  // Watch params.lutId — when the AI selects a new LUT seed, fetch the
  // HaldCLUT PNG, decode to CubeLut, and push to the WebGL pipeline.
  // Failures are logged but never throw — the slider stage still runs.
  useEffect(() => {
    const lutId = params.lutId;
    if (lutId === appliedLutIdRef.current) return;
    if (!canvasRef.current) return;
    if (!lutId) {
      canvasRef.current.setLut(null);
      appliedLutIdRef.current = null;
      return;
    }
    let cancelled = false;
    loadHaldClutByLutId(lutId)
      .then((lut) => {
        if (cancelled) return;
        canvasRef.current?.setLut(lut);
        appliedLutIdRef.current = lutId;
      })
      .catch((err) => {
        console.error(`[lut-load] ${lutId}:`, err);
        // Soft-fall: leave previous LUT in place rather than wiping it.
      });
    return () => {
      cancelled = true;
    };
  }, [params.lutId]);

  // Image stats — feed the NL parser so prompts adapt to the photo
  // (a "brighten" on a bright photo becomes gentle, "warm" on a sunset
  // doesn't push past believable, etc.). Cheap CPU pass; ~5 ms.
  useEffect(() => {
    if (!source) {
      setStats(null);
      return;
    }
    let aborted = false;
    computeImageStats(source)
      .then((s) => {
        if (!aborted) setStats(s);
      })
      .catch(() => {
        if (!aborted) setStats(null);
      });
    return () => {
      aborted = true;
    };
  }, [source]);

  // Frame-fit + resize gating. The inner frame animates to the image's
  // contain-fit pixel size (CSS transition on width/height). The image fades
  // in only after the frame has been quiet for ~800 ms — covers the initial
  // load *and* viewport resizes (each ResizeObserver tick re-hides + re-arms
  // the reveal), so the user never sees the WebGL canvas blink mid-resize.
  useLayoutEffect(() => {
    if (!source || !paneRef.current) {
      setFrame(null);
      setImageVisible(false);
      return;
    }
    setFrame(null);
    setImageVisible(false);

    let lastFrame: { w: number; h: number } | null = null;
    let revealTimer: ReturnType<typeof setTimeout> | null = null;
    const armReveal = () => {
      if (revealTimer) clearTimeout(revealTimer);
      revealTimer = setTimeout(() => setImageVisible(true), 800);
    };

    const compute = () => {
      const el = paneRef.current;
      if (!el) return;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (!cw || !ch) return;
      const iAR = source.width / source.height;
      const cAR = cw / ch;
      const next = iAR > cAR ? { w: cw, h: cw / iAR } : { w: ch * iAR, h: ch };
      // Sub-pixel changes don't move anything visible — leave state alone so
      // a subtle ResizeObserver tick doesn't re-trigger the fade.
      if (
        lastFrame &&
        Math.abs(lastFrame.w - next.w) < 0.5 &&
        Math.abs(lastFrame.h - next.h) < 0.5
      ) {
        return;
      }
      lastFrame = next;
      setFrame(next);
      setImageVisible(false);
      armReveal();
    };

    const raf1 = requestAnimationFrame(() => requestAnimationFrame(compute));
    const ro = new ResizeObserver(compute);
    ro.observe(paneRef.current);
    return () => {
      cancelAnimationFrame(raf1);
      if (revealTimer) clearTimeout(revealTimer);
      ro.disconnect();
    };
  }, [source]);

  // Hydrate from a saved photo (e.g. /editor?photoId=xxx).
  useEffect(() => {
    const id = search.get("photoId");
    if (!id || photoId === id) return;
    let aborted = false;
    setLoading(true);
    (async () => {
      try {
        const r = await fetch(`/api/photos/${id}`);
        if (!r.ok) throw new Error(`load: ${r.status}`);
        const data = (await r.json()) as {
          photo: { originalUrl: string; filename: string };
          edits: { params: GradingParams }[];
        };
        const blob = await fetch(data.photo.originalUrl).then((res) => res.blob());
        const bmp = await createImageBitmap(blob);
        if (aborted) return;
        setSource(bmp);
        setHasImage(true);
        setFilename(data.photo.filename);
        setPhotoId(id);
        setCloudinaryUrl(data.photo.originalUrl);
        const latestEdit = data.edits[0];
        if (latestEdit) setParams(latestEdit.params);
      } catch (err) {
        if (!aborted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [search, photoId]);

  const onExport = async () => {
    if (!canvasRef.current) return;
    setExporting(true);
    try {
      const blob = await canvasRef.current.exportBlob("image/jpeg", 0.95);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        (filename ?? "image").replace(/\.[^.]+$/, "") + "-graded.jpg";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      // Hold-to-show-original (B)
      if (!inField && (e.key === "b" || e.key === "B")) {
        if (!e.repeat) setShowOriginal(true);
      }
      // Cmd/Ctrl + S → save
      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        if (hasImage && isSignedIn && !saving) void onSave();
      }
      // Cmd/Ctrl + E → export
      if ((e.metaKey || e.ctrlKey) && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        if (hasImage && !exporting) void onExport();
      }
    };
    const release = (e: KeyboardEvent) => {
      if (e.key === "b" || e.key === "B") setShowOriginal(false);
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("keyup", release);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("keyup", release);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasImage, isSignedIn, saving, exporting, photoId, params]);

  // Each save is a *new* gallery entry with the edit baked into the
  // pixels. Render the canvas → JPEG → upload as its own photo. The DB
  // row stores DEFAULT_PARAMS so PhotoCard's WebGL pipeline renders it
  // as a no-op (no double-application). Original photos saved before
  // this change keep their stored params and continue rendering live.
  const onSave = async () => {
    if (!source || !filename || !canvasRef.current) return;
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      let blob: Blob;
      try {
        blob = await canvasRef.current.exportBlob("image/jpeg", 0.92);
      } catch {
        // Fallback: encode the source ImageBitmap (raw, no edits). Should
        // be rare — only fires if the WebGL canvas isn't ready.
        const result = await uploadAndCreatePhoto({
          source,
          filename,
          params,
          prompt: null,
        });
        setInfo("Added to gallery");
        if (!photoId) {
          setPhotoId(result.photo.id);
          setCloudinaryUrl(originalUrl(result.photo.publicId));
          const url = new URL(window.location.href);
          url.searchParams.set("photoId", result.photo.id);
          router.replace(url.pathname + url.search);
        }
        return;
      }

      const baseName = filename.replace(/\.[^.]+$/, "");
      const versionName = `${baseName}-edit-${Date.now()}.jpg`;
      const result = await uploadRenderedAsPhoto({
        blob,
        filename: versionName,
        width: source.width,
        height: source.height,
        params: DEFAULT_PARAMS,
        prompt: null,
      });
      setInfo("Saved new version to gallery");
      // Don't redirect — keep user in the current editing session so
      // they can keep iterating and save more versions.
      void result;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid min-h-[calc(100vh-5rem)] flex-1 grid-cols-1 gap-4 p-4 md:grid-cols-[minmax(0,1fr)_380px] md:items-start">
      {/* Canvas pane: outer always fills the grid column; inner frame
          animates width/height to contain-fit the photo so the border
          hugs the image (no letterbox bands once settled). On md+ it
          stays sticky to the viewport so a tall right column never
          pushes the image above the fold. */}
      <div
        ref={paneRef}
        className="flex min-h-[480px] min-w-0 items-center justify-center md:sticky md:top-4 md:h-[calc(100vh-5rem)] md:max-h-[calc(100vh-5rem)]"
      >
        <div
          className={cn(
            "relative flex flex-col overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--color-accent)_8%,var(--color-border))] transition-[width,height] duration-700 ease-out",
            // Frame-fit (image loaded) — keep solid so the photo border
            // stays clean. DropZone state — gradient lets bg-waves bleed.
            frame
              ? "bg-[var(--color-bg-elev-1)]"
              : editorStyles.canvasFrame,
          )}
          style={
            frame
              ? { width: frame.w, height: frame.h }
              : { width: "100%", height: "100%" }
          }
        >
          {loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--color-bg)]/70 text-sm text-[var(--color-fg-muted)]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading photo…
            </div>
          )}
          {hasImage ? (
            <div
              className={cn(
                "absolute inset-0 transition-opacity duration-500 ease-out",
                imageVisible ? "opacity-100" : "opacity-0",
              )}
            >
              <Canvas
                ref={canvasRef}
                source={source}
                params={renderParams}
                className="absolute inset-0 h-full w-full"
                onError={(e) => setError(e.message)}
              />
              <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
                <BeforeAfterToggle
                  active={showOriginal}
                  onChange={setShowOriginal}
                />
                {filename && (
                  <span className="rounded-full bg-[var(--color-bg)]/60 px-3 py-1 text-xs text-[var(--color-fg-muted)] backdrop-blur">
                    {filename}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="absolute inset-6">
              <DropZone onImage={handleImage} />
            </div>
          )}
        </div>
      </div>

      {/* Right column: chat panel + collapsible sliders + save */}
      <aside className="flex flex-col gap-3">
        <ChatPanel
          params={params}
          onParams={setParams}
          stats={stats}
          source={source}
          cloudinaryUrl={cloudinaryUrl}
          layoutNonce={adjustmentsOpen ? 1 : 0}
          className="min-h-[280px] flex-1"
        />

        {/* Collapsible Adjustments */}
        <section
          className={cn(
            "flex shrink-0 flex-col overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--color-accent)_7%,var(--color-border))] transition-[height] duration-500 ease-out [will-change:height]",
            editorStyles.panelSolid,
            adjustmentsOpen ? "h-[55vh]" : "h-12",
          )}
        >
          <header className="flex shrink-0 items-center justify-between border-b border-[color-mix(in_oklab,var(--color-accent)_8%,var(--color-border))]/70 px-4 py-3">
            <button
              type="button"
              onClick={() => setAdjustmentsOpen((v) => !v)}
              className="flex flex-1 items-center gap-2 text-left text-sm font-medium text-[var(--color-fg)]"
              aria-expanded={adjustmentsOpen}
            >
              <Sliders className="h-4 w-4 text-[var(--color-accent)]" />
              Adjustments
              <ChevronDown
                className={cn(
                  "ml-1 h-4 w-4 text-[var(--color-fg-muted)] transition-transform",
                  adjustmentsOpen ? "rotate-0" : "-rotate-90",
                )}
              />
            </button>
            <button
              disabled={isPristine}
              onClick={() => setParams(DEFAULT_PARAMS)}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]",
                isPristine && "pointer-events-none opacity-30",
              )}
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          </header>
          {adjustmentsOpen && (
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              <SliderPanel params={params} onChange={setParams} />
            </div>
          )}
        </section>

        {/* Save / export */}
        <footer
          className={cn(
            "flex shrink-0 flex-col gap-2 rounded-2xl border border-[color-mix(in_oklab,var(--color-accent)_7%,var(--color-border))] px-4 py-3",
            editorStyles.panelSolid,
            editorStyles.footerSpotlight,
          )}
        >
          {isSignedIn && (
            <button
              disabled={!hasImage || saving}
              onClick={onSave}
              className="flex items-center justify-center gap-2 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg-elev-2)] px-4 py-2 text-sm font-medium text-[var(--color-fg)] transition disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[var(--color-bg-elev-3)]"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Cloud className="h-4 w-4" />
              )}
              {saving ? "Saving…" : "Save to gallery"}
            </button>
          )}
          <button
            disabled={!hasImage || exporting}
            onClick={onExport}
            className="flex items-center justify-center gap-2 rounded-xl bg-[var(--color-fg)] px-4 py-2 text-sm font-medium text-[var(--color-bg)] transition disabled:cursor-not-allowed disabled:opacity-40 hover:opacity-90"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {exporting ? "Exporting…" : "Export JPG"}
          </button>
          {info && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-300">
              {info}
            </div>
          )}
          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </footer>
      </aside>
    </div>
  );
}
