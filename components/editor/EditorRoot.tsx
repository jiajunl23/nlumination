"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Cloud, Download, Loader2, RotateCcw, Sliders } from "lucide-react";
import { Canvas, type CanvasHandle } from "./Canvas";
import { DropZone } from "./DropZone";
import { SliderPanel } from "./SliderPanel";
import { BeforeAfterToggle } from "./BeforeAfterToggle";
import { PromptBar } from "./PromptBar";
import { DEFAULT_PARAMS, type GradingParams } from "@/lib/grading/params";
import { saveEdit, uploadAndCreatePhoto } from "@/lib/storage/upload";
import { cn } from "@/lib/utils";

export function EditorRoot() {
  const router = useRouter();
  const search = useSearchParams();
  const { isSignedIn } = useAuth();

  const canvasRef = useRef<CanvasHandle | null>(null);
  const [source, setSource] = useState<ImageBitmap | null>(null);
  const [params, setParams] = useState<GradingParams>(DEFAULT_PARAMS);
  const [hasImage, setHasImage] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const isPristine = params === DEFAULT_PARAMS;
  const renderParams = showOriginal ? DEFAULT_PARAMS : params;

  const handleImage = useCallback((bmp: ImageBitmap, file: File) => {
    setSource(bmp);
    setHasImage(true);
    setFilename(file.name);
    setPhotoId(null);
  }, []);

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

  const onSave = async () => {
    if (!source || !filename) return;
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      if (photoId) {
        await saveEdit({ photoId, params, prompt: null });
        setInfo("Saved");
      } else {
        const result = await uploadAndCreatePhoto({
          source,
          filename,
          params,
          prompt: null,
        });
        setPhotoId(result.photo.id);
        const url = new URL(window.location.href);
        url.searchParams.set("photoId", result.photo.id);
        router.replace(url.pathname + url.search);
        setInfo("Added to gallery");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid flex-1 grid-cols-1 gap-4 p-4 md:grid-cols-[minmax(0,1fr)_340px]">
      {/* Canvas pane */}
      <div className="flex min-w-0 flex-col gap-3">
        <div className="relative flex min-h-[480px] flex-1 flex-col overflow-hidden rounded-2xl border border-[--color-border] bg-[--color-bg-elev-1]">
          {loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[--color-bg]/70 text-sm text-[--color-fg-muted]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading photo…
            </div>
          )}
          {hasImage ? (
            <>
              <Canvas
                ref={canvasRef}
                source={source}
                params={renderParams}
                className="absolute inset-0"
                onError={(e) => setError(e.message)}
              />
              <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
                <BeforeAfterToggle
                  active={showOriginal}
                  onChange={setShowOriginal}
                />
                {filename && (
                  <span className="rounded-full bg-[--color-bg]/60 px-3 py-1 text-xs text-[--color-fg-muted] backdrop-blur">
                    {filename}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="absolute inset-6">
              <DropZone onImage={handleImage} />
            </div>
          )}
        </div>
        <PromptBar params={params} onParams={setParams} />
      </div>

      {/* Right panel */}
      <aside className="flex max-h-[60vh] flex-col overflow-hidden rounded-2xl border border-[--color-border] bg-[--color-bg-elev-1] md:max-h-none">
        <header className="flex items-center justify-between border-b border-[--color-border]/60 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sliders className="h-4 w-4 text-[--color-accent]" />
            Adjustments
          </div>
          <button
            disabled={isPristine}
            onClick={() => setParams(DEFAULT_PARAMS)}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[--color-fg-muted] transition hover:text-[--color-fg]",
              isPristine && "pointer-events-none opacity-30",
            )}
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        </header>

        <SliderPanel params={params} onChange={setParams} />

        <footer className="flex flex-col gap-2 border-t border-[--color-border]/60 px-4 py-3">
          {isSignedIn && (
            <button
              disabled={!hasImage || saving}
              onClick={onSave}
              className="flex items-center justify-center gap-2 rounded-xl border border-[--color-border-strong] bg-[--color-bg-elev-2] px-4 py-2 text-sm font-medium text-[--color-fg] transition disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[--color-bg-elev-3]"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Cloud className="h-4 w-4" />
              )}
              {saving
                ? "Saving…"
                : photoId
                ? "Save edit"
                : "Save to gallery"}
            </button>
          )}
          <button
            disabled={!hasImage || exporting}
            onClick={onExport}
            className="flex items-center justify-center gap-2 rounded-xl bg-[--color-fg] px-4 py-2 text-sm font-medium text-[--color-bg] transition disabled:cursor-not-allowed disabled:opacity-40 hover:opacity-90"
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
