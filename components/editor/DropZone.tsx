"use client";

import { useCallback, useRef, useState } from "react";
import { ImagePlus, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  onImage: (image: ImageBitmap, file: File) => void;
  className?: string;
};

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export function DropZone({ onImage, className }: Props) {
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = useCallback(
    async (file: File) => {
      setError(null);
      if (!ACCEPTED.includes(file.type)) {
        setError("That file type isn't supported. JPG, PNG, or WebP only.");
        return;
      }
      try {
        const bmp = await createImageBitmap(file);
        onImage(bmp, file);
      } catch (err) {
        setError("Couldn't decode that image.");
        console.error(err);
      }
    },
    [onImage],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      className={cn(
        "group relative flex h-full w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-elev-1)] text-center transition focus-visible:border-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-accent-glow",
        over && "border-[var(--color-accent)] bg-[var(--color-bg-elev-2)] ring-accent-glow",
        className,
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) void accept(file);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="sr-only"
        // Some browsers fire `click` on the input when a wrapping <label> is
        // clicked, then the input bubbles the click back up to the label,
        // which fires a second click — and in our case Playwright/Chrome saw
        // the picker open multiple times. Stopping propagation here keeps
        // the explicit `onClick` handler above as the single trigger.
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void accept(file);
        }}
      />
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-bg-elev-3)] text-[var(--color-fg-muted)] transition group-hover:bg-[var(--color-bg-elev-2)] group-hover:text-[var(--color-fg)]">
        {over ? <Upload className="h-5 w-5 text-[var(--color-accent)]" /> : <ImagePlus className="h-5 w-5" />}
      </div>
      <div>
        <div className="text-sm font-medium text-[var(--color-fg)]">
          Drop a photo, or click to choose
        </div>
        <div className="mt-1 text-xs text-[var(--color-fg-muted)]">
          JPG, PNG, or WebP — full resolution stays on your device.
        </div>
      </div>
      {error && <div className="mt-2 text-xs text-red-400">{error}</div>}
    </div>
  );
}
